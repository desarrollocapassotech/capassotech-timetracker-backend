import { TicketEmpresa, TicketOrigin, TicketPriority } from './ticket.enums';

export interface CreateTicketDto {
  empresa: TicketEmpresa;
  sistema: string;
  asunto: string;
  descripcion: string;
  prioridad: TicketPriority;
  clienteNombre: string;
  clienteEmail: string;
  origen: TicketOrigin;
}

export interface CreateTicketMessageDto {
  mensaje: string;
}

export interface TicketClientProfileDto {
  email: string;
  nombre: string;
  empresa: TicketEmpresa;
  sistemaHabitual?: string;
}
