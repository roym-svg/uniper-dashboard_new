# This update: name matching, verification tool, cache, low stock, report missing

## 1. Robust Hebrew name normalization (`src/lib/nameMatch.js`)

Rewritten to handle three more cases beyond the existing punctuation/quote
stripping and ambiguity-safe substring matching:

- **Doubled י/ו variants** ("ktiv male" vs "ktiv chaser" spelling, e.g.
  "אפרים" vs "אפריים", "שנייבאום" vs "שניבאום") — runs of 2+ of either
  letter collapse to one, for comparison only; the original spelling is
  always what's displayed.
- **Word-order-independent matching** ("אפרים חותם" now matches
  "חותם אפרים") via a sorted-token comparison.
- The existing ambiguity safety is preserved throughout: a fallback match
  is only ever accepted when it resolves to exactly one distinct
  technician. Two different people who happen to share a name fragment
  (e.g. two technicians both named "דני") still never get merged — this
  was true before and stays true with the new logic layered on top.

I unit-tested this directly (not just through the UI) — doubled-letter
equivalence, word-order independence, the existing substring/region-note
fallback, and the ambiguity-safety guarantee all pass.

## 2. "בדיקת התאמת שמות" — name-match verification tool

New button on the admin `SelectGuide` screen, next to the existing three.
Opens a modal that:

- Lists every registered Firestore technician account, with a green
  "✓ מותאם (X ערכות)" badge showing how many sheet rows their name resolves
  to, or an orange "⚠️ לא נמצא בגיליון" badge if none do.
- Also lists sheet names that don't resolve to any registered account (the
  reverse gap) — useful for catching a technician who has rows in the sheet
  but no account yet, or a name spelled too differently for even the fuzzy
  matcher to bridge.

No Firestore rule changes were needed — `firestore.rules` already lets an
admin read any `/users/{uid}` doc, and that same rule covers listing the
whole collection since `isAdmin()` only ever depends on the caller's own
document, not which doc is being iterated.

## 3. 1-hour inventory cache (`src/lib/inventoryCache.js` + `App.jsx`)

The first load (or switching which technician an admin is viewing) now
checks `localStorage` for a cache entry younger than 1 hour and serves it
directly, skipping the Apps Script fetch entirely. The "רענן נתונים" button
(renamed from the previous English "Refresh Data") always bypasses the
cache, fetches fresh, and rewrites the cache entry. A small "עודכן לפני X
דקות" label next to the button shows how old the currently-displayed data
is.

I verified this behavior directly (not just visually): a fresh cache skips
the network call, a stale (>1hr) cache is ignored and a fresh fetch
happens, and the refresh button always bypasses the cache regardless of its
age.

## 4. Low-stock banner (`Dashboard.jsx`)

An amber banner appears above the device list whenever the currently
displayed technician has 4 or fewer healthy devices, for both the
technician's own view and an admin viewing that technician.

## 5. "לא אצלי" (Report Missing) — needs one manual step in Apps Script

Each device row now has a "לא אצלי" button. Clicking it POSTs to your Apps
Script backend, which emails a notification. **This requires adding a new
function to your Apps Script project** — delivered separately as
`apps-script-report-missing-addition.gs`, since I don't have your live
Code.gs source in this conversation (it only exists in the Apps Script
editor, not the git repo) and didn't want to risk reconstructing your whole
file from memory and subtly breaking the existing `doGet`.

**To activate it:**

1. Open your Apps Script project (script.google.com → your project).
2. Paste the contents of `apps-script-report-missing-addition.gs` in,
   alongside your existing code (if you already have a function named
   `doPost`, merge the body of the new one into it instead — a project can
   only have one `doPost`).
3. **Change `REPORT_MISSING_RECIPIENT`** at the top from
   `CHANGE_ME@example.com` to the real inbox that should get these reports.
4. **Redeploy**: Deploy → Manage deployments → edit your existing
   deployment → "New version" → Deploy. A URL deployed before `doPost`
   existed will not pick it up without this step.
5. Test it for real: click "לא אצלי" on a device in the running app and
   confirm the email arrives. **I could not test this myself** — this
   sandbox has no network access to `script.google.com` or Firebase, so
   this is written to the documented Apps Script API and the standard
   `text/plain`-content-type-avoids-CORS-preflight pattern, but hasn't been
   run against your real project.

The frontend side (`src/lib/api.js`'s `reportMissing()`, and the button in
`Dashboard.jsx`) works regardless — it just won't successfully deliver an
email until the Apps Script side above is in place. Until then, clicking
"לא אצלי" will show the button's error/retry state.
