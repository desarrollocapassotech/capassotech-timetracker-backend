// Migración única: copia /clients de Firestore a tracker.clients en Neon (y de
// paso, tracker.app_users y tracker.client_functional_analysts). Idempotente: usa
// upsert por id, así que se puede volver a correr sin duplicar.
//
// IMPORTANTE: este script es de SOLO LECTURA contra Firestore (es la base de
// producción actual). Nunca escribe ahí, solo lee con .get().
//
// Uso:
//   DATABASE_URL=postgresql://... node scripts/migrate-clients-from-firestore.js [--dry-run]
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

function normalizeBillableConfig(raw) {
  const config = raw && typeof raw === 'object' ? raw : {};
  const strategy = config.baseFactorStrategy === 'custom' ? 'custom' : 'rate_ratio';
  const markup = toNumberOrNull(config.markupMultiplier);
  const safeMarkup = markup !== null && markup > 0 ? markup : 1.6;
  const internalBugMarkup = toNumberOrNull(config.internalBugMarkupMultiplier);
  const safeInternalBugMarkup = internalBugMarkup !== null && internalBugMarkup > 0 ? internalBugMarkup : null;
  const additional = toNumberOrNull(config.additionalFixedHours);
  const safeAdditional = additional !== null ? additional : 0;
  const minimum = toNumberOrNull(config.minimumBillableHours);
  const safeMinimum = minimum !== null && minimum > 0 ? minimum : null;
  const customBaseFactor = toNumberOrNull(config.customBaseFactor);
  const safeCustomBaseFactor = strategy === 'custom' && customBaseFactor !== null && customBaseFactor > 0 ? customBaseFactor : null;

  const overrides = {};
  if (config.collaboratorOverrides && typeof config.collaboratorOverrides === 'object') {
    Object.entries(config.collaboratorOverrides).forEach(([id, value]) => {
      const parsed = toNumberOrNull(value);
      if (parsed !== null && parsed > 0) overrides[id] = parsed;
    });
  }

  return {
    baseFactorStrategy: strategy,
    customBaseFactor: safeCustomBaseFactor,
    markupMultiplier: safeMarkup,
    internalBugMarkupMultiplier: safeInternalBugMarkup,
    additionalFixedHours: safeAdditional,
    minimumBillableHours: safeMinimum,
    collaboratorOverrides: overrides,
  };
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
  const firebaseApp = initializeApp({ credential: cert(serviceAccount) }, `migration-clients-${Date.now()}`);
  const firestore = getFirestore(firebaseApp);

  const pgClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pgClient.connect();

  const snapshot = await firestore.collection('clients').get();
  console.log(`Encontrados ${snapshot.size} clientes en Firestore.`);

  let migrated = 0;
  let skipped = 0;

  await pgClient.query('BEGIN');
  try {
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const id = doc.id;
      const uid = typeof data.uid === 'string' && data.uid ? data.uid : null;

      if (!data.name) {
        console.warn(`SKIP ${id}: falta name`);
        skipped += 1;
        continue;
      }

      if (uid) {
        const email = data.email || `${id}@sin-email.capassotech.local`;
        await pgClient.query(
          `INSERT INTO tracker.app_users (id, email, name, roles, hourly_rate)
           VALUES ($1, $2, $3, ARRAY['client']::tracker.user_role[], 0)
           ON CONFLICT (id) DO UPDATE SET
             email = EXCLUDED.email,
             name = EXCLUDED.name,
             updated_at = now()`,
          [uid, email, data.name],
        );
      }

      const billableConfig = normalizeBillableConfig(data.billableConfig);

      await pgClient.query(
        `INSERT INTO tracker.clients (
           id, user_id, name, email, phone, address, city, province, postal_code,
           floor, razon_social, cuit, iva_condition, password, billing_currency,
           billable_config, profile_image_url, billable_hours_limit
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
           $15::tracker.billing_currency, $16::jsonb, $17, $18
         )
         ON CONFLICT (id) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           address = EXCLUDED.address,
           city = EXCLUDED.city,
           province = EXCLUDED.province,
           postal_code = EXCLUDED.postal_code,
           floor = EXCLUDED.floor,
           razon_social = EXCLUDED.razon_social,
           cuit = EXCLUDED.cuit,
           iva_condition = EXCLUDED.iva_condition,
           password = EXCLUDED.password,
           billing_currency = EXCLUDED.billing_currency,
           billable_config = EXCLUDED.billable_config,
           profile_image_url = EXCLUDED.profile_image_url,
           billable_hours_limit = EXCLUDED.billable_hours_limit,
           updated_at = now()`,
        [
          id,
          uid,
          data.name,
          toNullableString(data.email),
          toNullableString(data.phone),
          toNullableString(data.address),
          toNullableString(data.city),
          toNullableString(data.province),
          toNullableString(data.postalCode),
          toNullableString(data.floor),
          toNullableString(data.razonSocial),
          toNullableString(data.cuit),
          toNullableString(data.ivaCondition),
          toNullableString(data.password),
          normalizeCurrency(data.billingCurrency),
          JSON.stringify(billableConfig),
          toNullableString(data.profileImageUrl),
          toNumberOrNull(data.billableHoursLimit ?? data.hoursLimit ?? data.monthlyHoursLimit),
        ],
      );

      // Reemplaza las asignaciones de analistas funcionales para este cliente.
      await pgClient.query('DELETE FROM tracker.client_functional_analysts WHERE client_id = $1', [id]);
      const analystIds = Array.isArray(data.analistaFuncionalIds) ? [...new Set(data.analistaFuncionalIds)] : [];
      for (const collaboratorId of analystIds) {
        await pgClient.query(
          `INSERT INTO tracker.client_functional_analysts (client_id, collaborator_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [id, collaboratorId],
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

  console.log(`Migrados: ${migrated}. Saltados: ${skipped}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
