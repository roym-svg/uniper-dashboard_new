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
// received. "Devices In" for a given month = count of tickets where this
// field currently holds this value AND the ticket's updated_at falls in
// that month (see fetchZendeskDeviceInCountForMonth_'s doc comment for the
// caveat on using updated_at as the proxy for "when this happened").
var ZENDESK_DEVICE_FIELD_ID = '360040218632';
var ZENDESK_DEVICE_IN_VALUE = 'receive_equipment_back';

// ── Devices Report: monthly range ────────────────────────────────────────
// The report starts here and has NO data before it — the "Unipass
// Inventory" sheet's technician-name column gets overwritten with the
// customer's name once a device is installed, so there is no reliable way
// to reconstruct which month any device left the warehouse before the
// "Devices Out Log" tab (below) started actually recording it. Change
// this only if you want to move the start date forward; there is nothing
// to backfill for months before whenever the log first started running.
var DEVICES_REPORT_START_YEAR = 2026;
var DEVICES_REPORT_START_MONTH = 9; // September, 1-indexed

var DEVICES_OUT_LOG_SHEET_NAME = 'Devices Out Log';

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
 * Locates the SERIAL / TECHNICIAN NAME / STORAGE-LOCATION columns (and the
 * header row) on `sheet`, using the same header-matching rules the app has
 * always used. Returns null if the two required columns (serial, guide)
 * can't be found. Shared by buildInventoryRecords_ (reading the whole
 * table) and onEdit (below — reacting to a single edited cell), so both
 * stay in sync automatically if the sheet's column layout ever changes.
 */
function findInventoryColumns_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return null;

  var headerScanRows = Math.min(5, lastRow);
  var headerValues = sheet.getRange(1, 1, headerScanRows, lastCol).getValues();

  var headerRowIndex = 0;
  for (var i = 0; i < headerValues.length; i++) {
    if (headerValues[i].join('').toUpperCase().indexOf('SERIAL') !== -1) {
      headerRowIndex = i;
      break;
    }
  }

  var headers = headerValues[headerRowIndex].map(function (h) {
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

  if (serialIdx === -1 || guideIdx === -1) return null;

  return { headerRowIndex: headerRowIndex, serialIdx: serialIdx, guideIdx: guideIdx, locationIdx: locationIdx };
}

/**
 * Reads the "Unipass Inventory" tab and returns the same records array the
 * app has always served from doGet. Throws on the two "expected" failure
 * cases (empty sheet, columns not found) rather than returning an error
 * object directly, so callers — doGet and getDevicesReport_ — each decide
 * how to report it themselves.
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

  var cols = findInventoryColumns_(sheet);
  if (!cols) throw new Error("שגיאה במציאת עמודות.");

  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headerRowIndex = cols.headerRowIndex;
  var serialIdx = cols.serialIdx;
  var guideIdx = cols.guideIdx;
  var locationIdx = cols.locationIdx;

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

// ── Devices Out Log: append-only, written by the onEdit trigger below ───

/**
 * Returns the "Devices Out Log" tab, creating it (with a header row) the
 * first time it's needed. Columns: Timestamp | Serial Number | Technician
 * Name — deliberately minimal; this tab is a log, not something anyone is
 * meant to hand-edit.
 */
function getOrCreateDevicesOutLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DEVICES_OUT_LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(DEVICES_OUT_LOG_SHEET_NAME);
    sheet.getRange(1, 1, 1, 3).setValues([['Timestamp', 'Serial Number', 'Technician Name']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Installable-free "simple trigger" — Apps Script recognizes a function
 * literally named onEdit(e) and runs it automatically on every manual edit
 * to this spreadsheet, with no separate setup needed in the Triggers menu.
 *
 * Fires a new "device out" log entry the moment a row's TECHNICIAN NAME
 * cell goes from EMPTY to a real name — confirmed to be the ONLY way that
 * cell is ever populated (it is later overwritten with the customer's name
 * once installed, but never blanked-then-refilled without a genuine new
 * assignment in between, per how the warehouse actually uses this sheet).
 * That overwrite is exactly why we can't read "out" dates back out of this
 * sheet after the fact — this trigger is what captures the moment before
 * it's lost.
 *
 * Deliberately tolerant of multi-cell edits (e.g. pasting several new rows
 * at once) — e.oldValue is only available for single-cell edits, so
 * instead of diffing old-vs-new, this checks every touched row's CURRENT
 * technician-name value against the most recent thing already logged for
 * that serial number, and only logs when it's genuinely different (or
 * nothing has been logged for that serial yet). That naturally handles a
 * device being re-issued to a different technician later as a second,
 * legitimate "out" event, while not re-logging an edit that happens to
 * re-touch a cell without actually changing its value.
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;

    var sheet = e.range.getSheet();
    if (sheet.getName() !== 'Unipass Inventory') return;

    var cols = findInventoryColumns_(sheet);
    if (!cols) return; // couldn't find columns — bail quietly, never break the user's edit

    var guideCol1Indexed = cols.guideIdx + 1; // sheet ranges are 1-indexed; cols.* are 0-indexed
    var editedCol = e.range.getColumn();
    var editedLastCol = e.range.getLastColumn();
    if (editedLastCol < guideCol1Indexed || editedCol > guideCol1Indexed) return; // edit didn't touch the technician-name column at all

    var headerRow1Indexed = cols.headerRowIndex + 1;
    var firstDataRow = Math.max(e.range.getRow(), headerRow1Indexed + 1);
    var lastDataRow = e.range.getLastRow();

    for (var row = firstDataRow; row <= lastDataRow; row++) {
      var serialValue = String(sheet.getRange(row, cols.serialIdx + 1).getValue() || '').trim();
      var guideValue = String(sheet.getRange(row, guideCol1Indexed).getValue() || '').trim();
      if (!serialValue || !guideValue) continue; // nothing to log yet for this row

      logDeviceOutIfNew_(serialValue, guideValue);
    }
  } catch (err) {
    // Never let a logging failure block the person's actual edit to the
    // sheet — just record it so it's visible if the log ever looks wrong.
    Logger.log('onEdit device-out logging failed: ' + err);
  }
}

