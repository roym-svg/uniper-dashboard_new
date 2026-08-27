// Shared fuzzy technician-name matching, used by every place in the app
// that needs to go from a "target" name (a URL param, a Firestore
// displayName, or an admin-side verification check) to the subset of
// inventory rows that belong to that person.
//
// This is the same logic that was already validated directly in App.jsx —
// pulled out here so the admin flow (matching the ?guide= URL param), the
// technician flow (matching their own Firestore displayName), and the
// admin name-match verification tool all use exactly one matching
// algorithm and can never silently drift apart.

// Strips characters that show up as noise around an otherwise-matching name:
// pipes, dashes, quotes/geresh/gershayim — then collapses whitespace.
// Deliberately does NOT try to strip "region notes" (trailing city/area
// words) by guessing at place names — that was tried once already for the
// Apps Script side of this app and caused real bugs (place-name heuristics
// clip real surnames too). Token/substring matching below handles the same
// cases correctly without needing to know what a place name looks like.
function stripNoise(name) {
  return String(name || '')
    .replace(/['"״׳|]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Collapses runs of 2+ Hebrew י or ו down to a single letter. This is what
// makes "אפרים" match "אפריים", and "שנייבאום" match "שניבאום" — the two
// spellings differ only in "ktiv male" (vowel letters written out) vs
// "ktiv chaser" (the terser, undotted spelling), which is exactly the kind
// of inconsistency that shows up across a hand-maintained sheet and however
// each technician happened to type their own name when their account was
// created. Collapsing both spellings down to the same form for COMPARISON
// only — never used for anything that gets displayed — means either
// spelling matches the other without needing a lookup table of every name
// variant, and without touching non-Hebrew text (only י/ו runs are
// affected, so this is a no-op for English names or anything without them).
function collapseMatresLectionis(name) {
  return name.replace(/י{2,}/g, 'י').replace(/ו{2,}/g, 'ו');
}

/**
 * Normalizes a name for comparison: strips punctuation/quotes/dashes,
 * collapses doubled Hebrew י/ו, collapses whitespace, lowercases (a no-op
 * for Hebrew, but keeps this correct for any Latin-script names too).
 * This is the normalized form used for exact-match comparison; it is NOT
 * meant to be shown to a user — always display the original, un-normalized
 * name.
 */
export function normalizeName(name) {
  return collapseMatresLectionis(stripNoise(name)).toLowerCase();
}

// Splits a normalized name into its individual word tokens.
function tokenize(name) {
  const normalized = normalizeName(name);
  return normalized ? normalized.split(' ').filter(Boolean) : [];
}

// A token-order-independent key: same tokens in any order produce the same
// key, so "אפרים חותם" and "חותם אפרים" compare equal even though they're
// different strings.
function tokenKey(name) {
  return tokenize(name).slice().sort().join(' ');
}

/**
 * Returns the subset of `boxes` (each with a `guideName` field) that belong
 * to `targetName`.
 *
 * Strategy, in order — each step only runs if the previous one found
 * nothing, and every step that isn't a plain exact match is ambiguity-safe:
 * it only accepts a match when it resolves to exactly ONE distinct
 * technician, never a guess between two different people who happen to
 * share a name fragment.
 *
 *   1. Exact match on the normalized name.
 *   2. Token-set exact match — same words, any order (handles
 *      "אפרים חותם" vs "חותם אפרים").
 *   3. Ambiguity-safe fallback: a box's guideName counts as a candidate if
 *      either (a) the normalized strings contain one another as a
 *      substring (e.g. "מיכאל פייגין" is contained in
 *      "מיכאל פייגין| באר שבע"), or (b) every token of the shorter of the
 *      two names appears among the tokens of the longer one (handles a
 *      name that's a genuine subset of another, in any word order, without
 *      requiring the shorter side to be a contiguous substring). Only
 *      accepted if every candidate found this way normalizes to the SAME
 *      distinct name — two different technicians who happen to share a
 *      name fragment must never get silently merged.
 *
 * Returns an empty array if nothing matches, or if the fallback is
 * ambiguous — never a wrong/partial guess.
 */
export function getBoxesForName(boxes, targetName) {
  if (!targetName || !Array.isArray(boxes)) return [];

  const target = normalizeName(targetName);
  if (!target) return [];

  // 1. Exact normalized-string match.
  let exact = boxes.filter((b) => normalizeName(b.guideName) === target);
  if (exact.length > 0) return exact;

  // 2. Token-set exact match (word order doesn't matter).
  const targetKey = tokenKey(targetName);
  exact = boxes.filter((b) => tokenKey(b.guideName) === targetKey);
  if (exact.length > 0) return exact;

  // 3. Ambiguity-safe substring / token-subset fallback.
  const targetTokens = tokenize(targetName);
  const targetTokenSet = new Set(targetTokens);

  const candidates = new Set();
  boxes.forEach((b) => {
    const gName = normalizeName(b.guideName);
    if (!gName) return;

    const substringMatch = target.includes(gName) || gName.includes(target);

    const gTokens = tokenize(b.guideName);
    const tokenSubsetMatch =
      gTokens.length > 0 &&
      targetTokens.length > 0 &&
      (gTokens.every((t) => targetTokenSet.has(t)) || targetTokens.every((t) => gTokens.includes(t)));

    if (substringMatch || tokenSubsetMatch) {
      candidates.add(gName);
    }
  });

  if (candidates.size === 1) {
    const [only] = candidates;
    return boxes.filter((b) => normalizeName(b.guideName) === only);
  }

  return [];
}
