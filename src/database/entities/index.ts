import { AppUserEntity } from './app-user.entity';
import { ClientFunctionalAnalystEntity } from './client-functional-analyst.entity';
import { ClientEntity } from './client.entity';
import { CollaboratorEntity } from './collaborator.entity';
import { HealthCheckEntity } from './health-check.entity';
import { ProjectCollaboratorEntity } from './project-collaborator.entity';
import { ProjectEntity } from './project.entity';
import { TimeEntryEntity } from './time-entry.entity';
import { TicketAttachmentEntity } from './ticket-attachment.entity';
import { TicketEntity } from './ticket.entity';
import { TicketMessageEntity } from './ticket-message.entity';

export * from './app-user.entity';
export * from './client-functional-analyst.entity';
export * from './client.entity';
export * from './collaborator.entity';
export * from './enums';
export * from './health-check.entity';
export * from './project-collaborator.entity';
export * from './project.entity';
export * from './time-entry.entity';
export * from './ticket-attachment.entity';
export * from './ticket.entity';
export * from './ticket-message.entity';

export const entities = [
  AppUserEntity,
  CollaboratorEntity,
  ClientEntity,
  ProjectEntity,
  ProjectCollaboratorEntity,
  ClientFunctionalAnalystEntity,
  TimeEntryEntity,
  HealthCheckEntity,
  TicketEntity,
  TicketMessageEntity,
  TicketAttachmentEntity,
];
