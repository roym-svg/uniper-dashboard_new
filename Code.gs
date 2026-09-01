// ── Admin notification address ──────────────────────────────────────────
// Every email this file sends (report-missing, low-inventory) goes here.
// Replace with your real address before redeploying.
const ADMIN_EMAIL = 'your-email@example.com';

// Exact-string aliases for messy technician names as they appear in the sheet.
// Lookup is O(1) per row — add new variants here as you find them, this
// costs nothing at read time.
//
// Rebuilt from the ?mode=debug dump of the real sheet data. Two systematic
// patterns showed up that account for most of the original misses:
//   1. Many rows store the name with underscores instead of spaces (and
//      sometimes instead of an apostrophe or dash), e.g. "ארז_יפה" or
//      "ג_רי_שליידר_שפלה" — a second, separate raw form from the
//      space-written one.
//   2. Many rows store only a first name ("מיכאל", "עמיאל", "שירה", "ילנה",
//      "רננה") rather than the full name.
// The original entries below (space/pipe/dash-separated) are kept as-is even
// where the debug dump showed no exact match for them — harmless to keep,
// and in case that raw form does occur in rows outside the sample.
//
// This map is pure name CLEANUP — it never removes a row, it only rewrites
// a messy raw name to its canonical spelling before the row is returned.
// It has nothing to do with which technicians are included (see the note
// on EXCLUDED_TECHNICIANS below for that).
var GUIDE_NAME_MAP = {
  // --- original entries ---
  'ג\'רי שייליידר שפלה': 'ג\'רי שייליידר',
  'דוד דסטה פרדס חנה': 'דוד דסטה',
  'מיכאל פייגין| באר שבע': 'מיכאל פייגין',
  'מירוסלב - ראשל צ ת א מרכז': 'מירוסלב ממרובסקי',
  'דני ירושלים': 'דני בן הרוש',
  'אולג ש - יוניפר': 'אולג ש',

  // --- underscore-formatted raw variants (confirmed via debug dump) ---
  'ג_רי_שליידר_שפלה': 'ג\'רי שייליידר',
  'ארז_יפה': 'ארז יפה',
  'גיל_חדד': 'גיל חדד',
  'דוד_דסטה_פרדס_חנה': 'דוד דסטה',
  'דורון_אוחיון': 'דורון אחיון',
  'דני_ירושלים': 'דני בן הרוש',
  'הדס_כהן': 'הדס כהן',
  'יואב_חדייר': 'יואב חדייר',
  'מירוסלב_-_ראשל_צ_ת_א_מרכז': 'מירוסלב ממרובסקי',
  'מיכאל_פייגין_באר_שבע': 'מיכאל פייגין',
  'ניר_שנייבאום': 'ניר שיינבאום',
  'סער_כץ': 'סער כץ',
  'עמיאל_לבל': 'עמיאל לבל',
  'רננה_גוטמן': 'רננה גוטמן',
  'רועי_הלוי': 'רועי הלוי',
  'שירה_השרון': "שירה רפאלוביץ'",

  // --- bare first-name-only rows (confirmed via debug dump) ---
  "ג'רי": 'ג\'רי שייליידר',
  'מירו סלאב': 'מירוסלב ממרובסקי',
  'מיכאל': 'מיכאל פייגין',
  'עמיאל': 'עמיאל לבל',
  'ילנה': 'ילנה נזרנקו',
  'רננה': 'רננה גוטמן',
  'שירה': "שירה רפאלוביץ'",

  // --- abbreviated-surname rows ---
  'דני ש': 'דני שטיינמץ',
  // Assumption, lower confidence than the rest of this map: "דניאל" (Daniel)
  // vs. "דני" (Danny) could in principle be a different person — flagging
  // in case that's wrong. Only 4 rows affected.
  'דניאל_ש': 'דני שטיינמץ'
};

// ── Explicit, opt-in exclusions only — NOT an allowlist ─────────────────
// Previously this file gated every row through a static ACTIVE_TECHNICIANS
// allowlist of 22 names: anyone not on that list (like אפרים חותם) was
// silently dropped from every API response, and the list would need a
// manual edit every single time a technician was added. That's exactly the
// bug being fixed here — row fetching is now fully dynamic: every distinct
// technician name found in the sheet is returned, with no ceiling on count.
//
// If there's a specific name that genuinely should stay hidden (not a real
// technician, someone who left, a duplicate entry, etc.), add its CANONICAL
// spelling here (i.e. the value side of GUIDE_NAME_MAP, or the as-written
// name for anyone not in that map) and it'll be skipped — the previous
// version of this file excluded 'אולג ש', 'סם רמירז' / 'סאם רמירז', 'רביע',
// and 'גל נח' this way; none are excluded by default now, since that
// decision wasn't part of this fix. Uncomment/add the ones you still want
// hidden:
var EXCLUDED_TECHNICIANS = [
  // 'אולג ש',
  // 'סם רמירז',
  // 'רביע',
  // 'גל נח',
];

