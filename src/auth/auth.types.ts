import { UserRole } from '../database/entities';

export { UserRole };

// Espejo de AuthContext.tsx -> User (frontend), resuelto hoy desde Firestore
// /users/{uid}. Se mantiene Firestore como fuente de datos de roles en esta tarea
// porque todavía no se migraron los datos reales de usuarios/colaboradores/clientes
// a Neon (ver database/README.md); cuando esa migración exista, este resolver debería
// apuntar a tracker.app_users en su lugar.
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  roles: UserRole[];
  hourlyRate: number;
}

export interface LoginResult {
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  user: AuthenticatedUser;
}
