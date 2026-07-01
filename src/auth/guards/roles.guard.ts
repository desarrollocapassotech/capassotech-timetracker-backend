import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../auth.types';
import { AuthenticatedRequest } from './firebase-auth.guard';

// Se usa junto a FirebaseAuthGuard (que debe correr antes y poblar request.user).
// Resuelve los roles del usuario en cada request contra Firestore (misma fuente que
// hoy) en vez de confiar en claims embebidos en el token, para evitar que un cambio
// de rol quede desactualizado hasta que el token expire.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const profile = await this.authService.getProfile(request.user.uid, request.user.email);

    const hasRole = profile.roles.some((role) => requiredRoles.includes(role));
    if (!hasRole) {
      throw new ForbiddenException('No tenés permisos para realizar esta acción.');
    }

    return true;
  }
}
