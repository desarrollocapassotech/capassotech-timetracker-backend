import { BillingCurrency, ProjectBillingType } from '../database/entities';

export interface CreateProjectDto {
  name: string;
  active?: boolean;
  rate?: number | null;
  currency?: BillingCurrency | null;
  contractEndDate?: string | null;
  billingType?: ProjectBillingType | null;
  clientId?: string | null;
  jiraIds?: string[];
  billableHoursLimit?: number | null;
  managerIds?: string[];
  teamMemberIds?: string[];
}

// Todos los campos son opcionales: solo se aplican los que vienen en el body.
export type UpdateProjectDto = Partial<CreateProjectDto>;
