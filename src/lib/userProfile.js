import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, firebaseConfig } from './firebase.js';

const VALID_ROLES = ['admin', 'technician'];

/**
 * Reads the Firestore profile doc for a signed-in Firebase user.
 * Returns { email, displayName, role } or null if no profile doc exists
 * (e.g. an Auth account was created outside the normal admin-creates-user
 * flow, or the one-time bootstrap admin doc hasn't been created yet).
 * Returns null (not a throw) on any read error too — the caller treats
 * "no usable profile" as access-denied either way, which is the safe default.
 */
export async function fetchUserProfile(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;

    const data = snap.data();
    if (!VALID_ROLES.includes(data.role)) return null;

    return {
      email: data.email || '',
      displayName: data.displayName || '',
      role: data.role,
    };
  } catch {
    return null;
  }
}

/**
 * Admin-only: creates a new technician (or admin) account, or links to one
 * that already exists with this email and the given password.
 *
 * Firebase's client SDK has no "create a user without signing in as them"
 * call — createUserWithEmailAndPassword always signs the calling Auth
 * instance in as the new user. The standard workaround (and the one
 * requested here) is to run that call on a SEPARATE, temporary Firebase App
 * instance, so it's that instance's session that becomes the new user, not
 * the admin's own `auth` from firebase.js. The admin's real session never
 * moves. The Firestore profile doc is then written using the ADMIN's own
 * `db` connection (still authenticated as the admin), which is also what
 * Firestore security rules should require — see the rules note delivered
 * alongside this file.
 *
 * If the email is already registered (auth/email-already-in-use), this
 * tries signing in with the SAME given password on that same secondary
 * app instance to recover the existing UID, then upserts the Firestore doc
 * for it (merge: true) instead of failing outright. This makes both the
 * single "New User" form and the bulk-create flow in BulkCreateModal.jsx
 * safe to re-run: creating the same technician twice links to the existing
 * account rather than erroring or duplicating. If the account exists with
 * a DIFFERENT password than the one given, the sign-in attempt fails and
 * the original auth/email-already-in-use error is thrown to the caller —
 * this is intentional so an admin never silently wonders which password
 * is actually live for that account.
 *
 * Throws on failure (auth/email-already-in-use with a mismatched password,
 * auth/weak-password, a Firestore permission error, etc.) — callers should
 * catch and show a message; see CreateUserModal.jsx for the Hebrew error
 * mapping.
 */
export async function createTechnicianAccount({ email, password, fullName, role = 'technician' }) {
  const cleanEmail = String(email || '').trim();
  const cleanFullName = String(fullName || '').trim();
  const finalRole = VALID_ROLES.includes(role) ? role : 'technician';

  if (!cleanEmail || !password || !cleanFullName) {
    throw new Error('missing-fields');
  }

  // Unique app name so creating several users back-to-back never collides
  // with an app instance still mid-cleanup from a previous call.
  const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    let newUid;
    let linkedExisting = false;
    try {
      const credential = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, password);
      newUid = credential.user.uid;
    } catch (err) {
      if (err.code !== 'auth/email-already-in-use') throw err;
      // Already registered — confirm it's the same account by signing in
      // with the same password, rather than guessing.
      const credential = await signInWithEmailAndPassword(secondaryAuth, cleanEmail, password);
      newUid = credential.user.uid;
      linkedExisting = true;
    }

    // Done with the secondary session immediately — nothing else should
    // use it, and we don't want a lingering signed-in user sitting around.
    await signOut(secondaryAuth);

    // Written via the admin's own (primary) Firestore connection.
    // merge: true so re-running this (e.g. the bulk import) never clobbers
    // a doc that was already written correctly.
    await setDoc(
      doc(db, 'users', newUid),
      {
        email: cleanEmail,
        displayName: cleanFullName,
        role: finalRole,
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );

    return { uid: newUid, email: cleanEmail, displayName: cleanFullName, role: finalRole, linkedExisting };
  } finally {
    // Always tear down the temporary app instance, success or failure.
    await deleteApp(secondaryApp).catch(() => {});
  }
}
