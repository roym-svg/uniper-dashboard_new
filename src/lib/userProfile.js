import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
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
 * Admin-only: creates a new technician (or admin) account.
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
 * Throws on failure (auth/email-already-in-use, auth/weak-password, a
 * Firestore permission error, etc.) — callers should catch and show a
 * message; see CreateUserModal.jsx for the Hebrew error mapping.
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
    const credential = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, password);
    const newUid = credential.user.uid;

    // Done with the secondary session immediately — nothing else should
    // use it, and we don't want a lingering signed-in user sitting around.
    await signOut(secondaryAuth);

    // Written via the admin's own (primary) Firestore connection.
    await setDoc(doc(db, 'users', newUid), {
      email: cleanEmail,
      displayName: cleanFullName,
      role: finalRole,
      createdAt: serverTimestamp(),
    });

    return { uid: newUid, email: cleanEmail, displayName: cleanFullName, role: finalRole };
  } finally {
    // Always tear down the temporary app instance, success or failure.
    await deleteApp(secondaryApp).catch(() => {});
  }
}
