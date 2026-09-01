import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import { fetchDevicesReport } from '../lib/api.js';

function timeLabel(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('he-IL');
  } catch {
    return null;
  }
}

// Admin-only report page — "Devices Report" — comparing two independently
// sourced numbers side by side:
//   - Total Devices In: live from Zendesk (Code.gs's
//     fetchZendeskDeviceInCount_ — counts tickets whose configured custom
//     field currently holds the "received back at the warehouse" value).
//   - Total Devices Out: the current row count in the same "Unipass
//     Inventory" sheet tab the rest of the app reads — i.e. how many
//     devices are presently assigned to a technician right now, using the
//     exact same counting logic (dedup, lost-device exclusion) as
//     everywhere else in the app.
//
// These two numbers are NOT guaranteed to reconcile into one grand total
// — a device can be lost, retired, or logged differently in each system —
// this page shows them side by side as-is rather than forcing a
// difference/balance figure that could be misleading.
export default function DevicesReport({ onBack }) {
  const [report, setReport] = useState(null); // null = never loaded yet
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async ({ isRefresh = false } = {}) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const data = await fetchDevicesReport();
      setReport(data);
    } catch (err) {
      setError(err.message || 'שגיאה בטעינת הדוח.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updatedLabel = timeLabel(report?.updatedAt);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-slate-50 pb-16">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="חזרה"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Report</p>
              <h1 className="text-xl font-bold text-slate-900">Devices Report</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {updatedLabel && <span className="hidden text-xs text-slate-400 sm:inline">עודכן: {updatedLabel}</span>}
            <button
              onClick={() => load({ isRefresh: true })}
              disabled={loading || refreshing}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-blue-700 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              רענן
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            טוען נתונים…
          </div>
        )}

        {!loading && error && (
          <p className="mb-6 flex items-center gap-2 rounded-xl bg-critical/10 px-4 py-3 text-sm font-medium text-critical">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        {!loading && report && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <StatBlock
              label="Total Devices In"
              sublabel="נתון חי מ-Zendesk — מכשירים שהתקבלו חזרה במחסן"
              value={report.devicesIn}
              error={report.devicesInError}
              icon={ArrowDownCircle}
              accent="text-good"
              bg="bg-good/10"
            />
            <StatBlock
              label="Total Devices Out"
              sublabel='שורות בטאב "Unipass Inventory" — מכשירים אצל טכנאים כרגע'
              value={report.devicesOut}
              error={report.devicesOutError}
              icon={ArrowUpCircle}
              accent="text-brand"
              bg="bg-brand/10"
            />
          </div>
        )}
      </main>
    </motion.div>
  );
}

function StatBlock({ label, sublabel, value, error, icon: Icon, accent, bg }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft"
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${bg}`}>
          <Icon className={`h-5 w-5 ${accent}`} />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          <p className="text-xs text-slate-400">{sublabel}</p>
        </div>
      </div>

      {error ? (
        <p className="mt-4 flex items-start gap-1.5 text-xs font-medium text-critical">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : (
        <p className="mt-4 text-4xl font-bold tabular-nums text-slate-900">{value ?? '—'}</p>
      )}
    </motion.div>
  );
}
