import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Request } from 'express';
import { FIREBASE_ADMIN } from '../firebase-admin.provider';

export interface AuthenticatedRequest extends Request {
  user: { uid: string; email: string };
}

// Verifica el idToken de Firebase (Bearer) contra Firebase Auth. Reemplaza, del
// lado servidor, lo que antes garantizaba implícitamente el SDK de cliente al tener
// una sesión activa.
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(@Inject(FIREBASE_ADMIN) private readonly firebaseApp: App) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Falta el token de autenticación.');
    }

    const idToken = authHeader.slice('Bearer '.length);

    try {
      const decoded = await getAuth(this.firebaseApp).verifyIdToken(idToken);
      request.user = { uid: decoded.uid, email: decoded.email ?? '' };
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado.');
    }
  }
}
