import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { UserRole } from './enums';

// tracker.app_users <- Firestore /users (perfil liviano de auth/rol, keyed por Firebase Auth UID)
@Entity({ name: 'app_users', schema: 'tracker' })
export class AppUserEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text', unique: true })
  email: string;

  @Column({ type: 'text', default: '' })
  name: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    enumName: 'user_role',
    array: true,
    default: [UserRole.COLABORADOR],
  })
  roles: UserRole[];

  // numeric: node-postgres devuelve string para no perder precisión con decimales
  @Column({ name: 'hourly_rate', type: 'numeric', precision: 12, scale: 2, default: 0 })
  hourlyRate: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
