// Migración única: copia /timeEntries de Firestore a tracker.time_entries en Neon.
// Idempotente: usa upsert por id, así que se puede volver a correr sin duplicar.
//
// IMPORTANTE: este script es de SOLO LECTURA contra Firestore (es la base de
// producción actual). Nunca escribe ahí, solo lee con .get().
//
// Casos que se saltean (con log), porque no se puede satisfacer NOT NULL / FK:
//  - projectId vacío o inexistente en Neon (registros históricos incompletos).
//  - colaboradorId que no resuelve contra collaborators.id ni collaborators.user_id
//    (colaborador borrado / referencia legada rota).
//
// Uso:
//   DATABASE_URL=postgresql://... node scripts/migrate-time-entries-from-firestore.js [--dry-run]

require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

const VALID_BILLING_TYPES = ['feature', 'internal_bug', 'external_bug', 'internal_meeting', 'external_meeting'];

function normalizeBillingType(value) {
  return VALID_BILLING_TYPES.includes(value) ? value : 'feature';
}

function toDateOnly(value) {
  if (!value) return null;
  let d;
  if (typeof value.toDate === 'function') d = value.toDate();
  else if (value._seconds !== undefined) d = new Date(value._seconds * 1000);
  else if (typeof value === 'string') d = new Date(value);
  else return null;
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

function toTimestamp(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value._seconds !== undefined) return new Date(value._seconds * 1000).toISOString();
  if (typeof value === 'string') return value;
  return null;
}

function resolveServiceAccountPath() {
  const relative = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 'firebase-service-account.json';
  return path.isAbsolute(relative) ? relative : path.join(process.cwd(), relative);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (!process.env.DATABASE_URL) {
    throw new Error('Falta DATABASE_URL en el entorno.');
  }

  const serviceAccount = JSON.parse(fs.readFileSync(resolveServiceAccountPath(), 'utf8'));
  const firebaseApp = initializeApp({ credential: cert(serviceAccount) }, `migration-time-entries-${Date.now()}`);
  const firestore = getFirestore(firebaseApp);

  const pgClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pgClient.connect();

  const collabRows = await pgClient.query('SELECT id, user_id FROM tracker.collaborators');
  const byCollabId = new Set(collabRows.rows.map((r) => r.id));
  const byCollabUid = new Map(collabRows.rows.filter((r) => r.user_id).map((r) => [r.user_id, r.id]));
  const projectRows = await pgClient.query('SELECT id FROM tracker.projects');
  const projectIds = new Set(projectRows.rows.map((r) => r.id));

  function resolveCollaboratorId(rawId) {
    if (byCollabId.has(rawId)) return rawId;
    if (byCollabUid.has(rawId)) return byCollabUid.get(rawId);
    return null;
  }

  const snapshot = await firestore.collection('timeEntries').get();
  console.log(`Encontradas ${snapshot.size} horas cargadas en Firestore.`);

  let migrated = 0;
  let skipped = 0;
  const skippedReasons = [];

  await pgClient.query('BEGIN');
  try {
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const id = doc.id;

      const collaboratorId = resolveCollaboratorId(data.colaboradorId);
      if (!collaboratorId) {
        skipped += 1;
        skippedReasons.push(`${id}: colaboradorId "${data.colaboradorId}" (${data.colaboradorName}) no resuelve a ningún colaborador`);
        continue;
      }

      const projectId = data.projectId || null;
      if (!projectId || !projectIds.has(projectId)) {
        skipped += 1;
        skippedReasons.push(`${id}: projectId "${data.projectId}" vacío o inexistente (proyecto "${data.projectName}")`);
        continue;
      }

      const date = toDateOnly(data.date);
      if (!date) {
        skipped += 1;
        skippedReasons.push(`${id}: date inválida`);
        continue;
      }

      const createdAt = toTimestamp(data.createdAt);

      await pgClient.query(
        `INSERT INTO tracker.time_entries (
           id, collaborator_id, collaborator_name, task_id, task_title, project_id,
           project_name, date, hours, comments, task_billing_type, created_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::tracker.task_billing_type,
           COALESCE($12::timestamptz, now())
         )
         ON CONFLICT (id) DO UPDATE SET
           collaborator_id = EXCLUDED.collaborator_id,
           collaborator_name = EXCLUDED.collaborator_name,
           task_id = EXCLUDED.task_id,
           task_title = EXCLUDED.task_title,
           project_id = EXCLUDED.project_id,
           project_name = EXCLUDED.project_name,
           date = EXCLUDED.date,
           hours = EXCLUDED.hours,
           comments = EXCLUDED.comments,
           task_billing_type = EXCLUDED.task_billing_type`,
        [
          id,
          collaboratorId,
          data.colaboradorName || '',
          data.taskId || '',
          data.taskTitle || '',
          projectId,
          data.projectName || '',
          date,
          data.hours,
          data.comments || null,
          normalizeBillingType(data.taskBillingType),
          createdAt,
        ],
      );

      migrated += 1;
    }

    if (dryRun) {
      console.log('DRY RUN: se revierte la transacción, no se escribió nada.');
      await pgClient.query('ROLLBACK');
    } else {
      await pgClient.query('COMMIT');
    }
  } catch (error) {
    await pgClient.query('ROLLBACK');
    throw error;
  } finally {
    await pgClient.end();
  }

  console.log(`Migrados: ${migrated}. Saltados: ${skipped}.`);
  if (skippedReasons.length) {
    console.log('\nDetalle de saltados:');
    skippedReasons.forEach((r) => console.log(' -', r));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
