import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ClipboardCheck, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { listAllTechnicianUsers } from '../lib/userProfile.js';
import { getBoxesForName, normalizeName } from '../lib/nameMatch.js';

// Admin verification tool — "בדיקת התאמת שמות" — answers the question the
// whole nameMatch.js rewrite exists to serve: for each REGISTERED
// technician account, does their Firestore displayName actually resolve to
// any rows in the sheet? A green badge means yes (and how many); an orange
// badge means that account's name doesn't match anything in the sheet
// right now — worth checking for a typo in either the sheet or the
// account's displayName before assuming the matching logic is broken.
//
// Also lists the reverse gap (sheet names with no matching registered
// user) — the same "23 technicians must match their sheet" goal cuts both
// ways, and that direction is just as useful to catch (a technician who
// has sheet rows but no account yet, or a name spelled differently enough
// that even the fuzzy matcher can't bridge it).
export default function NameMatchModal({ boxes, onClose }) {
  const [users, setUsers] = useState(null); // null = loading
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listAllTechnicianUsers().then((list) => {
      if (cancelled) return;
      if (list.length === 0) setLoadError('לא נמצאו משתמשי טכנאים ב-Firestore (או שאירעה שגיאת הרשאות).');
      setUsers(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    if (!users) return [];
    return users
      .map((u) => ({ ...u, matched: getBoxesForName(boxes, u.displayName) }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [users, boxes]);

  const unmatchedSheetNames = useMemo(() => {
    if (!users) return [];
    const sheetNames = new Map(); // normalized -> original display form
    boxes.forEach((b) => {
      const raw = (b.guideName || '').trim();
      const norm = normalizeName(raw);
      if (norm && !sheetNames.has(norm)) sheetNames.set(norm, raw);
    });
    const registeredNorms = new Set(users.map((u) => normalizeName(u.displayName)));
    const unmatched = [];
    sheetNames.forEach((raw, norm) => {
      // A sheet name counts as "covered" if it exact/token-matches a
      // registered user OR if getBoxesForName would resolve some
      // registered user's name down to it (keeps this consistent with the
      // same fuzzy logic used everywhere else, instead of a stricter
      // separate check that could disagree with the app's real behavior).
      const coveredByFuzzyMatch = users.some((u) => {
        const matchedBoxes = getBoxesForName(boxes, u.displayName);
        return matchedBoxes.some((b) => normalizeName(b.guideName) === norm);
      });
      if (!registeredNorms.has(norm) && !coveredByFuzzyMatch) unmatched.push(raw);
    });
    return unmatched.sort((a, b) => a.localeCompare(b));
  }, [users, boxes]);

  const matchedCount = rows.filter((r) => r.matched.length > 0).length;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose?.();
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
                <ClipboardCheck className="h-4.5 w-4.5 text-brand" />
              </div>
              <h2 className="text-base font-bold text-slate-900">בדיקת התאמת שמות</h2>
            </div>
            <button
              onClick={onClose}
              aria-label="סגור"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
            {users === null && (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                טוען משתמשים רשומים…
              </div>
            )}

            {loadError && (
              <p className="mb-3 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {loadError}
              </p>
            )}

            {users !== null && rows.length > 0 && (
              <>
                <div className="mb-3 rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">{matchedCount}</span> מתוך{' '}
                  <span className="font-semibold text-slate-900">{rows.length}</span> משתמשים רשומים מותאמים לגיליון
                </div>
                <ul className="space-y-1.5">
                  {rows.map((r) => (
                    <li
                      key={r.uid}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-800">{r.displayName}</p>
                        <p className="truncate text-xs text-slate-400">{r.email}</p>
                      </div>
                      {r.matched.length > 0 ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-good/10 px-2.5 py-1 text-xs font-semibold text-good">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          מותאם ({r.matched.length} ערכות)
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          לא נמצא בגיליון
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {unmatchedSheetNames.length > 0 && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  שמות בגיליון ללא משתמש רשום תואם ({unmatchedSheetNames.length})
                </p>
                <ul className="space-y-1">
                  {unmatchedSheetNames.map((name) => (
                    <li
                      key={name}
                      className="truncate rounded-lg bg-amber-500/5 px-3 py-1.5 text-sm text-amber-800"
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="mt-4 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              סגירה
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
