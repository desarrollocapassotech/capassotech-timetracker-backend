// Migración única: copia /projects de Firestore a tracker.projects en Neon (y de
// paso, tracker.project_collaborators para managerIds/teamMemberIds). Idempotente:
// usa upsert por id, así que se puede volver a correr sin duplicar.
//
// IMPORTANTE: este script es de SOLO LECTURA contra Firestore (es la base de
// producción actual). Nunca escribe ahí, solo lee con .get().
//
// Nota sobre managerIds/teamMemberIds: en Firestore estos arrays mezclan, según el
// proyecto, el id de documento del colaborador o su uid de Firebase Auth (legado del
// frontend, que ya resolvía ambos casos). Este script resuelve cada valor contra
// collaborators.id o collaborators.user_id; si no matchea ninguno (colaborador
// borrado/legado), se saltea esa asignación puntual y lo deja loggeado, sin abortar
// la migración completa.
//
// Uso:
//   DATABASE_URL=postgresql://... node scripts/migrate-projects-from-firestore.js [--dry-run]

require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

function normalizeCurrency(value) {
  if (value === 'USD' || value === 'ARS') return value;
  return null;
}

function normalizeBillingType(value) {
  if (value === 'hourly' || value === 'monthly') return value;
  return null;
}

function toNullableString(value) {
  return value === undefined || value === null || value === '' ? null : String(value);
}

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDateOrNull(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value._seconds !== undefined) return new Date(value._seconds * 1000).toISOString();
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
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
  const firebaseApp = initializeApp({ credential: cert(serviceAccount) }, `migration-projects-${Date.now()}`);
  const firestore = getFirestore(firebaseApp);

  const pgClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pgClient.connect();

  const collabRows = await pgClient.query('SELECT id, user_id FROM tracker.collaborators');
  const byCollabId = new Set(collabRows.rows.map((r) => r.id));
  const byCollabUid = new Map(collabRows.rows.filter((r) => r.user_id).map((r) => [r.user_id, r.id]));

  function resolveCollaboratorId(rawId) {
    if (byCollabId.has(rawId)) return rawId;
    if (byCollabUid.has(rawId)) return byCollabUid.get(rawId);
    return null;
  }

  const snapshot = await firestore.collection('projects').get();
  console.log(`Encontrados ${snapshot.size} proyectos en Firestore.`);

  let migrated = 0;
  let skipped = 0;
  let skippedAssignments = 0;

  await pgClient.query('BEGIN');
  try {
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const id = doc.id;

      if (!data.name) {
        console.warn(`SKIP ${id}: falta name`);
        skipped += 1;
        continue;
      }

      const createdAt = toDateOrNull(data.createdAt);

      await pgClient.query(
        `INSERT INTO tracker.projects (
           id, name, active, rate, currency, contract_end_date, billing_type,
           client_id, jira_ids, billable_hours_limit, created_at
         ) VALUES (
           $1, $2, $3, $4, $5::tracker.billing_currency, $6, $7::tracker.project_billing_type,
           $8, $9, $10, COALESCE($11::timestamptz, now())
         )
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           active = EXCLUDED.active,
           rate = EXCLUDED.rate,
           currency = EXCLUDED.currency,
           contract_end_date = EXCLUDED.contract_end_date,
           billing_type = EXCLUDED.billing_type,
           client_id = EXCLUDED.client_id,
           jira_ids = EXCLUDED.jira_ids,
           billable_hours_limit = EXCLUDED.billable_hours_limit,
           updated_at = now()`,
        [
          id,
          data.name,
          data.active !== false,
          toNumberOrNull(data.rate),
          normalizeCurrency(data.currency),
          toNullableString(data.contractEndDate),
          normalizeBillingType(data.billingType),
          toNullableString(data.clientId),
          Array.isArray(data.jiraIds) ? data.jiraIds : [],
          toNumberOrNull(data.billableHoursLimit ?? data.hoursLimit ?? data.monthlyHoursLimit),
          createdAt,
        ],
      );

      // Reemplaza las asignaciones de manager/team member para este proyecto.
      await pgClient.query(
        "DELETE FROM tracker.project_collaborators WHERE project_id = $1 AND role = 'manager'",
        [id],
      );
      await pgClient.query(
        "DELETE FROM tracker.project_collaborators WHERE project_id = $1 AND role = 'team_member'",
        [id],
      );

      const managerIds = [...new Set(data.managerIds || [])];
      const teamMemberIds = [...new Set(data.teamMemberIds || [])];

      for (const rawId of managerIds) {
        const resolvedId = resolveCollaboratorId(rawId);
        if (!resolvedId) {
          console.warn(`SKIP assignment: manager ${rawId} en proyecto "${data.name}" (${id}) no resuelve a ningún colaborador`);
          skippedAssignments += 1;
          continue;
        }
        await pgClient.query(
          `INSERT INTO tracker.project_collaborators (project_id, collaborator_id, role)
           VALUES ($1, $2, 'manager') ON CONFLICT DO NOTHING`,
          [id, resolvedId],
        );
      }

      for (const rawId of teamMemberIds) {
        const resolvedId = resolveCollaboratorId(rawId);
        if (!resolvedId) {
          console.warn(`SKIP assignment: team member ${rawId} en proyecto "${data.name}" (${id}) no resuelve a ningún colaborador`);
          skippedAssignments += 1;
          continue;
        }
        await pgClient.query(
          `INSERT INTO tracker.project_collaborators (project_id, collaborator_id, role)
           VALUES ($1, $2, 'team_member') ON CONFLICT DO NOTHING`,
          [id, resolvedId],
        );
      }

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

  console.log(`Migrados: ${migrated}. Saltados: ${skipped}. Asignaciones saltadas (refs huérfanas): ${skippedAssignments}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
