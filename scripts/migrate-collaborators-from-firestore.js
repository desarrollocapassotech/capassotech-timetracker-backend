// Migración única: copia /colaboradores de Firestore a tracker.collaborators en
// Neon (y de paso, tracker.app_users, requerido por la FK collaborators.user_id).
// Idempotente: usa upsert por id, así que se puede volver a correr sin duplicar.
//
// Uso:
//   DATABASE_URL=postgresql://... node scripts/migrate-collaborators-from-firestore.js [--dry-run]
//
// Requiere FIREBASE_SERVICE_ACCOUNT_PATH (o firebase-service-account.json en la
// raíz del backend) para leer Firestore, y DATABASE_URL apuntando a la rama de
// Neon destino (develop o production).

require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

const VALID_ROLES = [
  'colaborador',
  'admin',
  'project_manager',
  'client',
  'contable',
  'analista_funcional',
  'qa_tester',
];

function normalizeRoles(data) {
  if (Array.isArray(data.roles) && data.roles.length) {
    const filtered = data.roles.filter((r) => VALID_ROLES.includes(r));
    if (filtered.length) return filtered;
  }
  if (typeof data.role === 'string' && VALID_ROLES.includes(data.role)) {
    return [data.role];
  }
  return ['colaborador'];
}

function normalizeCurrency(value) {
  return value === 'ARS' ? 'ARS' : 'USD';
}

function toNullableString(value) {
  return value === undefined || value === null || value === '' ? null : String(value);
}

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
  const firebaseApp = initializeApp({ credential: cert(serviceAccount) }, `migration-${Date.now()}`);
  const firestore = getFirestore(firebaseApp);

  const pgClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pgClient.connect();

  const snapshot = await firestore.collection('colaboradores').get();
  console.log(`Encontrados ${snapshot.size} colaboradores en Firestore.`);

  let migrated = 0;
  let skipped = 0;

  await pgClient.query('BEGIN');
  try {
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const id = doc.id;
      const uid = typeof data.uid === 'string' && data.uid ? data.uid : null;
      const roles = normalizeRoles(data);
      const hourlyRate = toNumberOrNull(data.hourlyRate) ?? 0;
      const startedDate = typeof data.startedDate === 'string' && data.startedDate ? data.startedDate : null;

      if (!data.name || !startedDate) {
        console.warn(`SKIP ${id}: falta name o startedDate (name=${data.name}, startedDate=${data.startedDate})`);
        skipped += 1;
        continue;
      }

      if (uid) {
        const email = data.workEmail || data.personalEmail || `${id}@sin-email.capassotech.local`;
        await pgClient.query(
          `INSERT INTO tracker.app_users (id, email, name, roles, hourly_rate)
           VALUES ($1, $2, $3, $4::tracker.user_role[], $5)
           ON CONFLICT (id) DO UPDATE SET
             email = EXCLUDED.email,
             name = EXCLUDED.name,
             roles = EXCLUDED.roles,
             hourly_rate = EXCLUDED.hourly_rate,
             updated_at = now()`,
          [uid, email, data.name, roles, hourlyRate],
        );
      }

      await pgClient.query(
        `INSERT INTO tracker.collaborators (
           id, user_id, name, personal_email, work_email, password, hourly_rate, currency,
           exchange_rate, active, started_date, birth_date, payment_method, phone, city,
           address, floor, province, postal_code, cbu_cvu, roles, show_financial_values,
           profile_image_url
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8::tracker.billing_currency, $9, $10, $11, $12, $13,
           $14, $15, $16, $17, $18, $19, $20, $21::tracker.user_role[], $22, $23
         )
         ON CONFLICT (id) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           name = EXCLUDED.name,
           personal_email = EXCLUDED.personal_email,
           work_email = EXCLUDED.work_email,
           password = EXCLUDED.password,
           hourly_rate = EXCLUDED.hourly_rate,
           currency = EXCLUDED.currency,
           exchange_rate = EXCLUDED.exchange_rate,
           active = EXCLUDED.active,
           started_date = EXCLUDED.started_date,
           birth_date = EXCLUDED.birth_date,
           payment_method = EXCLUDED.payment_method,
           phone = EXCLUDED.phone,
           city = EXCLUDED.city,
           address = EXCLUDED.address,
           floor = EXCLUDED.floor,
           province = EXCLUDED.province,
           postal_code = EXCLUDED.postal_code,
           cbu_cvu = EXCLUDED.cbu_cvu,
           roles = EXCLUDED.roles,
           show_financial_values = EXCLUDED.show_financial_values,
           profile_image_url = EXCLUDED.profile_image_url,
           updated_at = now()`,
        [
          id,
          uid,
          data.name,
          toNullableString(data.personalEmail),
          toNullableString(data.workEmail),
          toNullableString(data.password),
          hourlyRate,
          normalizeCurrency(data.currency),
          toNumberOrNull(data.exchangeRate),
          data.active !== false,
          startedDate,
          toNullableString(data.birthDate),
          toNullableString(data.paymentMethod),
          toNullableString(data.phone),
          toNullableString(data.city),
          toNullableString(data.address),
          toNullableString(data.floor),
          toNullableString(data.province),
          toNullableString(data.postalCode),
          toNullableString(data.cbuCvu),
          roles,
          data.showFinancialValues !== false,
          toNullableString(data.profileImageUrl),
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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
