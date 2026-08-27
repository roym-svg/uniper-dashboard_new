// Shared fuzzy technician-name matching, used by every place in the app
// that needs to go from a "target" name (a URL param, a Firestore
// displayName, or an admin-side verification check) to the subset of
// inventory rows — or the single registered account — that belong to that
// person.
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

// Small, hand-confirmed dictionary of known sheet/Firestore name typos —
// pairs a human has actually looked at and confirmed refer to the same
// person, rather than something the fuzzy-distance tier below merely
// judges to be "close enough." Checked before the general edit-distance
// fallback so these specific corrections are guaranteed rather than
// dependent on exactly how the distance math falls out. Add more [a, b]
// pairs here as new confirmed typos turn up — order within a pair doesn't
// matter, both directions are checked.
const NAME_ALIAS_PAIRS = [
  [normalizeName('ניר שיינבאום'), normalizeName('ניר שנייבאום')], // sheet typo: שין/נון swap
  [normalizeName('אפריים חותם'), normalizeName('אפרים חותם')], // ktiv male spelling (also caught by the matres-lectionis collapse above; kept here as an explicit, confirmed record of this exact case)
];

function resolveAlias(normalized) {
  for (const [a, b] of NAME_ALIAS_PAIRS) {
    if (normalized === a) return b;
    if (normalized === b) return a;
  }
  return null;
}

// Standard Levenshtein edit distance (insertions + deletions +
// substitutions), unweighted. Short Hebrew names are short enough that the
// classic O(n*m) DP table is plenty fast for this.
function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prevRow = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const currRow = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1, // deletion
        currRow[j - 1] + 1, // insertion
        prevRow[j - 1] + cost // substitution
      );
    }
    prevRow = currRow;
  }
  return prevRow[n];
}

/**
 * Raw edit distance between two names after normalization — NOT
 * ambiguity-safe, NOT used to auto-accept a match anywhere in this file.
 * Exists purely as a ranking signal for UI that shows a human a short list
 * to pick from (e.g. NameMatchModal.jsx's "link to an existing account"
 * picker defaults to whichever candidate is closest) — the actual write
 * still requires that human's explicit confirmation, so a wrong "closest"
 * guess here is harmless, just a mis-ordered default.
 */
export function nameSimilarityDistance(a, b) {
  return levenshteinDistance(normalizeName(a), normalizeName(b));
}

// Fuzzy-typo tolerance tier: only ever a fallback, only ever applied to
// names long enough that a couple of edits can't accidentally bridge two
// genuinely different (short) names, e.g. "דני" vs "רני" — a 3-letter name
// is one substitution away from a lot of other 3-letter names, so it's
// excluded rather than risking a wrong guess.
const FUZZY_MIN_NORMALIZED_LENGTH = 4;
const FUZZY_MAX_EDIT_DISTANCE = 2;

// Collects the DISTINCT normalized forms among `candidates` whose raw
// strings satisfy `predicate`, mapped back through `keyFn`. Returns the
// single distinct key if there's exactly one, otherwise null — this is the
// ambiguity-safety rule every tier below shares: a fallback tier is only
// ever allowed to resolve a match when it points at exactly one person,
// never a guess between two people who happen to look similar.
function singleDistinctKey(candidates, predicate) {
  const keys = new Set();
  for (const c of candidates) {
    if (predicate(c)) keys.add(normalizeName(c));
  }
  return keys.size === 1 ? [...keys][0] : null;
}

/**
 * Finds the single name (returned as its NORMALIZED form — a key, not
 * necessarily any one raw candidate string verbatim) among `candidateNames`
 * that best matches `targetName`. Tries increasingly loose tiers in order
 * and stops at the first tier that resolves to exactly one distinct
 * person:
 *
 *   1. Exact match on the normalized name.
 *   2. Token-set exact match — same words, any order.
 *   3. The hand-confirmed alias dictionary above.
 *   4. Ambiguity-safe substring / token-subset containment (handles a
 *      trailing region note like "| באר שבע", or a genuine subset of
 *      tokens in any order).
 *   5. Typo tolerance: Levenshtein edit distance <= 2, only for names at
 *      least 4 characters long once normalized.
 *
 * At every tier, a match is only accepted if it resolves to exactly one
 * distinct normalized candidate — two different people who happen to look
 * similar are never silently merged; this returns null instead of a guess.
 */
export function findMatchingName(targetName, candidateNames) {
  const target = normalizeName(targetName);
  if (!target || !Array.isArray(candidateNames)) return null;

  const candidates = candidateNames.filter((c) => normalizeName(c));
  if (candidates.length === 0) return null;

  // 1. Exact normalized-string match.
  let key = singleDistinctKey(candidates, (c) => normalizeName(c) === target);
  if (key) return key;

  // 2. Token-set exact match (word order doesn't matter).
  const targetKey = tokenKey(targetName);
  key = singleDistinctKey(candidates, (c) => tokenKey(c) === targetKey);
  if (key) return key;

  // 3. Hand-confirmed alias dictionary, checked both directions.
  const aliasOfTarget = resolveAlias(target);
  key = singleDistinctKey(candidates, (c) => {
    const cn = normalizeName(c);
    return cn === aliasOfTarget || resolveAlias(cn) === target;
  });
  if (key) return key;

  // 4. Ambiguity-safe substring / token-subset fallback.
  const targetTokens = tokenize(targetName);
  const targetTokenSet = new Set(targetTokens);
  key = singleDistinctKey(candidates, (c) => {
    const cn = normalizeName(c);
    const substringMatch = target.includes(cn) || cn.includes(target);

    const cTokens = tokenize(c);
    const tokenSubsetMatch =
      cTokens.length > 0 &&
      targetTokens.length > 0 &&
      (cTokens.every((t) => targetTokenSet.has(t)) || targetTokens.every((t) => cTokens.includes(t)));

    return substringMatch || tokenSubsetMatch;
  });
  if (key) return key;

  // 5. Typo tolerance (edit distance <= 2), guarded against short names.
  if (target.length >= FUZZY_MIN_NORMALIZED_LENGTH) {
    key = singleDistinctKey(candidates, (c) => {
      const cn = normalizeName(c);
      if (cn.length < FUZZY_MIN_NORMALIZED_LENGTH) return false;
      return levenshteinDistance(target, cn) <= FUZZY_MAX_EDIT_DISTANCE;
    });
    if (key) return key;
  }

  return null;
}

/**
 * Returns the subset of `boxes` (each with a `guideName` field) that belong
 * to `targetName`, using the tiered matching described in
 * findMatchingName above.
 *
 * Returns an empty array if nothing matches, or if the match would be
 * ambiguous — never a wrong/partial guess.
 */
export function getBoxesForName(boxes, targetName) {
  if (!Array.isArray(boxes)) return [];

  const matchKey = findMatchingName(targetName, boxes.map((b) => b.guideName));
  if (!matchKey) return [];

  return boxes.filter((b) => normalizeName(b.guideName) === matchKey);
}