var EXCLUDED_TECHNICIANS_SET = buildNameSet_(EXCLUDED_TECHNICIANS);

// ── Zendesk config (Devices Report tab — "Total Devices In") ────────────
// ZENDESK_API_TOKEN is a real credential — generate it yourself in Zendesk
// Admin Center -> Apps and integrations -> APIs -> Zendesk API (enable
// token access, "Add API token") and paste it here directly. Never paste
// it into a chat message, a commit, or anywhere outside this file.
var ZENDESK_SUBDOMAIN = 'unipercare';
var ZENDESK_EMAIL = 'your-zendesk-agent-email@example.com'; // the agent account the API token belongs to
var ZENDESK_API_TOKEN = 'PASTE_YOUR_ZENDESK_API_TOKEN_HERE';

// The custom ticket field the warehouse team sets when a device is
// physically received back, and the exact value/tag that marks it as
// received. "Total Devices In" = count of tickets where this field
// currently holds this value — the same definition as the manual report
// this replaces.
var ZENDESK_DEVICE_FIELD_ID = '360040218632';
var ZENDESK_DEVICE_IN_VALUE = 'receive_equipment_back';

function doGet(e) {
  try {
    var mode = e && e.parameter ? e.parameter.mode : '';

    if (mode === 'devicesReport') {
      return jsonResponse_(getDevicesReport_());
    }

    return jsonResponse_(buildInventoryRecords_());
  } catch (err) {
    return jsonResponse_({ error: true, message: (err && err.message) ? err.message : String(err) });
  }
}

/**
 * Reads the "Unipass Inventory" tab and returns the same records array the
 * app has always served from doGet — extracted into its own function so
 * the Devices Report's "Total Devices Out" (see getDevicesReport_ below)
 * can reuse EXACTLY this logic (same dedup, same lost-device exclusion,
 * same name cleanup) instead of counting rows a second, subtly different
 * way that could disagree with what every technician's own Dashboard
 * shows. Throws on the two "expected" failure cases (empty sheet, columns
 * not found) rather than returning an error object directly, so callers
 * — doGet and getDevicesReport_ — each decide how to report it themselves.
 */
function buildInventoryRecords_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Unipass Inventory') || ss.getSheets()[0];

  // Fully dynamic range — driven by the sheet's actual current size, not
  // any fixed number of rows/technicians. getLastRow()/getLastColumn()
  // reflect exactly how much data is really there right now, whether
  // that's 23 technicians, 50, or 5.
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) throw new Error("הטבלה ריקה מנתונים");

  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();

  // איתור שורת הכותרות
  var headerRowIndex = 0;
  for (var i = 0; i < 5 && i < values.length; i++) {
    if (values[i].join('').toUpperCase().indexOf('SERIAL') !== -1) {
      headerRowIndex = i;
      break;
    }
  }

  var headers = values[headerRowIndex].map(function (h) {
    return String(h).trim().toUpperCase();
  });

  var serialIdx = headers.indexOf('SERIAL NUMBER');
  if (serialIdx === -1) serialIdx = findColumnIndex_(headers, 'SERIAL');

  var guideIdx = headers.indexOf('TECHNICIAN NAME');
  if (guideIdx === -1) guideIdx = headers.indexOf('TECH FULL NAME');
  if (guideIdx === -1) guideIdx = findColumnIndex_(headers, 'TECH');

  // "STORAGE SPECIFIC LOCATION" appears TWICE in this sheet (confirmed via
  // ?mode=debug: columns C and D both carry that header). Column C tracks
  // warehouse/ops locations ("מחסן", "משרד", transfers) — column D
  // (index 3) is the one originally specified as the status source and
  // carries the simple "אצל המדריך" / "נאסף" values. Prefer index 3 when
  // the header is duplicated; fall back to the first match otherwise.
  var locationMatches = findAllColumnIndexes_(headers, 'STORAGE SPECIFIC LOCATION');
  var locationIdx = locationMatches.indexOf(3) !== -1 ? 3 : (locationMatches.length ? locationMatches[0] : -1);
  if (locationIdx === -1) locationIdx = findColumnIndex_(headers, 'STORAGE');
  if (locationIdx === -1) locationIdx = findColumnIndex_(headers, 'LOCATION');

  if (serialIdx === -1 || guideIdx === -1) {
    throw new Error("שגיאה במציאת עמודות.");
  }

  var records = [];
  var seenSerials = {}; // חוסם כפילויות של ממירים

  for (var r = headerRowIndex + 1; r < values.length; r++) {
    var row = values[r];

    // בדיקת מספר סריאלי וכפילויות
    var serialValue = row[serialIdx] ? String(row[serialIdx]).trim() : '';
    if (!serialValue || seenSerials[serialValue]) continue;

    // חסימת ממירים אבודים
    var rawLocation = locationIdx !== -1 && row[locationIdx] ? String(row[locationIdx]).trim() : '';
    if (rawLocation.indexOf('suspected as lost') !== -1 || rawLocation.indexOf('אבוד') !== -1) continue;

    // משיכת שם המדריך וניקויו (איחוד שמות כפולים/מבולגנים)
    var rawGuide = guideIdx !== -1 && row[guideIdx] ? String(row[guideIdx]).trim() : '';
    if (!rawGuide) continue;

    var cleanGuideName = normalizeName_(GUIDE_NAME_MAP[rawGuide] || rawGuide);

    // Skip only names explicitly opted out above — everyone else is
    // included, dynamically, no matter how many distinct technicians
    // that turns out to be.
    if (EXCLUDED_TECHNICIANS_SET[cleanGuideName]) continue;

    // הוספה לרשימה וסימון הממיר כ"נצפה"
    seenSerials[serialValue] = true;
    records.push({
      serialNumber: serialValue,
      guideName: cleanGuideName,
      faultStatus: rawLocation || 'אצל המדריך'
    });
  }

  return records;
}

