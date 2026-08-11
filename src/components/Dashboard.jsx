import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Search, ArrowLeft, Hash } from 'lucide-react';
import StatCards from './StatCards.jsx';
import StatusBadge from './StatusBadge.jsx';

export default function Dashboard({ guideName, boxes, onRefresh, refreshing }) {
  const [query, setQuery] = useState('');

  const stats = useMemo(() => {
    const total = boxes.length;

    // ספירה של כל הערכות שאינן בסטטוס רגיל (איסוף / מניתוק / תקול)
    const faulty = boxes.filter((b) => {
      const s = String(b.faultStatus || '');
      return (
        s.includes('איסוף') || 
        s.includes('ניתוק') || 
        s.includes('תקול') || 
        s.toLowerCase().includes('collected')
      );
    }).length;

    // תקינות = סה"כ פחות הלא תקינות/איסוף
    const healthy = total - faulty;

    return { total, healthy, faulty };
  }, [boxes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return boxes;
    return boxes.filter((b) => String(b.serialNumber || '').toLowerCase().includes(q));
  }, [boxes, query]);

  function goBack() {
    const url = new URL(window.location.href);
    url.searchParams.delete('guide');
    window.location.href = url.toString();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-slate-50 pb-16"
    >
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <button
              onClick={goBack}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Back to guide selection"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Technician</p>
              <h1 className="text-xl font-bold text-slate-900">{guideName}</h1>
            </div>
          </div>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-blue-700 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <StatCards {...stats} />

        <div className="relative mt-8 max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by serial number…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-soft outline-none ring-brand/30 transition focus:ring-2"
          />
        </div>

        {/* Desktop table */}
        <div className="mt-6 hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Serial Number</th>
                <th className="px-5 py-3 font-medium">Technician</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {filtered.map((box) => (
                  <motion.tr
                    key={box.serialNumber}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="border-t border-slate-100"
                  >
                    <td className="px-5 py-3 font-mono text-slate-700">{box.serialNumber}</td>
                    <td className="px-5 py-3 text-slate-600">{box.guideName}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={box.faultStatus} />
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Mobile card grid */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
          <AnimatePresence initial={false}>
            {filtered.map((box) => (
              <motion.div
                key={box.serialNumber}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-mono text-sm text-slate-700">
                    <Hash className="h-3.5 w-3.5 text-slate-400" />
                    {box.serialNumber}
                  </div>
                  <StatusBadge status={box.faultStatus} />    
                </div>
                <p className="mt-2 text-xs text-slate-500">{box.guideName}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {filtered.length === 0 && (
          <p className="mt-10 text-center text-sm text-slate-400">No boxes match "{query}".</p>
        )}
      </main>
    </motion.div>
  );
}