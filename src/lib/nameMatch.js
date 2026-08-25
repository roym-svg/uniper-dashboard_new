// Shared fuzzy technician-name matching, used by every place in the app
// that needs to go from a "target" name (a URL param, or a Firestore
// displayName) to the subset of inventory rows that belong to that person.
//
// This is the same logic that was already validated directly in App.jsx —
// pulled out here so the admin flow (matching the ?guide= URL param) and
// the technician flow (matching their own Firestore displayName) can't
// silently drift apart and hide devices differently for the two roles.

// Strips characters that show up as noise around an otherwise-matching name:
// pipes, dashes, quotes/geresh/gershayim — then collapses whitespace and
// lowercases. Deliberately does NOT try to strip "region notes" (trailing
// city/area words) by guessing at place names — that was tried once already
// for the Apps Script side of this app and caused real bugs (place-name
// heuristics clip real surnames too). Substring matching below handles the
// same cases correctly without needing to know what a place name looks like.
export function normalizeName(name) {
  return String(name || '')
    .replace(/['"״׳|-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Returns the subset of `boxes` (each with a `guideName` field) that belong
 * to `targetName`.
 *
 * Strategy, in order:
 *   1. Exact match on the normalized name — the common case, and the
 *      fastest/safest since there's no ambiguity to resolve.
 *   2. Substring fallback: if the target name and a box's guideName contain
 *      one another once normalized (e.g. "מיכאל פייגין" is contained in
 *      "מיכאל פייגין| באר שבע"), accept it — but ONLY if every matching box
 *      resolves to a SINGLE distinct normalized guideName. Two different
 *      technicians who happen to share a name fragment (e.g. two people
 *      both named "דני ...") must never get silently merged.
 *
 * Returns an empty array if nothing matches, or if the substring fallback
 * is ambiguous — never a wrong/partial guess.
 */
export function getBoxesForName(boxes, targetName) {
  if (!targetName || !Array.isArray(boxes)) return [];

  const target = normalizeName(targetName);
  if (!target) return [];

  const exact = boxes.filter((b) => normalizeName(b.guideName) === target);
  if (exact.length > 0) return exact;

  const candidates = new Set();
  boxes.forEach((b) => {
    const gName = normalizeName(b.guideName);
    if (gName && (target.includes(gName) || gName.includes(target))) {
      candidates.add(gName);
    }
  });

  if (candidates.size === 1) {
    const [only] = candidates;
    return boxes.filter((b) => normalizeName(b.guideName) === only);
  }

  return [];
}