/**
 * Backs the "Devices Report" tab: mode=devicesReport. Combines two
 * INDEPENDENT sources — Zendesk (devicesIn) and the sheet (devicesOut) —
 * and deliberately keeps each one's failure isolated to itself: if
 * Zendesk is misconfigured (e.g. the API token placeholder hasn't been
 * filled in yet), devicesOut still comes back correctly, and vice versa.
 * The frontend shows a small per-metric error instead of the number for
 * whichever side failed, rather than the whole page failing.
 */
function getDevicesReport_() {
  var devicesOut = null;
  var devicesOutError = null;
  try {
    devicesOut = buildInventoryRecords_().length;
  } catch (err) {
    devicesOutError = (err && err.message) ? err.message : String(err);
  }

  var devicesIn = null;
  var devicesInError = null;
  try {
    devicesIn = fetchZendeskDeviceInCount_();
  } catch (err) {
    devicesInError = (err && err.message) ? err.message : String(err);
  }

  return {
    devicesIn: devicesIn,
    devicesInError: devicesInError,
    devicesOut: devicesOut,
    devicesOutError: devicesOutError,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Uses Zendesk's search/count endpoint — GET /api/v2/search/count.json —
 * to count tickets whose ZENDESK_DEVICE_FIELD_ID custom field currently
 * holds ZENDESK_DEVICE_IN_VALUE. That endpoint returns just {"count": N},
 * no pagination needed no matter how many tickets match, and no ticket
 * data beyond the count is fetched or stored.
 *
 * Auth: Zendesk API token auth is "{agent email}/token:{api token}" as
 * HTTP Basic Auth — NOT the agent's actual password.
 */
function fetchZendeskDeviceInCount_() {
  if (!ZENDESK_API_TOKEN || ZENDESK_API_TOKEN === 'PASTE_YOUR_ZENDESK_API_TOKEN_HERE') {
    throw new Error('Zendesk API token לא הוגדר (ZENDESK_API_TOKEN ב-Code.gs).');
  }
  if (!ZENDESK_EMAIL || ZENDESK_EMAIL === 'your-zendesk-agent-email@example.com') {
    throw new Error('Zendesk agent email לא הוגדר (ZENDESK_EMAIL ב-Code.gs).');
  }

  var query = 'type:ticket custom_field_' + ZENDESK_DEVICE_FIELD_ID + ':' + ZENDESK_DEVICE_IN_VALUE;
  var url = 'https://' + ZENDESK_SUBDOMAIN + '.zendesk.com/api/v2/search/count.json?query=' + encodeURIComponent(query);
  var authHeader = 'Basic ' + Utilities.base64Encode(ZENDESK_EMAIL + '/token:' + ZENDESK_API_TOKEN);

  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Authorization: authHeader },
    muteHttpExceptions: true // so a 401/403/etc comes back as a normal response we can read, not a thrown exception with a less useful message
  });

  var statusCode = response.getResponseCode();
  var body = response.getContentText();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error('Zendesk API החזיר שגיאה (HTTP ' + statusCode + '): ' + body);
  }

  var data = JSON.parse(body);
  if (typeof data.count !== 'number') {
    throw new Error('תגובת Zendesk לא בפורמט הצפוי: ' + body);
  }

  return data.count;
}

