// The sheet's "Strong Week" column (mapped to faultStatus) can hold free-text
// values. Since exact values weren't specified, classification is keyword-based
// below — EDIT THIS LIST to match what actually appears in your sheet.
const FAULTY_KEYWORDS = ['fault', 'faulty', 'bad', 'broken', 'issue', 'problem', 'repair', 'defect'];

/**
 * Returns true if a faultStatus value should be treated as "faulty".
 * Blank/empty values are treated as healthy (no fault reported).
 */
export function isFaulty(faultStatus) {
  if (faultStatus === null || faultStatus === undefined) return false;
  const value = String(faultStatus).trim().toLowerCase();
  if (value === '') return false;
  return FAULTY_KEYWORDS.some((kw) => value.includes(kw));
}

/**
 * Returns display metadata (label + status role) for a box's faultStatus,
 * used by both the stat cards and the status badges so they always agree.
 */
export function getStatusMeta(faultStatus) {
  if (isFaulty(faultStatus)) {
    return { role: 'critical', label: 'Faulty' };
  }
  return { role: 'good', label: 'Healthy' };
}
