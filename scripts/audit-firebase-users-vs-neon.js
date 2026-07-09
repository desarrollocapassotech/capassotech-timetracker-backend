// Auditoría de solo lectura (no escribe en Firestore ni en Neon): compara todos los
// usuarios de Firebase Auth contra tracker.collaborators / tracker.clients en Neon,
// para detectar cuentas que todavía dependerían del fallback a Firestore en
// AuthService.resolveUserProfile(). Se usa antes de decidir si se puede dar de baja
// Firestore sin romper el login de nadie.
//
// Uso:
//   DATABASE_URL=postgresql://... node scripts/audit-firebase-users-vs-neon.js

require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { Client } = require('pg');
const path = require('path');

function resolveServiceAccountPath() {
  const relative = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 'firebase-service-account.json';
  return path.isAbsolute(relative) ? relative : path.join(process.cwd(), relative);
}

async function listAllFirebaseUsers(auth) {
  const users = [];
  let pageToken;
  do {
    const result = await auth.listUsers(1000, pageToken);
    users.push(...result.users);
    pageToken = result.pageToken;
  } while (pageToken);
  return users;
}

async function main() {
  const serviceAccount = require(resolveServiceAccountPath());
  const app = initializeApp({ credential: cert(serviceAccount) });
  const auth = getAuth(app);
  const firestore = getFirestore(app);

  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();

  try {
    const firebaseUsers = await listAllFirebaseUsers(auth);
    console.log(`Usuarios en Firebase Auth: ${firebaseUsers.length}`);

    const { rows: collaboratorRows } = await pg.query('SELECT user_id, name, work_email FROM tracker.collaborators');
    const { rows: clientRows } = await pg.query('SELECT user_id, name, email FROM tracker.clients WHERE user_id IS NOT NULL');

    const collaboratorUids = new Set(collaboratorRows.map((r) => r.user_id));
    const clientUids = new Set(clientRows.map((r) => r.user_id));

    console.log(`Colaboradores en Neon: ${collaboratorRows.length}`);
    console.log(`Clientes con user_id en Neon: ${clientRows.length}`);

    const orphans = [];
    for (const user of firebaseUsers) {
      if (collaboratorUids.has(user.uid) || clientUids.has(user.uid)) continue;
      orphans.push(user);
    }

    console.log(`\nUsuarios de Firebase Auth SIN colaborador ni cliente en Neon: ${orphans.length}`);
    for (const user of orphans) {
      // Solo lectura: mira si igual tienen un doc de respaldo en Firestore.
      const snap = await firestore.collection('users').doc(user.uid).get();
      console.log(
        `  - uid=${user.uid} email=${user.email ?? '(sin email)'} disabled=${user.disabled} ` +
          `firestoreDoc=${snap.exists ? 'SI' : 'NO'} ` +
          `lastSignIn=${user.metadata.lastSignInTime ?? 'nunca'}`,
      );
    }

    if (orphans.length === 0) {
      console.log('\nOK: todos los usuarios de Firebase Auth tienen colaborador o cliente en Neon.');
      console.log('El fallback a Firestore en AuthService no debería dispararse para ningún usuario real.');
    }
  } finally {
    await pg.end();
  }
}

main().catch((error) => {
  console.error('Error en la auditoría:', error);
  process.exit(1);
});
