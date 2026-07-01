import { BillingCurrency, UserRole } from '../database/entities';

export interface CreateCollaboratorDto {
  name: string;
  personalEmail?: string | null;
  workEmail?: string | null;
  password?: string | null;
  hourlyRate: number;
  currency?: BillingCurrency;
  exchangeRate?: number | null;
  active?: boolean;
  startedDate: string;
  birthDate?: string | null;
  paymentMethod?: string | null;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  floor?: string | null;
  province?: string | null;
  postalCode?: string | null;
  cbuCvu?: string | null;
  roles?: UserRole[];
  showFinancialValues?: boolean;
  profileImageUrl?: string | null;
}

// Todos los campos son opcionales: el set efectivo que se aplica depende del rol
// de quien hace la request (ver collaborators.service.ts -> pickAllowedFields).
export type UpdateCollaboratorDto = Partial<CreateCollaboratorDto>;
