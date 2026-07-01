import { Entity, PrimaryColumn } from 'typeorm';
import { ProjectCollaboratorRole } from './enums';

// tracker.project_collaborators: reemplaza a project_managers + project_team_members.
// Project.managerIds -> role=manager; Project.teamMemberIds -> role=team_member.
@Entity({ name: 'project_collaborators', schema: 'tracker' })
export class ProjectCollaboratorEntity {
  @PrimaryColumn({ name: 'project_id', type: 'text' })
  projectId: string;

  @PrimaryColumn({ name: 'collaborator_id', type: 'text' })
  collaboratorId: string;

  @PrimaryColumn({ type: 'enum', enum: ProjectCollaboratorRole, enumName: 'project_collaborator_role' })
  role: ProjectCollaboratorRole;
}
