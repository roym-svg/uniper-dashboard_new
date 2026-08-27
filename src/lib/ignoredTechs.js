// The admin's UI-managed "hide this sheet name" list — the replacement for
// what Code.gs's old ACTIVE_TECHNICIANS allowlist used to do, moved out of
// a file that needs a manual edit + redeploy every time someone joins or
// leaves, and into a single Firestore document any admin can edit from the
// app itself.
//
// Code.gs is deliberately left wide open now (no allowlist at all — every
// row in the sheet comes back from the API). This module is what narrows
// that back down on the frontend: any sheet name an admin has hidden here
// gets filtered out of `boxes` before anything else in the app sees it
// (App.jsx applies this once, centrally — see filterOutIgnoredBoxes below
// — so SelectGuide's technician list, NameMatchModal's unmatched-names
// list, and any technician's own Dashboard all agree).
//
// Storage: a single doc at settings/ignoredTechs, holding one field —
// normalizedNames: string[] — the NORMALIZED (nameMatch.js's
// normalizeName) form of every hidden sheet name. Normalized rather than
// raw so a hidden name still matches the sheet row even if its raw
// spelling drifts slightly (a stray space, a different quote character)
// between when it was hidden and the next fetch — the same tolerance
// nameMatch.js already applies everywhere else in this app.
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase.js';
import { normalizeName } from './nameMatch.js';

const IGNORED_TECHS_DOC = doc(db, 'settings', 'ignoredTechs');

/**
 * Returns the current list of hidden names, as normalized keys. Never
 * throws — a missing doc (nothing hidden yet) or a read error (e.g. a
 * technician's more limited Firestore permissions) both just mean "nothing
 * is hidden," so filtering safely falls through to showing everything.
 */
export async function fetchIgnoredTechNames() {
  try {
    const snap = await getDoc(IGNORED_TECHS_DOC);
    if (!snap.exists()) return [];
    const data = snap.data();
    return Array.isArray(data.normalizedNames) ? data.normalizedNames : [];
  } catch {
    return [];
  }
}

/**
 * Admin-only (enforced by firestore.rules, not by this function): adds
 * `rawName` to the hidden list, and returns the updated list. A name
 * already on the list is left as-is (no duplicate, no error).
 */
export async function hideTechnicianName(rawName) {
  const normalized = normalizeName(rawName);
  if (!normalized) return fetchIgnoredTechNames();

  const current = await fetchIgnoredTechNames();
  if (current.includes(normalized)) return current;

  const updated = [...current, normalized];
  await setDoc(IGNORED_TECHS_DOC, { normalizedNames: updated, updatedAt: serverTimestamp() }, { merge: true });
  return updated;
}

/**
 * Admin-only (same enforcement note as above): removes `rawName` from the
 * hidden list, and returns the updated list. Not currently wired to any
 * button in the UI — NameMatchModal only offers "hide" for now — but kept
 * here since "I hid the wrong person" is an obvious next ask, and the
 * fix is a one-line call to this from wherever that button ends up living.
 */
export async function unhideTechnicianName(rawName) {
  const normalized = normalizeName(rawName);
  const current = await fetchIgnoredTechNames();
  const updated = current.filter((n) => n !== normalized);
  if (updated.length === current.length) return current;

  await setDoc(IGNORED_TECHS_DOC, { normalizedNames: updated, updatedAt: serverTimestamp() }, { merge: true });
  return updated;
}

/**
 * Filters `boxes` down to the rows whose guideName is NOT on the hidden
 * list. This is the single choke point every screen's data flows through
 * — App.jsx calls this once on the raw fetched/cached rows, and every
 * downstream consumer (SelectGuide's technician list, NameMatchModal's
 * matched/unmatched breakdown, a technician's own Dashboard) sees the
 * already-filtered result, so a hidden name can never "flood the system"
 * by showing up in one screen but not another.
 */
export function filterOutIgnoredBoxes(boxes, ignoredNormalizedNames) {
  if (!Array.isArray(boxes)) return [];
  if (!Array.isArray(ignoredNormalizedNames) || ignoredNormalizedNames.length === 0) return boxes;

  const ignoredSet = new Set(ignoredNormalizedNames);
  return boxes.filter((b) => !ignoredSet.has(normalizeName(b.guideName)));
}
