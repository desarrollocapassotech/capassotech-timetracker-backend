import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

// tracker.health_checks: tabla de diagnóstico (no forma parte del modelo de negocio
// aprobado). Se usa solo para probar que el backend puede escribir y leer contra la
// base real, vía GET /health/db (ver src/health).
@Entity({ name: 'health_checks', schema: 'tracker' })
export class HealthCheckEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text' })
  note: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
