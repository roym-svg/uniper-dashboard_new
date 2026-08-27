// ─── ADDITION: "לא אצלי" (Report Missing) email notifications ─────────────
//
// This is NOT a full Code.gs — it's a new block to paste into your EXISTING
// Code.gs, alongside your current doGet and helper functions. I don't have
// your live Code.gs source in this conversation (it only lives in the Apps
// Script editor, not in the git repo), so rather than risk overwriting or
// subtly breaking your existing doGet/name-matching logic by trying to
// reconstruct the whole file from memory, this is a self-contained block
// you can paste in as-is.
//
// After pasting this in, you MUST redeploy: Deploy -> Manage deployments ->
// edit your existing deployment -> "New version" -> Deploy. A URL that was
// only ever deployed while your script had a doGet does NOT automatically
// pick up a newly added doPost — Apps Script needs a new version published.
//
// I could not test this against your real Firebase/Apps Script project —
// this sandbox has no network access to script.google.com. Test it once
// for real after deploying (click "לא אצלי" on a device and confirm the
// email arrives) before relying on it.

// Where "לא אצלי" reports get emailed. CHANGE THIS to a real inbox before
// deploying — a shared team inbox or a manager's address, whatever makes
// sense for your team.
var REPORT_MISSING_RECIPIENT = 'CHANGE_ME@example.com';

/**
 * Handles POST requests to the same web app URL your doGet already serves.
 * Currently only understands { action: "reportMissing", ... } — routes to
 * anything else return a clear "unknown action" error instead of silently
 * doing nothing, so a future addition here doesn't get confused with this
 * one if you add more POST actions later.
 *
 * If your existing Code.gs ALREADY has a function named `doPost`, you
 * cannot have two — merge the body of this one into your existing doPost
 * instead of pasting this whole function in verbatim (there's only ever
 * one doPost per Apps Script project; Apps Script does not run multiple
 * declarations of the same function name).
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (body.action === 'reportMissing') {
      return reportMissing_jsonResponse(handleReportMissing_(body));
    }

    return reportMissing_jsonResponse({ error: true, message: 'Unknown action: ' + body.action });
  } catch (err) {
    return reportMissing_jsonResponse({ error: true, message: 'Failed to process request: ' + err.message });
  }
}

function handleReportMissing_(body) {
  var serialNumber = String((body && body.serialNumber) || '').trim();
  var guideName = String((body && body.guideName) || '').trim();
  var reporterEmail = String((body && body.reporterEmail) || '').trim();

  if (!serialNumber) {
    return { error: true, message: 'Missing serialNumber.' };
  }

  var subject = 'דיווח "לא אצלי": ' + serialNumber;
  var bodyText =
    'התקבל דיווח שמכשיר אינו נמצא בפועל אצל הטכנאי הרשום עבורו בגיליון.\n\n' +
    'מספר סידורי: ' + serialNumber + '\n' +
    'טכנאי רשום בגיליון: ' + (guideName || 'לא ידוע') + '\n' +
    'דווח על ידי: ' + (reporterEmail || 'לא ידוע') + '\n' +
    'זמן: ' + new Date().toLocaleString('he-IL');

  MailApp.sendEmail(REPORT_MISSING_RECIPIENT, subject, bodyText);

  return { success: true };
}

// Named distinctly from any existing jsonResponse_ helper you may already
// have, so pasting this in can never collide with (or silently shadow)
// your existing doGet's response formatting.
function reportMissing_jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
