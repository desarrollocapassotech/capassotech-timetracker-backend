import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { Repository } from 'typeorm';
import { ClientEntity, CollaboratorEntity } from '../database/entities';
import { mapIdentityToolkitError } from './auth-error.util';
import { FIREBASE_ADMIN } from './firebase-admin.provider';
import { IdentityToolkitClient, IdentityToolkitException } from './identity-toolkit.client';
import { AuthenticatedUser, LoginResult, UserRole } from './auth.types';

@Injectable()
export class AuthService {
  private readonly firestore: Firestore;

  constructor(
    @Inject(FIREBASE_ADMIN) private readonly firebaseApp: App,
    private readonly identityToolkit: IdentityToolkitClient,
    @InjectRepository(CollaboratorEntity)
    private readonly collaboratorRepository: Repository<CollaboratorEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepository: Repository<ClientEntity>,
  ) {
    this.firestore = getFirestore(firebaseApp);
  }

  async login(email: string, password: string): Promise<LoginResult> {
    let result: Awaited<ReturnType<IdentityToolkitClient['signInWithPassword']>>;
    try {
      result = await this.identityToolkit.signInWithPassword(email, password);
    } catch {
      // Igual que el comportamiento previo del frontend: no se distingue el motivo
      // exacto (email inexistente vs contraseña incorrecta) para no filtrar información.
      throw new UnauthorizedException('Email o contraseña incorrectos');
    }

    const user = await this.resolveUserProfile(result.localId, result.email);
    return {
      idToken: result.idToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      user,
    };
  }

  async refresh(refreshToken: string) {
    try {
      const result = await this.identityToolkit.refreshIdToken(refreshToken);
      return {
        idToken: result.id_token,
        refreshToken: result.refresh_token,
        expiresIn: result.expires_in,
      };
    } catch {
      throw new UnauthorizedException('No se pudo renovar la sesión. Iniciá sesión nuevamente.');
    }
  }

  // Invalidación del lado servidor: revoca todos los refresh tokens del usuario.
  // El frontend además descarta su copia local de idToken/refreshToken.
  async logout(uid: string): Promise<void> {
    await getAuth(this.firebaseApp).revokeRefreshTokens(uid);
  }

  async forgotPassword(email: string): Promise<void> {
    try {
      await this.identityToolkit.sendPasswordResetEmail(email);
    } catch (error) {
      if (error instanceof IdentityToolkitException) {
        const mapped = mapIdentityToolkitError(error.identityToolkitCode);
        throw new BadRequestException(mapped);
      }
      throw error;
    }
  }

  // Igual que el comportamiento previo: solo disponible para colaboradores, y no pide
  // la contraseña actual (queda documentado como deuda de UX/seguridad para otra tarea).
  // Desde la migración de colaboradores a Neon, la fuente del espejo de password pasó
  // de Firestore a tracker.collaborators.
  async changePassword(uid: string, newPassword: string): Promise<void> {
    const collaborator = await this.collaboratorRepository.findOneBy({ userId: uid });
    if (!collaborator) {
      throw new BadRequestException({
        code: 'auth/no-collaborator-profile',
        message: 'Debes completar tu perfil antes de actualizar la contraseña.',
      });
    }

    await this.setFirebaseUserPassword(uid, newPassword);
    collaborator.password = newPassword;
    await this.collaboratorRepository.save(collaborator);
  }

  async getProfile(uid: string, email: string): Promise<AuthenticatedUser> {
    return this.resolveUserProfile(uid, email);
  }

  // Usado por CollaboratorsService al dar de alta un colaborador con acceso propio.
  async createFirebaseUser(email: string, password: string): Promise<string> {
    try {
      const user = await getAuth(this.firebaseApp).createUser({ email, password });
      return user.uid;
    } catch (error) {
      throw new BadRequestException(this.mapCreateUserError(error));
    }
  }

  // Usado por CollaboratorsService cuando un admin resetea la contraseña de un colaborador.
  async setFirebaseUserPassword(uid: string, password: string): Promise<void> {
    try {
      await getAuth(this.firebaseApp).updateUser(uid, { password });
    } catch (error) {
      throw new BadRequestException(this.mapCreateUserError(error));
    }
  }

  private mapCreateUserError(error: unknown): string {
    const code = typeof error === 'object' && error !== null ? (error as { code?: string }).code : undefined;
    switch (code) {
      case 'auth/email-already-exists':
        return 'Ya existe una cuenta con ese email.';
      case 'auth/invalid-password':
      case 'auth/weak-password':
        return 'La contraseña debe tener al menos 6 caracteres.';
      case 'auth/invalid-email':
        return 'El email no tiene un formato válido.';
      default:
        return 'No se pudo crear/actualizar la cuenta de acceso.';
    }
  }

  // Resuelve el perfil autenticado. Si el usuario es colaborador o cliente, Neon
  // (tracker.collaborators / tracker.clients) es la fuente autoritativa desde sus
  // respectivas migraciones. Si no (cuenta todavía no migrada), se mantiene el
  // comportamiento previo leyendo Firestore /users/{uid} (solo lectura).
  private async resolveUserProfile(uid: string, email: string): Promise<AuthenticatedUser> {
    const collaborator = await this.collaboratorRepository.findOneBy({ userId: uid });
    if (collaborator) {
      return {
        id: uid,
        email,
        name: collaborator.name,
        roles: collaborator.roles,
        hourlyRate: Number(collaborator.hourlyRate),
      };
    }

    const client = await this.clientRepository.findOneBy({ userId: uid });
    if (client) {
      // Los clientes siempre tienen el único rol 'client' y no manejan sueldo,
      // igual que el espejo que antes se escribía a mano en Firestore /users/{uid}.
      return {
        id: uid,
        email,
        name: client.name,
        roles: [UserRole.CLIENT],
        hourlyRate: 0,
      };
    }

    return this.resolveUserProfileFromFirestore(uid, email);
  }

  // Fallback de solo lectura para cuentas que todavía no son colaboradores en Neon
  // (por ejemplo, clientes). Firestore es la base de producción actual: el backend
  // nunca escribe ahí, solo lee. Si el doc /users/{uid} no existe, se devuelve un
  // perfil por defecto en memoria, sin crear nada en Firestore.
  private async resolveUserProfileFromFirestore(uid: string, email: string): Promise<AuthenticatedUser> {
    const snap = await this.firestore.collection('users').doc(uid).get();

    if (snap.exists) {
      const data = snap.data() as Record<string, unknown>;
      let roles: UserRole[];
      if (Array.isArray(data.roles)) {
        roles = data.roles as UserRole[];
      } else if (typeof data.role === 'string') {
        roles = [data.role as UserRole];
      } else {
        roles = [UserRole.COLABORADOR];
      }

      return {
        id: uid,
        email: (data.email as string) || email,
        name: (data.name as string) || '',
        roles,
        hourlyRate: typeof data.hourlyRate === 'number' ? data.hourlyRate : 0,
      };
    }

    return {
      id: uid,
      name: '',
      roles: [UserRole.COLABORADOR],
      hourlyRate: 0,
      email,
    };
  }
}
