import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabla de diagnóstico, fuera del modelo de negocio aprobado. Se usa desde
 * GET /health/db para probar que el backend puede escribir y leer contra la
 * base real en cada entorno.
 */
export class AddHealthChecks1735750100000 implements MigrationInterface {
  name = 'AddHealthChecks1735750100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
CREATE TABLE IF NOT EXISTS tracker.health_checks (
  id          TEXT PRIMARY KEY,
  note        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tracker.health_checks IS
  'Tabla de diagnóstico, no forma parte del modelo de negocio. Usada por GET /health/db para validar conectividad de escritura/lectura.';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS tracker.health_checks;`);
  }
}
