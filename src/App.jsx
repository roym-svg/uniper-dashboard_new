import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { fetchInventory } from './lib/api.js';
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
  const [boxes, setBoxes] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const guideParam = getGuideParam();

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
    load();
  }, [load]);

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