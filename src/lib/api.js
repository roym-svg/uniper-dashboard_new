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
    // Includes the URL and a snippet of the response body so a 404/403/etc
    // is traceable to WHICH request failed — this fetch() call always
    // targets the Apps Script /exec URL directly (never Zendesk; Zendesk is
    // only ever called from inside Code.gs, server-side, and its failures
    // come back as a normal 200 JSON payload with an error field — see
    // fetchDevicesReport's doc comment below). A 404 here means the Apps
    // Script web app URL itself isn't resolving — see that function's doc
    // comment for the likely causes.
    const bodySnippet = await res.text().catch(() => '');
    throw new Error(`API request failed (HTTP ${res.status}) for ${API_URL} — ${bodySnippet.slice(0, 300)}`);
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

/**
 * Fetches the "Devices Report" tab's monthly breakdown from Code.gs's
 * getDevicesReport_ (via ?mode=devicesReport) — one row per month, each
 * with devicesIn (Zendesk), devicesOut (the Devices Out Log tab), and diff.
 *
 * Each month's two numbers can independently come back as null with a
 * matching *Error string (e.g. devicesInError) if that one source failed —
 * Zendesk misconfigured, sheet unreadable — WITHOUT any other month or
 * metric failing too. Code.gs's doGet wraps EVERYTHING in a try/catch and
 * always responds 200 OK (see Code.gs's doGet and getDevicesReport_) — it
 * never lets a Zendesk failure bubble up as a non-2xx HTTP status. That
 * means the `!res.ok` branch below can ONLY be triggered by this fetch()
 * itself failing to reach doGet at all — i.e. a problem with the Apps
 * Script web app URL/deployment, never a Zendesk problem. A 404 here
 * specifically means: this exact URL (logged below) didn't resolve to any
 * deployed web app. The most common cause is deploying via "New
 * deployment" (which mints a brand-new /exec URL) instead of "Manage
 * deployments" -> pencil icon -> "New version" (which keeps the SAME URL)
 * — check Deploy -> Manage deployments in the Apps Script editor and
 * confirm this exact URL is still listed as the active deployment, with
 * access set to "Anyone". A real Zendesk failure (bad token, bad field id,
 * 401/403 from Zendesk itself) shows up as devicesInError on a specific
 * month row instead, never here.
 */
export async function fetchDevicesReport() {
  const url = `${API_URL}?mode=devicesReport`;
  const res = await fetch(url, { method: 'GET' });

  if (!res.ok) {
    const bodySnippet = await res.text().catch(() => '');
    throw new Error(
      `API request failed (HTTP ${res.status}) for ${url} — this is the Google Apps Script web app URL, not Zendesk (Zendesk failures show up per-month instead). ${bodySnippet.slice(0, 300)}`
    );
  }

  const data = await res.json();

  if (data && data.error) {
    throw new Error(data.message || 'The devices-report API returned an error.');
  }

  return data;
}
