import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// tracker.project_deliverables: 0..N entregables por proyecto, cada uno con su
// propia fecha de vencimiento. Reemplaza projects.contract_end_date, que solo
// permitía una única fecha por proyecto.
@Entity({ name: 'project_deliverables', schema: 'tracker' })
export class ProjectDeliverableEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'project_id', type: 'text' })
  projectId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
