import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El volcado a Google Sheets (reporting) era "best-effort" y solo se disparaba
 * al crear un registro: si el webhook fallaba (o si el registro se editaba o
 * borraba después), no había forma de saber qué horas faltaban en la hoja ni
 * de reintentarlas. Estas columnas llevan el estado de sincronización por
 * registro para que un job periódico pueda reintentar únicamente lo pendiente.
 *
 * Backfill: se marca todo lo existente como ya sincronizado (con su propio
 * created_at) porque no hay forma de leer la hoja desde acá para confirmarlo;
 * la garantía de "siempre sincronizado" aplica desde acá en adelante.
 */
export class AddTimeEntrySheetSync1735750200000 implements MigrationInterface {
  name = 'AddTimeEntrySheetSync1735750200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
ALTER TABLE tracker.time_entries
  ADD COLUMN IF NOT EXISTS sheet_synced_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS sheet_sync_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sheet_sync_last_error TEXT NULL;

UPDATE tracker.time_entries SET sheet_synced_at = created_at WHERE sheet_synced_at IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
ALTER TABLE tracker.time_entries
  DROP COLUMN IF EXISTS sheet_synced_at,
  DROP COLUMN IF EXISTS sheet_sync_attempts,
  DROP COLUMN IF EXISTS sheet_sync_last_error;
    `);
  }
}
