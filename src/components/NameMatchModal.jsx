import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ClipboardCheck, CheckCircle2, AlertTriangle, Loader2, Wrench, EyeOff } from 'lucide-react';
import { listAllTechnicianUsers, updateTechnicianDisplayName } from '../lib/userProfile.js';
import { getBoxesForName, nameSimilarityDistance, normalizeName } from '../lib/nameMatch.js';
import CreateUserModal from './CreateUserModal.jsx';

const CREATE_NEW_OPTION = '__create_new__';

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
// that even the fuzzy matcher can't bridge it). Each of those gets a
// "צור/קשר משתמש" button.
//
// IMPORTANT: that button does NOT auto-decide anything. A sheet name only
// ever ends up in this list because getBoxesForName ALREADY tried every
// automatic tier (exact, token-set, alias dictionary, substring, and
// typo-tolerant fuzzy matching) and none of them could resolve it — so
// re-running that exact same matcher here would always fail too; it isn't
// a spare mechanism, it's proof the automatic path is exhausted. Past that
// point, more guessing would mean picking between real technicians based
// on a vibe, which is exactly what nameMatch.js is built to refuse to do.
// So the button instead opens a small picker: choose which existing
// unmatched account (if any) this sheet name actually belongs to — sorted
// by similarity as a convenience default only, never auto-applied — or
// choose to create a brand new account. Nothing is written until the
// admin explicitly confirms.
export default function NameMatchModal({ boxes, onClose, onHideTechnician }) {
  const [users, setUsers] = useState(null); // null = loading
  const [loadError, setLoadError] = useState('');
  // Per-sheet-name action state: 'fixed' | 'error' | undefined.
  const [actionState, setActionState] = useState({});
  // Sheet name whose "link to existing / create new" picker is expanded.
  const [pickerOpenFor, setPickerOpenFor] = useState(null);
  const [pickerSelection, setPickerSelection] = useState(CREATE_NEW_OPTION);
  const [pickerBusy, setPickerBusy] = useState(false);
  // Sheet name currently being handed to CreateUserModal as a prefill.
  const [createPrefillName, setCreatePrefillName] = useState(null);
  // Per-sheet-name "הסתר מדריך" state: 'hiding' | 'error' | undefined.
  // There's no 'hidden' value — a successful hide flows all the way up to
  // App.jsx, which re-filters `boxes` and passes the smaller array back
  // down as a prop; once that happens the name simply isn't in
  // unmatchedSheetNames anymore and its <li> unmounts on its own. This
  // state only needs to cover the in-flight moment before that round trip
  // completes.
  const [hideState, setHideState] = useState({});

  const loadUsers = useCallback(() => {
    return listAllTechnicianUsers().then((list) => {
      if (list.length === 0) setLoadError('לא נמצאו משתמשי טכנאים ב-Firestore (או שאירעה שגיאת הרשאות).');
      else setLoadError('');
      setUsers(list);
      return list;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadUsers().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [loadUsers]);

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
      const coveredByFuzzyMatch = users.some((u) => {
        const matchedBoxes = getBoxesForName(boxes, u.displayName);
        return matchedBoxes.some((b) => normalizeName(b.guideName) === norm);
      });
      if (!registeredNorms.has(norm) && !coveredByFuzzyMatch) unmatched.push(raw);
    });
    return unmatched.sort((a, b) => a.localeCompare(b));
  }, [users, boxes]);

  // Registered technicians with zero matched sheet rows right now — the
  // pool the "link to existing account" picker offers, on the theory that
  // an unmatched sheet name and an unmatched registered account are quite
  // possibly the same person under two very different spellings.
  const unmatchedUsers = useMemo(() => rows.filter((r) => r.matched.length === 0), [rows]);

  // The unique sheet technician names currently on the inventory, for the
  // debug log below — lets an admin open DevTools and directly compare the
  // exact string it's trying to match against a given unmatched user, e.g.
  // to spot a hidden character or spelling difference that isn't visible
  // just from reading the badge in the UI.
  const uniqueSheetTechs = useMemo(() => {
    const seen = new Set();
    const out = [];
    boxes.forEach((b) => {
      const raw = (b.guideName || '').trim();
      if (raw && !seen.has(raw)) {
        seen.add(raw);
        out.push(raw);
      }
    });
    return out;
  }, [boxes]);

  const matchedCount = rows.filter((r) => r.matched.length > 0).length;

  function openPicker(sheetName) {
    setPickerOpenFor(sheetName);
    // Default the dropdown to whichever unmatched account is textually
    // closest — pure UX convenience (see nameSimilarityDistance's own
    // doc comment); the admin still has to look at it and confirm.
    if (unmatchedUsers.length > 0) {
      const ranked = [...unmatchedUsers].sort(
        (a, b) => nameSimilarityDistance(sheetName, a.displayName) - nameSimilarityDistance(sheetName, b.displayName)
      );
      setPickerSelection(ranked[0].uid);
    } else {
      setPickerSelection(CREATE_NEW_OPTION);
    }
  }

  function closePicker() {
    setPickerOpenFor(null);
    setPickerBusy(false);
  }

  async function confirmPicker(sheetName) {
    if (pickerSelection === CREATE_NEW_OPTION) {
      closePicker();
      setCreatePrefillName(sheetName);
      return;
    }

    setPickerBusy(true);
    try {
      await updateTechnicianDisplayName(pickerSelection, sheetName);
      setActionState((prev) => ({ ...prev, [sheetName]: 'fixed' }));
      closePicker();
      await loadUsers(); // re-fetch so badges/lists reflect the correction immediately
    } catch {
      setActionState((prev) => ({ ...prev, [sheetName]: 'error' }));
      setPickerBusy(false);
    }
  }

  // Permanently hides a sheet name that isn't a real technician to onboard
  // — an old row, a typo that isn't worth fixing, a former employee — so it
  // stops cluttering this unmatched list (and, since App.jsx filters
  // `boxes` globally by the same ignored-names list, stops showing up
  // anywhere else in the app either). This is the UI replacement for
  // hand-editing Code.gs's old allowlist: no redeploy, just a click.
  async function handleHide(sheetName) {
    if (!onHideTechnician) return;
    setHideState((prev) => ({ ...prev, [sheetName]: 'hiding' }));
    try {
      await onHideTechnician(sheetName);
      // No 'hidden' state to set — see the hideState declaration's comment.
    } catch {
      setHideState((prev) => ({ ...prev, [sheetName]: 'error' }));
    }
  }

  return (
    <>
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
                  {rows.map((r) => {
                    // DEBUG: temporary console log so an admin can open
                    // DevTools and see the exact strings being compared for
                    // any user still showing as unmatched — useful for
                    // spotting a hidden character or spelling difference
                    // that two identical-looking names hide from the UI.
                    // Safe to remove once the mismatch is tracked down.
                    if (r.matched.length === 0) {
                      console.log('Sheet Technicians:', uniqueSheetTechs, 'User:', r.displayName);
                    }
                    return (
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
                    );
                  })}
                </ul>
              </>
            )}

            {unmatchedSheetNames.length > 0 && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  שמות בגיליון ללא משתמש רשום תואם ({unmatchedSheetNames.length})
                </p>
                <ul className="space-y-1.5">
                  {unmatchedSheetNames.map((name) => {
                    const state = actionState[name];
                    const pickerOpen = pickerOpenFor === name;
                    return (
                      <li key={name} className="rounded-lg bg-amber-500/5 px-3 py-1.5 text-sm text-amber-800">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate">{name}</span>
                          {state === 'fixed' ? (
                            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-good">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              עודכן
                            </span>
                          ) : (
                            <div className="flex shrink-0 items-center gap-1.5">
                              {!pickerOpen && (
                                <button
                                  onClick={() => handleHide(name)}
                                  disabled={hideState[name] === 'hiding'}
                                  title="הסתר לצמיתות — לא יופיע יותר באף מסך עד שיוסר מהסתרה ידנית"
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
                                >
                                  {hideState[name] === 'hiding' ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <EyeOff className="h-3.5 w-3.5" />
                                  )}
                                  {hideState[name] === 'error' ? 'שגיאה — נסה שוב' : 'הסתר מדריך'}
                                </button>
                              )}
                              <button
                                onClick={() => (pickerOpen ? closePicker() : openPicker(name))}
                                title="קשר לחשבון קיים או צור משתמש חדש עם השם הזה"
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-300/60 bg-white px-2 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-500/10"
                              >
                                <Wrench className="h-3.5 w-3.5" />
                                {state === 'error' ? 'שגיאה — נסה שוב' : 'צור/קשר משתמש'}
                              </button>
                            </div>
                          )}
                        </div>

                        {pickerOpen && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-amber-300/30 pt-2">
                            <select
                              value={pickerSelection}
                              onChange={(e) => setPickerSelection(e.target.value)}
                              disabled={pickerBusy}
                              className="min-w-0 flex-1 rounded-lg border border-amber-300/60 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none disabled:opacity-60"
                            >
                              <option value={CREATE_NEW_OPTION}>— צור משתמש חדש —</option>
                              {unmatchedUsers.map((u) => (
                                <option key={u.uid} value={u.uid}>
                                  קשר ל: {u.displayName} ({u.email})
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => confirmPicker(name)}
                              disabled={pickerBusy}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                            >
                              {pickerBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                              אישור
                            </button>
                            <button
                              onClick={closePicker}
                              disabled={pickerBusy}
                              className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 disabled:opacity-60"
                            >
                              ביטול
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
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

      {createPrefillName && (
        <CreateUserModal
          initialFullName={createPrefillName}
          onClose={() => setCreatePrefillName(null)}
          onCreated={() => {
            // Deliberately does NOT close the modal — CreateUserModal shows
            // its own "created successfully" confirmation and the admin
            // closes it themselves (its "סגירה" button, which triggers
            // onClose above). Auto-closing here would yank the modal away
            // before that confirmation is ever seen.
            loadUsers();
          }}
        />
      )}
    </>
  );
}
