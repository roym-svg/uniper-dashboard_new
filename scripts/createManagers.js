/**
 * One-time batch script: creates (or updates) Firebase Auth accounts and
 * matching /users/{uid} Firestore profile docs for every admin/manager
 * listed in scripts/managers.json.
 *
 * Identical in every way to createTechnicians.js — same Admin SDK approach,
 * same idempotent upsert behavior — just pointed at a separate file
 * (managers.json) so running this can never touch or overwrite the existing
 * technician roster in technicians.json. See that file's own doc comment
 * for the full rationale (why Admin SDK over the client SDK, why it's safe
 * to re-run) and RBAC_SETUP.md → "Batch-creating technician accounts" for
 * setup instructions (getting a service account key, installing
 * firebase-admin) — this reuses the SAME scripts/serviceAccountKey.json you
 * already downloaded for that.
 *
 * Run with: node scripts/createManagers.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Load the service account key -----------------------------------------
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

// --- Load the manager list -----------------------------------------
const managersPath = path.join(__dirname, 'managers.json');
const managers = JSON.parse(readFileSync(managersPath, 'utf8'));

const VALID_ROLES = ['admin', 'technician'];

async function upsertUser({ email, password, displayName, role }) {
  const cleanEmail = String(email || '').trim();
  const cleanName = String(displayName || '').trim();
  const finalRole = VALID_ROLES.includes(role) ? role : 'technician';

  if (!cleanEmail || !password || !cleanName) {
    throw new Error('missing email, password, or displayName');
  }

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
  console.log(`Processing ${managers.length} manager account(s)...\n`);

  const results = { created: [], updated: [], failed: [] };

  for (const manager of managers) {
    const label = `${manager.displayName} <${manager.email}>`;
    try {
      const result = await upsertUser(manager);
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
