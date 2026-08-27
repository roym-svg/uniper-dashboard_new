const API_URL =
  'https://script.google.com/macros/s/AKfycbyddXsu8aS1TzqzX8PXDWrfUBS8zYKukI7QVM9rTRpxVLnsLcUeMzKevoAn7RWHnml0Nw/exec';

/**
 * Fetches the full inventory list from the Apps Script API.
 * Throws on network failure, non-2xx response, or an API-reported error
 * payload (the backend returns { error: true, message } on failure).
 */
export async function fetchInventory() {
  const res = await fetch(API_URL, { method: 'GET' });

  if (!res.ok) {
    throw new Error(`API request failed (HTTP ${res.status}).`);
  }

  const data = await res.json();

  if (data && data.error) {
    throw new Error(data.message || 'The inventory API returned an error.');
  }

  if (!Array.isArray(data)) {
    throw new Error('Unexpected API response shape (expected an array).');
  }

  return data;
}

/**
 * Reports a device as "not actually with me" ("לא אצלי") — sends an email
 * via the Apps Script backend's `doPost` handler (see Code.gs — a NEW
 * function delivered alongside this change; it needs to be added to your
 * existing Apps Script project and the web app redeployed before this will
 * actually send anything).
 *
 * Uses `Content-Type: text/plain` rather than `application/json`. This
 * isn't a typo: a browser only sends a "simple" CORS request (no preflight
 * OPTIONS round-trip first) for a small set of content types, and
 * `text/plain` is one of them while `application/json` is not. Apps
 * Script's web app endpoint doesn't handle a CORS preflight request the
 * way a normal server would, so a JSON-content-typed POST from a browser
 * to it fails before Code.gs ever sees it. Sending the same JSON STRING
 * with a text/plain content type avoids the preflight entirely — Code.gs
 * still does `JSON.parse(e.postData.contents)` on the other end and gets
 * the same structured data either way.
 *
 * Throws on network failure or a non-2xx / API-reported error, same as
 * fetchInventory — callers should catch and show a message.
 */
export async function reportMissing({ serialNumber, guideName, reporterEmail }) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'reportMissing',
      serialNumber: String(serialNumber || ''),
      guideName: String(guideName || ''),
      reporterEmail: String(reporterEmail || ''),
    }),
  });

  if (!res.ok) {
    throw new Error(`API request failed (HTTP ${res.status}).`);
  }

  const data = await res.json();
  if (data && data.error) {
    throw new Error(data.message || 'The report-missing API returned an error.');
  }

  return data;
}

/**
 * Tells the Apps Script backend (Code.gs's handleLowInventory_) that a
 * technician's healthy-device count has dropped to/below the low-stock
 * threshold, so it can email the admin. Same text/plain trick as
 * reportMissing above, for the same CORS-preflight reason.
 *
 * Callers are responsible for only calling this once per technician per
 * session (see Dashboard.jsx's sessionStorage guard) — this function
 * itself sends a request every time it's called, with no de-duplication
 * of its own.
 */
export async function reportLowInventory({ guideName, healthyCount, threshold }) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'lowInventory',
      guideName: String(guideName || ''),
      healthyCount,
      threshold,
    }),
  });

  if (!res.ok) {
    throw new Error(`API request failed (HTTP ${res.status}).`);
  }

  const data = await res.json();
  if (data && data.error) {
    throw new Error(data.message || 'The low-inventory API returned an error.');
  }

  return data;
}
