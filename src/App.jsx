import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './lib/firebase.js';
import { fetchInventory } from './lib/api.js';
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

function normalizeForMatch_(name) {
  return String(name || '')
    .replace(/['"״׳\-]/g, '')
    .toLowerCase()
    .trim();
}

export default function App() {
  // Login gate, backed by Firebase Auth. `user` is:
  //   undefined  — Firebase hasn't reported the initial auth state yet
  //                (e.g. restoring its own persisted session on load)
  //   null       — Firebase has confirmed no one is signed in
  //   User       — a real, signed-in Firebase user
  // Nothing below — no boxes, no fetch, no dashboard — renders until it's a
  // real User. onAuthStateChanged also fires automatically after a
  // successful sign-in or sign-out, so this is the single source of truth
  // for the login gate (Login.jsx doesn't need an onSuccess callback).
  const [user, setUser] = useState(undefined);
  const [boxes, setBoxes] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const guideParam = getGuideParam();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });
    return unsubscribe;
  }, []);

  const load = useCallback(async ({ isRefresh = false } = {}) => {
    isRefresh ? setRefreshing(true) : setStatus('loading');
    setError('');
    try {
      const data = await fetchInventory();
      
      // התיקון הקריטי: אם השרת שלח שגיאה מסודרת, נציג אותה במקום לקרוס!
      if (data && data.error) {
        throw new Error(data.message);
      }
      
      // מוודאים שתמיד נכנסת רשימה (מערך) כדי שהאפליקציה לא תקרוס
      setBoxes(Array.isArray(data) ? data : []);
      setStatus('ready');
    } catch (err) {
      setError(err.message || 'Something went wrong while fetching inventory.');
      setStatus('error');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Don't fetch inventory data at all until Firebase confirms a signed-in
    // user — nothing is pulled into memory client-side before that.
    if (user) {
      load();
    }
  }, [user, load]);

  const guideBoxes = useMemo(() => {
    if (!guideParam) return [];

    // Note: URLSearchParams.get() already decodes percent-encoding, so no
    // extra decodeURIComponent() is applied here — doing it twice risked a
    // thrown "URI malformed" error if a name ever contained a lone '%'.
    const cleanTarget = normalizeForMatch_(guideParam);

    const exact = boxes.filter((b) => normalizeForMatch_(b.guideName) === cleanTarget);
    if (exact.length > 0) return exact;

    // Fallback for legacy/bookmarked links built before technician names
    // were cleaned up server-side (e.g. an old link still has a location
    // suffix like "דוד דסטה פרדס חנה"). Only accept this fallback when it
    // resolves to exactly ONE technician — never silently merge two
    // different people who happen to share a name fragment.
    const candidates = new Set();
    boxes.forEach((b) => {
      const gName = normalizeForMatch_(b.guideName);
      if (gName && (cleanTarget.includes(gName) || gName.includes(cleanTarget))) {
        candidates.add(gName);
      }
    });

    if (candidates.size === 1) {
      const [only] = candidates;
      return boxes.filter((b) => normalizeForMatch_(b.guideName) === only);
    }

    return [];
  }, [boxes, guideParam]);

  if (user === undefined) {
    // Firebase is still restoring its own persisted session — avoid a
    // flash of the login screen for a guide who is actually still signed in.
    return <Spinner label="בודק התחברות…" />;
  }

  if (!user) {
    return <Login />;
  }

  if (status === 'loading') {
    return <Spinner />;
  }

  if (status === 'error') {
    return <ErrorState message={error} onRetry={() => load()} />;
  }

  return (
    <AnimatePresence mode="wait">
      {guideParam ? (
        <Dashboard
          key="dashboard"
          guideName={guideParam}
          boxes={guideBoxes}
          onRefresh={() => load({ isRefresh: true })}
          refreshing={refreshing}
        />
      ) : (
        <SelectGuide key="select" boxes={boxes} />
      )}
    </AnimatePresence>
  );
}