import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Search, ArrowLeft, Hash, LogOut, AlertTriangle, Flag, Loader2, Check } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase.js';
import { reportMissing, reportLowInventory } from '../lib/api.js';
import StatCards from './StatCards.jsx';
import StatusBadge from './StatusBadge.jsx';

const LOW_STOCK_THRESHOLD = 4;

// sessionStorage key prefix for the "already emailed the admin about this
// technician's low stock this session" guard below — versioned (v1) so a
// future change to what gets stored can invalidate old entries just by
// bumping this string, without needing a migration.
const LOW_INVENTORY_NOTIFIED_KEY_PREFIX = 'uniper_low_inventory_notified_v1:';

function timeAgoLabel(timestampMs) {
  if (!timestampMs) return null;
  const minutes = Math.max(0, Math.round((Date.now() - timestampMs) / 60000));
  if (minutes < 1) return 'עודכן הרגע';
  if (minutes < 60) return `עודכן לפני ${minutes} דקות`;
  const hours = Math.round(minutes / 60);
  return `עודכן לפני ${hours} ${hours === 1 ? 'שעה' : 'שעות'}`;
}

// showBackButton: false for a technician landing here directly (App.jsx
// routes them straight to their own Dashboard) — there's no picker screen
// for them to go back to, and hiding the arrow avoids implying there is.
export default function Dashboard({
  guideName,
  boxes,
  onRefresh,
  refreshing,
  lastUpdated,
  reporterEmail,
  showBackButton = true,
}) {
  const [query, setQuery] = useState('');
  // Per-serial-number report state: 'sending' | 'sent' | 'error' | undefined.
  const [reportState, setReportState] = useState({});

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

  // Emails the admin once, per technician, per browser session, the first
  // time that technician's own dashboard shows healthy stock at or below
  // the low-stock threshold.
  //
  // Gated on `!showBackButton` rather than on stats.healthy alone: this
  // component is also what an admin sees when they browse to a specific
  // technician via ?guide= (showBackButton=true there), and an admin
  // clicking through several low-stock technicians shouldn't trigger a
  // fresh "low inventory" email for each one they merely looked at — the
  // point of this notification is the technician's own session showing
  // their own stock is low, not an admin's Browse.
  //
  // The sessionStorage flag is set BEFORE the request resolves (not in a
  // .then()), so a second effect run in quick succession — React
  // StrictMode's dev-mode double-invoke, or an unrelated re-render — can't
  // both slip past the guard and send two emails. If the request itself
  // fails, this simply won't retry again this session; that's an accepted
  // trade-off for "at most once", not "exactly once, retried on failure".
  useEffect(() => {
    if (showBackButton) return;
    if (stats.healthy > LOW_STOCK_THRESHOLD) return;
    if (!guideName) return;

    const sessionKey = LOW_INVENTORY_NOTIFIED_KEY_PREFIX + guideName;
    try {
      if (sessionStorage.getItem(sessionKey) === '1') return;
      sessionStorage.setItem(sessionKey, '1');
    } catch {
      // sessionStorage unavailable (private browsing, quota, disabled) —
      // fall through and send anyway; this render just loses the
      // once-per-session guarantee, rather than silently never notifying.
    }

    reportLowInventory({
      guideName,
      healthyCount: stats.healthy,
      threshold: LOW_STOCK_THRESHOLD,
    }).catch(() => {
      // Best-effort — a failed low-inventory email isn't worth surfacing
      // as an error to the technician using this dashboard.
    });
  }, [showBackButton, stats.healthy, guideName]);

  function goBack() {
    const url = new URL(window.location.href);
    url.searchParams.delete('guide');
    window.location.href = url.toString();
  }

  async function handleReportMissing(box) {
    const serial = box.serialNumber;
    setReportState((prev) => ({ ...prev, [serial]: 'sending' }));
    try {
      await reportMissing({ serialNumber: serial, guideName, reporterEmail });
      setReportState((prev) => ({ ...prev, [serial]: 'sent' }));
    } catch {
      setReportState((prev) => ({ ...prev, [serial]: 'error' }));
    }
  }

  function ReportButton({ box }) {
    const state = reportState[box.serialNumber];
    if (state === 'sent') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-good">
          <Check className="h-3.5 w-3.5" />
          דווח
        </span>
      );
    }
    return (
      <button
        onClick={() => handleReportMissing(box)}
        disabled={state === 'sending'}
        title="דווח שהמכשיר הזה לא נמצא אצלך בפועל"
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 transition hover:border-critical/40 hover:bg-critical/5 hover:text-critical disabled:opacity-60"
      >
        {state === 'sending' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flag className="h-3.5 w-3.5" />}
        {state === 'error' ? 'שגיאה — נסה שוב' : 'לא אצלי'}
      </button>
    );
  }

  const updatedLabel = timeAgoLabel(lastUpdated);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-slate-50 pb-16"
    >
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            {showBackButton && (
              <button
                onClick={goBack}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Back to guide selection"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Technician</p>
              <h1 className="text-xl font-bold text-slate-900">{guideName}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {updatedLabel && <span className="hidden text-xs text-slate-400 sm:inline">{updatedLabel}</span>}
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-blue-700 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              רענן נתונים
            </button>
            <button
              onClick={() => signOut(auth)}
              aria-label="התנתקות"
              className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 shadow-soft transition hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <StatCards {...stats} />

        {stats.healthy <= LOW_STOCK_THRESHOLD && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <span className="font-semibold">מלאי נמוך:</span> נותרו רק {stats.healthy} מכשירים תקינים אצל {guideName}.
              {stats.healthy === 0 ? ' לא נותר אף מכשיר תקין.' : ' כדאי לתאם חידוש מלאי.'}
            </p>
          </div>
        )}

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
                <th className="px-5 py-3 font-medium"></th>
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
                    <td className="px-5 py-3 text-right">
                      <ReportButton box={box} />
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
                <div className="mt-3">
                  <ReportButton box={box} />
                </div>
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
