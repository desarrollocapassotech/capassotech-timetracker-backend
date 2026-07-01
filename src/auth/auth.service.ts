import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { DocumentReference, Firestore, getFirestore } from 'firebase-admin/firestore';
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
  async changePassword(uid: string, newPassword: string): Promise<void> {
    const collaboratorRef = await this.findCollaboratorDocByAuthUid(uid);
    if (!collaboratorRef) {
      throw new BadRequestException({
        code: 'auth/no-collaborator-profile',
        message: 'Debes completar tu perfil antes de actualizar la contraseña.',
      });
    }

    await getAuth(this.firebaseApp).updateUser(uid, { password: newPassword });
    // Mantiene en sync el espejo en Firestore (colaboradores.password), igual que hacía
    // DataContext.updateColaborador antes de esta migración.
    await collaboratorRef.set({ password: newPassword }, { merge: true });
  }

  async getProfile(uid: string, email: string): Promise<AuthenticatedUser> {
    return this.resolveUserProfile(uid, email);
  }

  private async findCollaboratorDocByAuthUid(uid: string): Promise<DocumentReference | null> {
    const byId = await this.firestore.collection('colaboradores').doc(uid).get();
    if (byId.exists) {
      return byId.ref;
    }

    const byUidQuery = await this.firestore
      .collection('colaboradores')
      .where('uid', '==', uid)
      .limit(1)
      .get();

    return byUidQuery.empty ? null : byUidQuery.docs[0].ref;
  }

  // Espejo exacto de la lógica de AuthContext.login/onAuthStateChanged: lee
  // /users/{uid}, migra 'role' (string) -> 'roles' (array) si hace falta, y crea el
  // doc con defaults si todavía no existe.
  private async resolveUserProfile(uid: string, email: string): Promise<AuthenticatedUser> {
    const userRef = this.firestore.collection('users').doc(uid);
    const snap = await userRef.get();

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

    const fallback = {
      name: '',
      roles: [UserRole.COLABORADOR],
      hourlyRate: 0,
      email,
    };
    await userRef.set(fallback);
    return { id: uid, ...fallback };
  }
}
