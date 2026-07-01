import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { TaskBillingType } from './enums';

// tracker.time_entries <- Firestore /timeEntries
// FKs a collaborators/projects usan ON DELETE RESTRICT (decisión deliberada, ver database/README.md).
@Entity({ name: 'time_entries', schema: 'tracker' })
export class TimeEntryEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'collaborator_id', type: 'text' })
  collaboratorId: string;

  // Snapshot denormalizado, igual que en Firestore.
  @Column({ name: 'collaborator_name', type: 'text' })
  collaboratorName: string;

  @Column({ name: 'task_id', type: 'text' })
  taskId: string;

  @Column({ name: 'task_title', type: 'text' })
  taskTitle: string;

  @Column({ name: 'project_id', type: 'text' })
  projectId: string;

  // Snapshot denormalizado, igual que en Firestore.
  @Column({ name: 'project_name', type: 'text' })
  projectName: string;

  // Día calendario (medianoche local), no timestamp.
  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'numeric', precision: 6, scale: 2 })
  hours: string;

  @Column({ type: 'text', nullable: true })
  comments: string | null;

  @Column({
    name: 'task_billing_type',
    type: 'enum',
    enum: TaskBillingType,
    enumName: 'task_billing_type',
    default: TaskBillingType.FEATURE,
  })
  taskBillingType: TaskBillingType;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
