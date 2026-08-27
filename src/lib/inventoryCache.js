// A simple 1-hour localStorage cache for the inventory fetch. The Apps
// Script API is a live read of an ~800-row Google Sheet — cheap for one
// person to hit occasionally, but every technician's dashboard load (and
// every admin switching between technicians) re-fetches the whole sheet.
// Caching the result for an hour cuts that down a lot without the data
// ever feeling stale for a spreadsheet that's updated by hand, not in
// real time.
//
// Deliberately NOT keyed per-technician — it's the same raw inventory rows
// for everyone, just filtered differently client-side by nameMatch.js — so
// one cache entry serves both the admin's full view and every technician's
// filtered view.

const CACHE_KEY = 'uniper_inventory_cache_v1';
export const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Returns { data, timestamp } if a still-fresh (< 1 hour old) cache entry
 * exists, otherwise null. Never throws — localStorage can be unavailable
 * (private browsing, quota, disabled) or hold corrupted JSON, and a cache
 * miss should just mean "fetch fresh," not break the app.
 */
export function readInventoryCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.data) || typeof parsed.timestamp !== 'number') return null;

    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return null;

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Writes a fresh cache entry. Silently no-ops on failure (same reasoning
 * as above — caching is a pure optimization, never something worth
 * crashing the app over).
 */
export function writeInventoryCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    // ignore
  }
}

/** Clears the cache — used after a manual refresh writes a new entry, and
 * available for anything that needs to force the next load to hit the
 * network (not currently wired to any UI, but here for that reason). */
export function clearInventoryCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
