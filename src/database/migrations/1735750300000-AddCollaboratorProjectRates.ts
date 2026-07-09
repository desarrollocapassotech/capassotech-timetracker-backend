import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hasta ahora un colaborador tenía un único valor hora (collaborators.hourly_rate)
 * aplicado a todos los proyectos en los que trabaja. Esta tabla permite pisar ese
 * valor base para proyectos puntuales (ej: Fede cobra 5 USD/h en general, pero 8
 * USD/h en INEE y EPEFI). Misma convención que project_collaborators: PK compuesta
 * + ON DELETE CASCADE de los dos lados (si se borra el colaborador o el proyecto,
 * desaparece el override, no bloquea el borrado).
 */
export class AddCollaboratorProjectRates1735750300000 implements MigrationInterface {
  name = 'AddCollaboratorProjectRates1735750300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
CREATE TABLE IF NOT EXISTS tracker.collaborator_project_rates (
  collaborator_id TEXT NOT NULL REFERENCES tracker.collaborators(id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES tracker.projects(id) ON DELETE CASCADE,
  hourly_rate     NUMERIC(12,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collaborator_id, project_id)
);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS tracker.collaborator_project_rates;`);
  }
}