/**
 * Appends one row to the Devices Out Log UNLESS the most recent existing
 * entry for this exact serial number already has this exact technician
 * name (meaning this specific assignment is already recorded — nothing
 * new happened). Scans the log tab's existing rows each call; fine at the
 * volume this log is expected to see, but if it ever grows very large and
 * this starts feeling slow, the fix is a cached last-seen-per-serial index
 * (e.g. in Script Properties) rather than a full scan — not needed yet.
 */
function logDeviceOutIfNew_(serialValue, guideValue) {
  var sheet = getOrCreateDevicesOutLogSheet_();
  var lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    var existing = sheet.getRange(2, 2, lastRow - 1, 2).getValues(); // [serial, technicianName] pairs
    for (var i = existing.length - 1; i >= 0; i--) {
      if (String(existing[i][0]).trim() === serialValue) {
        if (String(existing[i][1]).trim() === guideValue) return; // already logged, nothing new
        break; // most recent entry for this serial had a DIFFERENT technician — genuinely new "out" event, fall through and log
      }
    }
  }

  sheet.appendRow([new Date(), serialValue, guideValue]);
}

/**
 * Reads every row out of the Devices Out Log as { timestamp, serial,
 * guideName } objects, skipping anything whose Timestamp cell isn't
 * actually a Date (guards against a stray hand-edited row).
 */
function readDevicesOutLogRows_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var ts = values[i][0];
    if (!(ts instanceof Date)) continue;
    rows.push({ timestamp: ts, serial: String(values[i][1] || ''), guideName: String(values[i][2] || '') });
  }
  return rows;
}

// ── Devices Report: monthly In/Out/Diff ──────────────────────────────────

/**
 * Builds the list of calendar months from DEVICES_REPORT_START_YEAR/MONTH
 * through the current month (inclusive) — the current month is naturally
 * partial (whatever's happened so far), which is fine, it just fills in
 * further as the month goes on.
 */
