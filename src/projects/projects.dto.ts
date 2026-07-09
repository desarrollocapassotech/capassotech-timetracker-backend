import { BillingCurrency, ProjectBillingType } from '../database/entities';

export interface CreateProjectDto {
  name: string;
  active?: boolean;
  rate?: number | null;
  currency?: BillingCurrency | null;
  billingType?: ProjectBillingType | null;
  clientId?: string | null;
  jiraIds?: string[];
  billableHoursLimit?: number | null;
  managerIds?: string[];
  teamMemberIds?: string[];
}

// Todos los campos son opcionales: solo se aplican los que vienen en el body.
export type UpdateProjectDto = Partial<CreateProjectDto>;

// Entregable de un proyecto: 0..N por proyecto, cada uno con su propia fecha.
export interface ProjectDeliverableDto {
  name: string;
  dueDate: string;
}

export interface ReplaceProjectDeliverablesDto {
  deliverables: ProjectDeliverableDto[];
}
