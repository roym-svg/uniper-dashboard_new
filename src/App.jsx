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

export default function App() {
  const [boxes, setBoxes] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const guideParam = getGuideParam();

  const load = useCallback(async ({ isRefresh = false } = {}) => {
    isRefresh ? setRefreshing(true) : setStatus('loading');
    setError('');
    try {
      const data = await fetchInventory();
      setBoxes(data);
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
    
    // התאמה נקייה וגמישה בין השם בקישור לשם בטבלה
    const cleanTarget = decodeURIComponent(guideParam)
      .replace(/['"״׳\-]/g, '')
      .toLowerCase()
      .trim();

    return boxes.filter((b) => {
      const gName = String(b.guideName || '')
        .replace(/['"״׳\-]/g, '')
        .toLowerCase()
        .trim();
        
      return gName === cleanTarget || gName.includes(cleanTarget) || cleanTarget.includes(gName);
    });
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