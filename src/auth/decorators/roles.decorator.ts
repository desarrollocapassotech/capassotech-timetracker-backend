import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../auth.types';

export const ROLES_KEY = 'roles';

// Uso: @Roles(UserRole.ADMIN, UserRole.CONTABLE) sobre un endpoint protegido con
// FirebaseAuthGuard + RolesGuard. Reemplaza, del lado servidor, las verificaciones
// hasRole/hasAnyRole que hoy solo existen en el frontend (ProtectedRoute.tsx).
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
