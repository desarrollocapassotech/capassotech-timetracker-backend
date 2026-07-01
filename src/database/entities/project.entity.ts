import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { BillingCurrency, ProjectBillingType } from './enums';

// tracker.projects <- Firestore /projects
@Entity({ name: 'projects', schema: 'tracker' })
export class ProjectEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  rate: string | null;

  @Column({ type: 'enum', enum: BillingCurrency, enumName: 'billing_currency', nullable: true })
  currency: BillingCurrency | null;

  @Column({ name: 'contract_end_date', type: 'date', nullable: true })
  contractEndDate: string | null;

  // Nullable: si falta, el frontend asume 'hourly' (misma regla que hoy, resuelta en la app).
  @Column({ name: 'billing_type', type: 'enum', enum: ProjectBillingType, enumName: 'project_billing_type', nullable: true })
  billingType: ProjectBillingType | null;

  @Column({ name: 'client_id', type: 'text', nullable: true })
  clientId: string | null;

  @Column({ name: 'jira_ids', type: 'text', array: true, default: '{}' })
  jiraIds: string[];

  @Column({ name: 'billable_hours_limit', type: 'numeric', precision: 12, scale: 2, nullable: true })
  billableHoursLimit: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
