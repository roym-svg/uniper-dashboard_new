import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users, FileJson, Loader2, CheckCircle2, XCircle, Link2 } from 'lucide-react';
import { createTechnicianAccount } from '../lib/userProfile.js';

// TEMPORARY ADMIN TOOL — meant for the one-time bulk import of the initial
// technician roster. Once everyone's been created, it's fine (and probably
// worth doing) to delete this file and its "New Users" button in
// SelectGuide.jsx — it has no ongoing purpose once onboarding is done.
//
// Deliberately reads the technician list via a FILE PICKER at click-time,
// not a static `import technicians from '.../technicians.json'`. A static
// import gets bundled into the app's built JavaScript — which means the
// full list of names, emails, and plaintext temporary passwords would ship
// inside the production bundle to EVERY visitor of the deployed site, not
// just the admin who clicks the button (anyone can read a JS bundle from
// dev tools, no login bypass required). Reading the file at runtime via
// <input type="file"> means the JSON never leaves the admin's own browser
// except to talk to Firebase, and it's never part of the built app at all.

const ERROR_MESSAGES = {
  'auth/invalid-email': 'כתובת אימייל לא תקינה',
  'auth/weak-password': 'הסיסמה חלשה מדי (נדרשים לפחות 6 תווים)',
  'auth/network-request-failed': 'בעיית תקשורת עם השרת',
  'auth/email-already-in-use': 'המשתמש קיים אך הסיסמה שונה מהרשומה בקובץ',
  'auth/wrong-password': 'המשתמש קיים אך הסיסמה שונה מהרשומה בקובץ',
  'auth/invalid-credential': 'המשתמש קיים אך הסיסמה שונה מהרשומה בקובץ',
  'missing-fields': 'רשומה חסרה שדה (אימייל / סיסמה / שם)',
};

function StatusIcon({ status }) {
  if (status === 'running') return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" />;
  if (status === 'created') return <CheckCircle2 className="h-4 w-4 shrink-0 text-good" />;
  if (status === 'linked') return <Link2 className="h-4 w-4 shrink-0 text-brand" />;
  if (status === 'failed') return <XCircle className="h-4 w-4 shrink-0 text-critical" />;
  return <div className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-200" />;
}

export default function BulkCreateModal({ onClose }) {
  const [technicians, setTechnicians] = useState(null); // parsed array, or null before a file is chosen
  const [parseError, setParseError] = useState('');
  const [log, setLog] = useState([]); // [{ email, displayName, status, detail }]
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');
    setTechnicians(null);
    setLog([]);
    setDone(false);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          throw new Error('empty');
        }
        for (const row of parsed) {
          if (!row || !row.email || !row.password || !row.displayName) {
            throw new Error('shape');
          }
        }
        setTechnicians(parsed);
      } catch {
        setParseError('הקובץ אינו JSON תקין של רשימת טכנאים (email / password / displayName לכל רשומה)');
      }
    };
    reader.onerror = () => setParseError('שגיאה בקריאת הקובץ');
    reader.readAsText(file);
  }

  async function startImport() {
    if (!technicians || running) return;
    setRunning(true);
    setDone(false);
    setLog(technicians.map((t) => ({ email: t.email, displayName: t.displayName, status: 'pending', detail: '' })));

    for (let i = 0; i < technicians.length; i++) {
      const t = technicians[i];
      setLog((prev) => prev.map((row, idx) => (idx === i ? { ...row, status: 'running' } : row)));

      try {
        const result = await createTechnicianAccount({
          email: t.email,
          password: t.password,
          fullName: t.displayName,
          role: t.role || 'technician',
        });
        setLog((prev) =>
          prev.map((row, idx) =>
            idx === i
              ? {
                  ...row,
                  status: result.linkedExisting ? 'linked' : 'created',
                  detail: result.linkedExisting ? 'קושר לחשבון קיים' : 'נוצר בהצלחה',
                }
              : row
          )
        );
      } catch (err) {
        const detail = ERROR_MESSAGES[err?.code] || ERROR_MESSAGES[err?.message] || 'שגיאה לא צפויה';
        setLog((prev) => (prev.map((row, idx) => (idx === i ? { ...row, status: 'failed', detail } : row))));
      }
    }

    setRunning(false);
    setDone(true);
  }

  const summary = done
    ? {
        created: log.filter((r) => r.status === 'created').length,
        linked: log.filter((r) => r.status === 'linked').length,
        failed: log.filter((r) => r.status === 'failed').length,
      }
    : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8"
        onClick={(e) => {
          if (e.target === e.currentTarget && !running) onClose?.();
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-soft"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10">
                <Users className="h-4.5 w-4.5 text-brand" />
              </div>
              <h2 className="text-base font-bold text-slate-900">יצירת משתמשים בכמות</h2>
            </div>
            <button
              onClick={() => !running && onClose?.()}
              disabled={running}
              aria-label="סגור"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
            {!technicians && (
              <div>
                <label
                  htmlFor="bulk-file"
                  className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 py-8 text-center transition hover:border-brand/40 hover:bg-slate-50"
                >
                  <FileJson className="h-6 w-6 text-slate-400" />
                  <span className="text-sm font-medium text-slate-600">בחר את הקובץ technicians.json</span>
                  <span className="text-xs text-slate-400">scripts/technicians.json מתוך תיקיית הפרויקט</span>
                </label>
                <input id="bulk-file" type="file" accept=".json,application/json" onChange={handleFile} className="hidden" />
                {parseError && (
                  <p className="mt-3 flex items-center gap-2 rounded-lg bg-critical/10 px-3 py-2 text-sm font-medium text-critical">
                    <XCircle className="h-4 w-4 shrink-0" />
                    {parseError}
                  </p>
                )}
              </div>
            )}

            {technicians && log.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                נמצאו <span className="font-semibold text-slate-900">{technicians.length}</span> טכנאים בקובץ. לחיצה על
                "התחל יצירה" תיצור חשבון Firebase ופרופיל עבור כל אחד מהם (או תקשר לחשבון קיים אם הוא כבר רשום עם אותה סיסמה).
              </div>
            )}

            {log.length > 0 && (
              <ul className="mt-1 space-y-1.5">
                {log.map((row, i) => (
                  <li
                    key={row.email + i}
                    className="flex items-center gap-2.5 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                  >
                    <StatusIcon status={row.status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800">{row.displayName}</p>
                      <p className="truncate text-xs text-slate-400">{row.email}</p>
                    </div>
                    {row.detail && (
                      <span
                        className={`shrink-0 text-xs font-medium ${
                          row.status === 'failed' ? 'text-critical' : 'text-slate-500'
                        }`}
                      >
                        {row.detail}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {summary && (
              <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                הושלם: <span className="font-semibold text-good">{summary.created} נוצרו</span>
                {', '}
                <span className="font-semibold text-brand">{summary.linked} קושרו לחשבון קיים</span>
                {', '}
                <span className="font-semibold text-critical">{summary.failed} נכשלו</span>
              </div>
            )}
          </div>

          <div className="mt-4 flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => !running && onClose?.()}
              disabled={running}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              {done ? 'סגירה' : 'ביטול'}
            </button>
            {technicians && !done && (
              <button
                type="button"
                onClick={startImport}
                disabled={running}
                className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {running ? 'יוצר…' : 'התחל יצירה'}
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