// ── POST handler: report-missing + low-inventory email notifications ────
//
// The frontend's fetch() call sends a JSON string with a text/plain
// Content-Type (deliberately — see api.js's reportMissing() comment for
// why: it's what avoids a CORS preflight against this endpoint). That
// means e.postData.contents holds the JSON, not e.parameter.
//
// action is matched case- and separator-insensitively (lowercased, with
// underscores stripped) so both 'report_missing' and the frontend's actual
// 'reportMissing' work identically, and likewise for 'low_inventory' /
// 'lowInventory' — no need to keep the frontend and this file in exact
// lockstep on naming.
function doPost(e) {
  try {
    var payload = JSON.parse((e.postData && e.postData.contents) || '{}');
    var action = normalizeActionName_(payload.action);

    if (action === 'reportmissing') {
      return handleReportMissing_(payload);
    }
    if (action === 'lowinventory') {
      return handleLowInventory_(payload);
    }

    return jsonResponse_({ error: true, message: "פעולה לא מוכרת: " + String(payload.action || '') });
  } catch (err) {
    return jsonResponse_({ error: true, message: "קריסת שרת: " + err.toString() });
  }
}

function normalizeActionName_(action) {
  return String(action || '').toLowerCase().replace(/_/g, '');
}

/**
 * action: 'report_missing' (or 'reportMissing') — sent when a technician
 * clicks "לא אצלי" on a device row. Expects { serialNumber, guideName,
 * reporterEmail } in the payload (exactly what api.js's reportMissing()
 * already sends).
 */
function handleReportMissing_(payload) {
  var serialNumber = String(payload.serialNumber || '').trim();
  var guideName = String(payload.guideName || '').trim();
  var reporterEmail = String(payload.reporterEmail || '').trim();

  if (!serialNumber || !guideName) {
    return jsonResponse_({ error: true, message: "חסרים פרטים בדיווח (מספר סריאלי או שם מדריך)." });
  }

  var subject = 'דיווח: מכשיר לא נמצא אצל המדריך — ' + serialNumber;
  var body =
    'התקבל דיווח "לא אצלי" מהמערכת:\n\n' +
    'מספר סריאלי: ' + serialNumber + '\n' +
    'מדריך: ' + guideName + '\n' +
    'דווח על ידי: ' + (reporterEmail || '(לא צוין)') + '\n' +
    'זמן: ' + new Date().toLocaleString('he-IL');

  MailApp.sendEmail(ADMIN_EMAIL, subject, body);

  return jsonResponse_({ success: true });
}

/**
 * action: 'low_inventory' (or 'lowInventory') — sent when a technician's
 * count of healthy (non-faulty) devices drops to the low-stock threshold
 * (<= 4, matching Dashboard.jsx's LOW_STOCK_THRESHOLD) or below. Expects
 * { guideName, healthyCount } in the payload; threshold is optional and
 * defaults to 4 for the email text if not provided.
 *
 * NOTE: as of this file, nothing on the frontend actually calls this
 * action yet — Dashboard.jsx currently only shows the low-stock banner
 * client-side. Wire up a fetch() call (mirroring reportMissing() in
 * api.js) from wherever you want this email actually triggered — e.g.
 * once, when the banner first appears for a technician — if you want
 * these emails to start sending.
 */
function handleLowInventory_(payload) {
  var guideName = String(payload.guideName || '').trim();
  var healthyCount = payload.healthyCount;
  var threshold = payload.threshold || 4;

  if (!guideName || (healthyCount === undefined || healthyCount === null)) {
    return jsonResponse_({ error: true, message: "חסרים פרטים בהתראת מלאי נמוך (שם מדריך או כמות)." });
  }

  var subject = 'התראת מלאי נמוך — ' + guideName;
  var body =
    'מלאי נמוך אצל מדריך:\n\n' +
    'מדריך: ' + guideName + '\n' +
    'מכשירים תקינים שנותרו: ' + healthyCount + '\n' +
    'סף התראה: ' + threshold + '\n' +
    'זמן: ' + new Date().toLocaleString('he-IL');

  MailApp.sendEmail(ADMIN_EMAIL, subject, body);

  return jsonResponse_({ success: true });
}

function normalizeName_(name) {
  return String(name).replace(/\s+/g, ' ').trim();
}

function buildNameSet_(list) {
  var set = {};
  for (var i = 0; i < list.length; i++) {
    set[normalizeName_(list[i])] = true;
  }
  return set;
}

function findColumnIndex_(headers, expected) {
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].indexOf(expected) !== -1) return i;
  }
  return -1;
}

function findAllColumnIndexes_(headers, expected) {
  var idxs = [];
  for (var i = 0; i < headers.length; i++) {
    if (headers[i] === expected) idxs.push(i);
  }
  return idxs;
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