function buildReportMonthList_() {
  var now = new Date();
  var endYear = now.getFullYear();
  var endMonth = now.getMonth() + 1; // 1-indexed

  var months = [];
  var y = DEVICES_REPORT_START_YEAR;
  var m = DEVICES_REPORT_START_MONTH;

  while (y < endYear || (y === endYear && m <= endMonth)) {
    var rangeStart = new Date(y, m - 1, 1);
    var rangeEndExclusive = (m === 12) ? new Date(y + 1, 0, 1) : new Date(y, m, 1);
    months.push({
      year: y,
      month: m,
      label: y + '-' + (m < 10 ? '0' + m : String(m)),
      rangeStart: rangeStart,
      rangeEndExclusive: rangeEndExclusive
    });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  return months;
}

function countDevicesOutForMonth_(logRows, month) {
  var count = 0;
  for (var i = 0; i < logRows.length; i++) {
    var ts = logRows[i].timestamp;
    if (ts >= month.rangeStart && ts < month.rangeEndExclusive) count += 1;
  }
  return count;
}

function formatDateForZendesk_(date) {
  var y = date.getFullYear();
  var m = date.getMonth() + 1;
  var d = date.getDate();
  return y + '-' + (m < 10 ? '0' + m : String(m)) + '-' + (d < 10 ? '0' + d : String(d));
}

function addDays_(date, days) {
  var d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Counts Zendesk tickets whose ZENDESK_DEVICE_FIELD_ID field holds
 * ZENDESK_DEVICE_IN_VALUE, restricted to `month` via the ticket's
 * updated_at. Uses only `>` / `<` (not `>=`/`<=`, which aren't part of
 * Zendesk's documented search operators) — the lower bound is the day
 * BEFORE the month starts and the upper bound is the first day of the
 * NEXT month, so `updated>lowerBound updated<upperBound` covers the whole
 * calendar month exactly.
 *
 * CAVEAT (documented, not hidden): updated_at is the ticket's last-touched
 * time, not specifically "when this field became this value" — Zendesk's
 * search API doesn't expose per-field change history. If a ticket gets
 * touched again afterward (a comment, an unrelated tag) after being
 * marked received, it can drift into a later month than when the device
 * actually came back. Workable as a proxy, not perfectly exact.
 */
function fetchZendeskDeviceInCountForMonth_(month) {
  if (!ZENDESK_API_TOKEN || ZENDESK_API_TOKEN === 'PASTE_YOUR_ZENDESK_API_TOKEN_HERE') {
    throw new Error('Zendesk API token לא הוגדר (ZENDESK_API_TOKEN ב-Code.gs).');
  }
  if (!ZENDESK_EMAIL || ZENDESK_EMAIL === 'your-zendesk-agent-email@example.com') {
    throw new Error('Zendesk agent email לא הוגדר (ZENDESK_EMAIL ב-Code.gs).');
  }

  var lowerBoundExclusive = addDays_(month.rangeStart, -1);
  var query =
    'type:ticket custom_field_' + ZENDESK_DEVICE_FIELD_ID + ':' + ZENDESK_DEVICE_IN_VALUE +
    ' updated>' + formatDateForZendesk_(lowerBoundExclusive) +
    ' updated<' + formatDateForZendesk_(month.rangeEndExclusive);

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

/**
 * Backs the "Devices Report" tab: mode=devicesReport. Returns one row per
 * calendar month from DEVICES_REPORT_START_YEAR/MONTH through the current
 * month, each with devicesIn (Zendesk), devicesOut (the log tab), and
 * diff = devicesIn - devicesOut for THAT month specifically (not a running
 * cumulative balance — a positive diff means more came back than went out
 * that month, negative means the reverse).
 *
 * Each month's two numbers fail independently of each other AND of every
 * other month's — one bad Zendesk call for August doesn't take down
 * September's numbers, and a sheet-read problem doesn't take down Zendesk.
 */
function getDevicesReport_() {
  var months = buildReportMonthList_();

  var logRows;
  var logReadError = null;
  try {
    logRows = readDevicesOutLogRows_(getOrCreateDevicesOutLogSheet_());
  } catch (err) {
    logRows = [];
    logReadError = (err && err.message) ? err.message : String(err);
  }

  var result = [];
  for (var i = 0; i < months.length; i++) {
    var month = months[i];

    var devicesOut = null;
    var devicesOutError = logReadError;
    if (!logReadError) {
      try {
        devicesOut = countDevicesOutForMonth_(logRows, month);
      } catch (err) {
        devicesOutError = (err && err.message) ? err.message : String(err);
      }
    }

    var devicesIn = null;
    var devicesInError = null;
    try {
      devicesIn = fetchZendeskDeviceInCountForMonth_(month);
    } catch (err) {
      devicesInError = (err && err.message) ? err.message : String(err);
    }

    var diff = (devicesIn !== null && devicesOut !== null) ? (devicesIn - devicesOut) : null;

    result.push({
      month: month.label,
      devicesIn: devicesIn,
      devicesInError: devicesInError,
      devicesOut: devicesOut,
      devicesOutError: devicesOutError,
      diff: diff
    });
  }

  return { months: result, updatedAt: new Date().toISOString() };
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
