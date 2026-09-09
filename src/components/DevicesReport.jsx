import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, RefreshCw, AlertTriangle, Loader2, Info } from 'lucide-react';
import { fetchDevicesReport } from '../lib/api.js';

function timeLabel(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('he-IL');
  } catch {
    return null;
  }
}

// Converts a "YYYY-MM" month key (as returned by Code.gs's
// buildReportMonthList_) into a localized Hebrew "MMMM YYYY"-style label,
// e.g. "2026-09" -> "ספטמבר 2026".
function monthLabel(monthKey) {
  if (!monthKey) return monthKey;
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  try {
    return new Date(year, month - 1, 1).toLocaleDateString('he-IL', {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return monthKey;
  }
}

// Admin-only report page — "Devices Report" — a month-by-month breakdown of
// devices leaving the warehouse ("Devices Out", logged going forward via
// Code.gs's onEdit trigger into the new "Devices Out Log" tab) against
// devices returned ("Devices In", live from Zendesk — matches Roy's own
// "SHLOMI RECIVED BACK" Explore report exactly: tickets on the "IL -
// Disconnect from the service" form, with "Agent (IL)" = Shlomi, status
// Solved or Closed, bucketed by the ticket's updated_at timestamp — see
// Code.gs's fetchZendeskDeviceInCountForMonth_ for the full rationale).
//
// The report starts in September 2026: no historical "Devices Out" data
// exists before the log tab was created (the sheet's technician-name column
// gets overwritten once a device is installed at a customer, so nothing
// before "now" can be reconstructed). Each month's In/Out/Diff numbers can
// independently fail (e.g. Zendesk misconfigured) without breaking the rest
// of the table — see MetricCell below.
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

  // Hourly auto-refresh, matching the rest of the app (App.jsx's inventory
  // load) — re-pulls Zendesk + the log tab every hour on its own, on top of
  // the manual "רענן" button.
  useEffect(() => {
    const intervalId = setInterval(() => {
      load({ isRefresh: true });
    }, 60 * 60 * 1000); // 1 hour
    return () => clearInterval(intervalId);
  }, [load]);

  const updatedLabel = timeLabel(report?.updatedAt);
  const months = report?.months || [];

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
        <p className="mb-6 flex items-start gap-2 rounded-xl bg-brand/5 px-4 py-3 text-sm text-slate-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          הדוח מתחיל בספטמבר 2026 — אין נתוני "יצא" היסטוריים לפני התאריך הזה, מכיוון שעמודת שם המדריך בטבלה
          נדרסת ברגע שהמכשיר מותקן אצל הלקוח. החל מספטמבר, כל מכשיר שיוצא לטכנאי נרשם אוטומטית ביומן ייעודי.
        </p>

        {months.some((m) => m.partialStart) && (
          <p className="mb-6 text-xs text-slate-400">
            * החודש הראשון בטבלה סופר רק מה-{months.find((m) => m.partialStart)?.startDay} לחודש ואילך — זה התאריך
            שבו התחלנו לרשום את יומן "מכשירים שיצאו", כך שספירת ה"נכנס" מוגבלת לאותו טווח כדי שההשוואה תהיה הוגנת.
          </p>
        )}

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

        {!loading && !error && report && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-right">
                  <th className="px-5 py-3 font-semibold text-slate-600">חודש</th>
                  <th className="px-5 py-3 font-semibold text-slate-600">Total Devices In</th>
                  <th className="px-5 py-3 font-semibold text-slate-600">Total Devices Out</th>
                  <th className="px-5 py-3 font-semibold text-slate-600">הפרש</th>
                </tr>
              </thead>
              <tbody>
                {months.map((row) => (
                  <tr key={row.month} className="border-b border-slate-100 text-right last:border-0">
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {monthLabel(row.month)}
                      {row.partialStart && <span className="text-slate-400"> *</span>}
                    </td>
                    <td className="px-5 py-3">
                      <MetricCell value={row.devicesIn} error={row.devicesInError} />
                    </td>
                    <td className="px-5 py-3">
                      <MetricCell value={row.devicesOut} error={row.devicesOutError} />
                    </td>
                    <td className="px-5 py-3">
                      <DiffCell diff={row.diff} />
                    </td>
                  </tr>
                ))}

                {months.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-400">
                      אין נתונים להצגה.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </motion.div>
  );
}

// Shows the numeric value, or — when this specific cell's source failed
// (e.g. Zendesk misconfigured for this month, or the log tab unreadable) —
// a small red "שגיאה" badge carrying the actual error string in a tooltip,
// without blocking any other cell in the table from rendering normally.
function MetricCell({ value, error }) {
  if (error) {
    return (
      <span
        title={error}
        className="inline-flex cursor-help items-center gap-1 rounded-md bg-critical/10 px-2 py-0.5 text-xs font-semibold text-critical"
      >
        <AlertTriangle className="h-3 w-3" />
        שגיאה
      </span>
    );
  }
  return <span className="tabular-nums text-slate-900">{value ?? '—'}</span>;
}

// Point-in-time monthly diff (In − Out for that specific month, not a
// running balance): green for a positive diff, red for negative, slate for
// zero or when either side is missing.
function DiffCell({ diff }) {
  if (diff === null || diff === undefined) {
    return <span className="tabular-nums text-slate-400">—</span>;
  }
  const color = diff > 0 ? 'text-good' : diff < 0 ? 'text-critical' : 'text-slate-500';
  const sign = diff > 0 ? '+' : '';
  return <span className={`tabular-nums font-semibold ${color}`}>{sign}{diff}</span>;
}
