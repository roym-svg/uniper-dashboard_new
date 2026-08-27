/**
 * One-time batch script: creates (or updates) Firebase Auth accounts and
 * matching /users/{uid} Firestore profile docs for every technician listed
 * in scripts/technicians.json.
 *
 * Uses the Firebase Admin SDK, NOT the client SDK. This matters for a batch
 * job like this one: the Admin SDK runs entirely server-side against a
 * service account, so creating 23 users back-to-back never touches (or
 * risks logging you out of) any browser session, and isn't subject to the
 * client SDK's per-IP sign-up rate limiting the way a loop of
 * createUserWithEmailAndPassword calls would be.
 *
 * Idempotent: safe to re-run. If an email already has an Auth account, its
 * existing UID is reused (no duplicate/second account is created) and the
 * Firestore doc is upserted with `{ merge: true }` — re-running after fixing
 * a typo in technicians.json, or after a partial failure, will not create
 * duplicates and will not need cleanup first.
 *
 * See RBAC_SETUP.md → "Batch-creating technician accounts" for full setup
 * instructions (getting a service account key, installing firebase-admin,
 * running this file).
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Load the service account key -----------------------------------------
// Expected at scripts/serviceAccountKey.json (gitignored — see .gitignore).
// Download it from: Firebase Console → Project Settings → Service Accounts
// → Generate new private key.
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
} catch (err) {
  console.error(
    `\nCould not read ${serviceAccountPath}.\n` +
      'Download it from Firebase Console -> Project Settings -> Service Accounts ' +
      '-> Generate new private key, save it as scripts/serviceAccountKey.json, and re-run.\n'
  );
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const auth = admin.auth();
const db = admin.firestore();

// --- Load the technician list -----------------------------------------
const techniciansPath = path.join(__dirname, 'technicians.json');
const technicians = JSON.parse(readFileSync(techniciansPath, 'utf8'));

const VALID_ROLES = ['admin', 'technician'];

async function upsertTechnician({ email, password, displayName, role }) {
  const cleanEmail = String(email || '').trim();
  const cleanName = String(displayName || '').trim();
  const finalRole = VALID_ROLES.includes(role) ? role : 'technician';

  if (!cleanEmail || !password || !cleanName) {
    throw new Error('missing email, password, or displayName');
  }

  // Reuse the existing Auth account if this email is already registered,
  // instead of creating a duplicate.
  let uid;
  let created;
  try {
    const existing = await auth.getUserByEmail(cleanEmail);
    uid = existing.uid;
    created = false;
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    const newUser = await auth.createUser({
      email: cleanEmail,
      password,
      displayName: cleanName,
    });
    uid = newUser.uid;
    created = true;
  }

  await db
    .collection('users')
    .doc(uid)
    .set(
      {
        email: cleanEmail,
        displayName: cleanName,
        role: finalRole,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  return { uid, email: cleanEmail, displayName: cleanName, created };
}

async function main() {
  console.log(`Processing ${technicians.length} technician(s)...\n`);

  const results = { created: [], updated: [], failed: [] };

  for (const tech of technicians) {
    const label = `${tech.displayName} <${tech.email}>`;
    try {
      const result = await upsertTechnician(tech);
      if (result.created) {
        console.log(`  created   - ${label} (uid: ${result.uid})`);
        results.created.push(label);
      } else {
        console.log(`  updated   - ${label} (uid: ${result.uid}, Auth account already existed)`);
        results.updated.push(label);
      }
    } catch (err) {
      console.error(`  FAILED    - ${label} :: ${err.message}`);
      results.failed.push({ label, error: err.message });
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Created: ${results.created.length}`);
  console.log(`Updated (already existed): ${results.updated.length}`);
  console.log(`Failed: ${results.failed.length}`);
  if (results.failed.length) {
    console.log('\nFailures:');
    results.failed.forEach((f) => console.log(`  - ${f.label}: ${f.error}`));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
