# RBAC setup — what changed, and how to bootstrap the first admin

## What's new

- `src/lib/firebase.js` — now also initializes Firestore (`db`), and exports
  `firebaseConfig` so a second, independent Firebase App instance can be
  created (see below).
- `src/lib/nameMatch.js` — shared fuzzy name matching (`normalizeName`,
  `getBoxesForName`), used by both the technician auto-filter and the admin
  "select a technician" filter, so a spelling/formatting difference between
  a Firestore profile's `displayName` and the sheet's raw name never hides
  someone's own devices.
- `src/lib/userProfile.js` — `fetchUserProfile(uid)` reads `/users/{uid}`;
  `createTechnicianAccount(...)` is the admin "create a new user" action. It
  creates the Auth account on a **second, temporary Firebase App instance**
  so the calling admin's own signed-in session is never disturbed, then
  writes the Firestore profile doc through the admin's normal (primary)
  connection.
- `src/components/CreateUserModal.jsx` — the admin-only "משתמש חדש" form
  (full name, email, temporary password, role — defaults to technician).
- `src/components/SelectGuide.jsx` — gained a "משתמש חדש" button (opens the
  modal) and a "התנתקות" (sign out) button. This screen is now admin-only.
- `src/components/Dashboard.jsx` — takes a `showBackButton` prop (technicians
  land here directly, with no picker screen behind them, so the back arrow
  is hidden for them) and a sign-out button next to Refresh Data.
- `src/App.jsx` — the actual routing logic:
  1. Wait for Firebase Auth's initial state (`onAuthStateChanged`).
  2. If signed in, fetch `/users/{uid}` from Firestore.
  3. `role === 'technician'` → render `Dashboard` directly, filtered by
     **`profile.displayName`** — never by the `?guide=` URL param. This is
     what actually enforces the privacy fix: even if a technician edits the
     URL by hand, their own name from Firestore is always what's used.
  4. `role === 'admin'` → full navigation: `SelectGuide` (all technicians,
     with New User + Sign out) or `Dashboard` for whichever technician is
     selected via `?guide=`.
  5. Signed in but no valid profile doc → a Hebrew "no permission, contact
     an admin" screen with a sign-out button, instead of silently guessing
     a role.
- `firestore.rules` (new file, repo root) — restricts `/users/{uid}` so a
  user can always read their own profile, but only an existing admin can
  read anyone else's, or create/update any profile. See that file's
  comments for the full reasoning. **This has not been deployed yet** — see
  below.

Everything else (the Apps Script API, `src/lib/api.js`,
`src/lib/faultStatus.js`, `Login.jsx`, `StatCards.jsx`, `StatusBadge.jsx`)
is unchanged.

## Bootstrap: creating the first admin

There's a chicken-and-egg problem: `CreateUserModal` only appears once
you're signed in *as an admin* — but no admin exists yet the first time you
set this up. That first admin has to be created by hand, once:

1. **Firebase Console → Authentication → Users → Add user.** Enter an email
   and a password for yourself (or whoever should be the first admin).
2. **Firebase Console → Firestore Database → Start collection** (if
   `users` doesn't exist yet) **→ Add document.**
   - Document ID: the **UID** of the Auth user you just created (copy it
     from the Authentication tab — it looks like `AbCd1234...`).
   - Fields:
     - `email` (string) — the same email you used above
     - `displayName` (string) — your name, exactly as it should match the
       sheet if you're also a technician, or anything if you're admin-only
     - `role` (string) — `admin`
3. Sign in with that account in the app. You should land on the full
   `SelectGuide` screen with the "משתמש חדש" button. From here on, every
   other technician or admin account can be created through that button —
   no more manual Console work needed.

## Deploying the Firestore rules

The rules in `firestore.rules` are **not deployed automatically** — no tool
in this conversation has access to your Firebase project. To apply them:

- **Console (simplest):** Firebase Console → Firestore Database → Rules tab
  → paste the contents of `firestore.rules` → Publish.
- **CLI (if you use one):** `firebase deploy --only firestore:rules` from a
  project with the Firebase CLI configured and this file present.

Until you publish them, your Firestore database is running on whatever
rules it currently has (commonly Firebase's default test-mode rules, which
allow open read/write to anyone signed in — or open to everyone, if the
project is brand new and still in "test mode"). **Publish `firestore.rules`
before treating this as production-ready**, otherwise a signed-in
technician could still read or edit any user's profile doc directly against
Firestore, bypassing what the UI shows them.

## A residual gap this phase does NOT close

The Apps Script inventory API (`doGet` in `Code.gs`) is still completely
unauthenticated — anyone with the URL (including a signed-in technician's
own browser) can fetch the **entire** inventory sheet as JSON, for every
technician, over the network. The RBAC changes in this phase only control
what the *React app renders* for a given signed-in user; a technician's
browser still downloads everyone's raw rows before the UI filters them down
to their own.

For most internal-tool threat models (the URL isn't published, only
employees know it, no one is intentionally poking at network requests)
that's an acceptable interim state, especially since the previous version
had no login at all. But it isn't true server-side enforcement. Closing it
fully would mean having `Code.gs` verify a Firebase ID token (sent as a
request parameter or header) and use it to look up the caller's own
Firestore role/name before deciding what to return — that's a real chunk of
additional work on the Apps Script side and is out of scope for this
client-side RBAC pass. Worth flagging as a follow-up if this data is ever
more sensitive than "which technician has which set-top box."
