import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// tracker.collaborator_project_rates: valor hora especial de un colaborador para un
// proyecto puntual. Pisa collaborators.hourly_rate (la tarifa base) solo para ese
// proyecto; misma moneda que collaborators.currency (no tiene moneda propia).
@Entity({ name: 'collaborator_project_rates', schema: 'tracker' })
export class CollaboratorProjectRateEntity {
  @PrimaryColumn({ name: 'collaborator_id', type: 'text' })
  collaboratorId: string;

  @PrimaryColumn({ name: 'project_id', type: 'text' })
  projectId: string;

  @Column({ name: 'hourly_rate', type: 'numeric', precision: 12, scale: 2 })
  hourlyRate: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
