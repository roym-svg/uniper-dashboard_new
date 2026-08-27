import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './lib/firebase.js';
import { fetchUserProfile } from './lib/userProfile.js';
import { getBoxesForName } from './lib/nameMatch.js';
import { fetchInventory } from './lib/api.js';
import { readInventoryCache, writeInventoryCache } from './lib/inventoryCache.js';
import { fetchIgnoredTechNames, hideTechnicianName, filterOutIgnoredBoxes } from './lib/ignoredTechs.js';
import Login from './components/Login.jsx';
import Spinner from './components/Spinner.jsx';
import ErrorState from './components/ErrorState.jsx';
import SelectGuide from './components/SelectGuide.jsx';
import Dashboard from './components/Dashboard.jsx';

function getGuideParam() {
  const params = new URLSearchParams(window.location.search);
  const value = params.get('guide');
  return value ? value.trim() : null;
}

export default function App() {
  // Login gate, backed by Firebase Auth. `user` is:
  //   undefined  — Firebase hasn't reported the initial auth state yet
  //   null       — Firebase has confirmed no one is signed in
  //   User       — a real, signed-in Firebase user
  const [user, setUser] = useState(undefined);

  // Role/name profile, backed by Firestore /users/{uid}. Same three-state
  // shape as `user`:
  //   undefined  — profile fetch hasn't resolved yet for the current user
  //   null       — no usable profile (missing doc, bad role, or read error)
  //   {email, displayName, role} — a valid profile
  const [profile, setProfile] = useState(undefined);

  // Raw inventory rows exactly as fetched/cached — never filtered directly.
  // The `boxes` every other part of the app actually reads is the derived,
  // ignored-names-filtered memo below; keeping the raw fetch separate means
  // a hide/unhide doesn't need to re-fetch or invalidate the inventory
  // cache, it just recomputes the filter over data that's already there.
  const [rawBoxes, setRawBoxes] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null); // ms epoch of the data currently in `rawBoxes`

  // Admin-managed "hide this sheet name" list (src/lib/ignoredTechs.js) —
  // normalized keys. Fetched once auth resolves (not gated to admins only:
  // a technician's own Dashboard needs this applied too, in case their own
  // name is ever hidden).
  const [ignoredNames, setIgnoredNames] = useState([]);

  const guideParam = getGuideParam();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      // Signed out (or not yet known) — no profile to show, and don't let a
      // stale profile from a previous session leak into the next render.
      setProfile(user === null ? null : undefined);
      return;
    }

    setProfile(undefined);
    fetchUserProfile(user.uid).then((p) => {
      if (!cancelled) setProfile(p);
    });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const load = useCallback(async ({ isRefresh = false } = {}) => {
    // A manual refresh (the "רענן נתונים" button) always hits the network
    // and overwrites the cache — the whole point of that button is "I know
    // this might be stale, get me the real current state." Anything else
    // (first load, switching which technician an admin is viewing) is free
    // to serve a still-fresh (< 1 hour) cached copy instead of re-fetching.
    if (!isRefresh) {
      const cached = readInventoryCache();
      if (cached) {
        setRawBoxes(cached.data);
        setLastUpdated(cached.timestamp);
        setStatus('ready');
        return;
      }
    }

    isRefresh ? setRefreshing(true) : setStatus('loading');
    setError('');
    try {
      const data = await fetchInventory();

      // התיקון הקריטי: אם השרת שלח שגיאה מסודרת, נציג אותה במקום לקרוס!
      if (data && data.error) {
        throw new Error(data.message);
      }

      // מוודאים שתמיד נכנסת רשימה (מערך) כדי שהאפליקציה לא תקרוס
      const rows = Array.isArray(data) ? data : [];
      setRawBoxes(rows);
      writeInventoryCache(rows);
      setLastUpdated(Date.now());
      setStatus('ready');
    } catch (err) {
      setError(err.message || 'Something went wrong while fetching inventory.');
      setStatus('error');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Fetch inventory only once we have a real, role-bearing profile —
    // nothing is pulled into memory client-side before that, for either role.
    if (profile) {
      load();
    }
  }, [profile, load]);

  const refreshIgnoredNames = useCallback(async () => {
    const list = await fetchIgnoredTechNames();
    setIgnoredNames(list);
    return list;
  }, []);

  useEffect(() => {
    // Same gating as the inventory load above — fetched once a real
    // profile exists, for either role (see the ignoredNames state comment
    // for why technicians need this applied too, not just admins).
    if (profile) {
      refreshIgnoredNames();
    }
  }, [profile, refreshIgnoredNames]);

  // Admin-only action, threaded down to NameMatchModal via SelectGuide.
  // Writes the hide to Firestore, then re-fetches the ignored list so
  // `boxes` below recomputes immediately — no inventory re-fetch needed,
  // since this only changes which already-fetched rows are shown.
  const handleHideTechnician = useCallback(
    async (rawName) => {
      await hideTechnicianName(rawName);
      await refreshIgnoredNames();
    },
    [refreshIgnoredNames]
  );

  // The single choke point every screen's inventory data flows through —
  // SelectGuide's technician list, NameMatchModal's matched/unmatched
  // breakdown, and both the admin's and a technician's own Dashboard all
  // read this, never `rawBoxes` directly, so a hidden name disappears from
  // all of them at once as soon as ignoredNames updates.
  const boxes = useMemo(() => filterOutIgnoredBoxes(rawBoxes, ignoredNames), [rawBoxes, ignoredNames]);

  // Admin flow: filter by whichever technician is selected via ?guide=.
  const adminSelectedBoxes = useMemo(
    () => getBoxesForName(boxes, guideParam),
    [boxes, guideParam]
  );

  // Technician flow: always their own name, from Firestore — never from the
  // URL. This is what actually enforces "a technician can only see their
  // own devices": even if someone hand-edits ?guide=SomeoneElse in the
  // address bar, this ignores it completely.
  const myBoxes = useMemo(
    () => (profile?.role === 'technician' ? getBoxesForName(boxes, profile.displayName) : []),
    [boxes, profile]
  );

  if (user === undefined) {
    // Firebase is still restoring its own persisted session — avoid a
    // flash of the login screen for a guide who is actually still signed in.
    return <Spinner label="בודק התחברות…" />;
  }

  if (!user) {
    return <Login />;
  }

  if (profile === undefined) {
    return <Spinner label="טוען פרופיל משתמש…" />;
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
        <div className="rounded-full bg-critical/10 p-3">
          <span className="block h-8 w-8 text-critical">⚠</span>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">אין לך הרשאה למערכת</h2>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            המשתמש שלך מחובר אך אין לו פרופיל מוגדר במערכת. פנה למנהל כדי שיצור עבורך משתמש.
          </p>
        </div>
        <button
          onClick={() => signOut(auth)}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-soft transition hover:bg-slate-50"
        >
          התנתקות
        </button>
      </div>
    );
  }

  if (status === 'loading') {
    return <Spinner />;
  }

  if (status === 'error') {
    return <ErrorState message={error} onRetry={() => load()} />;
  }

  if (profile.role === 'technician') {
    // Technicians never see SelectGuide and never navigate by ?guide= — they
    // land directly on their own Dashboard, full stop.
    return (
      <Dashboard
        guideName={profile.displayName}
        boxes={myBoxes}
        onRefresh={() => load({ isRefresh: true })}
        refreshing={refreshing}
        lastUpdated={lastUpdated}
        reporterEmail={profile.email}
        showBackButton={false}
      />
    );
  }

  // profile.role === 'admin' from here — full navigation between technicians.
  return (
    <AnimatePresence mode="wait">
      {guideParam ? (
        <Dashboard
          key="dashboard"
          guideName={guideParam}
          boxes={adminSelectedBoxes}
          onRefresh={() => load({ isRefresh: true })}
          refreshing={refreshing}
          lastUpdated={lastUpdated}
          reporterEmail={profile.email}
        />
      ) : (
        <SelectGuide key="select" boxes={boxes} onHideTechnician={handleHideTechnician} />
      )}
    </AnimatePresence>
  );
}
