import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reemplaza projects.contract_end_date (una única fecha de vencimiento por
 * proyecto) por tracker.project_deliverables: 0..N entregables por proyecto,
 * cada uno con su propio nombre y fecha. Backfill: cada proyecto con
 * contract_end_date seteado pasa a tener un entregable "Entrega" con esa
 * fecha, para no perder el dato antes de borrar la columna vieja.
 */
export class AddProjectDeliverables1735750400000 implements MigrationInterface {
  name = 'AddProjectDeliverables1735750400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
CREATE TABLE IF NOT EXISTS tracker.project_deliverables (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES tracker.projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  due_date    DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
    `);

    const projectsWithDeadline: Array<{ id: string; contract_end_date: string }> = await queryRunner.query(
      `SELECT id, contract_end_date FROM tracker.projects WHERE contract_end_date IS NOT NULL`,
    );

    for (const project of projectsWithDeadline) {
      await queryRunner.query(
        `INSERT INTO tracker.project_deliverables (id, project_id, name, due_date) VALUES ($1, $2, $3, $4)`,
        [randomUUID(), project.id, 'Entrega', project.contract_end_date],
      );
    }

    await queryRunner.query(`ALTER TABLE tracker.projects DROP COLUMN contract_end_date;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tracker.projects ADD COLUMN contract_end_date DATE NULL;`);

    // El modelo viejo solo soporta una fecha por proyecto: restaura la más
    // próxima (mínima) de los entregables que hubiera cargados.
    const earliestDeliverables: Array<{ project_id: string; due_date: string }> = await queryRunner.query(`
      SELECT DISTINCT ON (project_id) project_id, due_date
      FROM tracker.project_deliverables
      ORDER BY project_id, due_date ASC
    `);

    for (const deliverable of earliestDeliverables) {
      await queryRunner.query(`UPDATE tracker.projects SET contract_end_date = $1 WHERE id = $2`, [
        deliverable.due_date,
        deliverable.project_id,
      ]);
    }

    await queryRunner.query(`DROP TABLE IF EXISTS tracker.project_deliverables;`);
  }
}
