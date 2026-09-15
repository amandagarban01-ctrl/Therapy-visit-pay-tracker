# Visit Pay Tracker

A simple, private tracking app for logging therapy visits and expected pay, then
reconciling that against the paychecks you actually receive — so you can catch
underpayment or missed visits quickly.

**No patient information is collected.** There are no name, date of birth, or
patient-ID fields anywhere in the app. Only track: visit date, agency, visit
type, expected pay, and pay status.

## Features

- **Agencies** — add each agency you work for once: its name, its recurring
  pay-period schedule (weekly, biweekly, semi-monthly, or monthly), and an
  optional standard dollar rate per visit type. Agencies are then a picklist
  everywhere else in the app — no retyping.
- **Calendar entry** — the Visits tab opens on a month calendar. Click any day
  to add a visit for that date, or click an existing entry to edit or delete
  it. A list of all visits (filterable by agency, visit type, and status) sits
  below the calendar for bulk review.
- **Visits** — log each billable visit: date, agency, visit type (PT
  Evaluation, PT Visit, Reassessment, Discharge Discipline, Discharge OASIS,
  Recertification, or OASIS), expected pay, expected pay date, and status
  (pending / paid / disputed). If the agency has a standard rate set for that
  visit type, the amount auto-fills — still editable per visit.
- **Travel pay & extra pay** — each visit also has two optional add-on
  amounts: travel pay (mileage/travel time) and extra pay (a bonus, covering
  a shift, or other one-off compensation). Both are added to the visit's
  base pay everywhere totals show up — the calendar, the visits table, pay
  periods, and reconciliation — while staying broken out separately in the
  visits table and CSV export so you can see exactly what each dollar was for.
- **Expected pay by period** — every visit is automatically grouped into its
  agency's pay period, so you can see what you're owed — per agency, per
  period — before a check even arrives.
- **Paychecks & Reconciliation** — log each paycheck you receive (agency, pay
  period, actual amount, check/reference number). The app sums the expected
  pay for all visits from that agency falling inside the pay period and shows
  the **difference** between what you expected and what you actually got
  paid, so shortfalls are easy to spot.
- **Paystub photos** — attach a photo of the actual paystub to any paycheck
  entry, right next to that period's expected-vs-actual numbers, so you can
  visually compare the check to what you logged. One photo per paycheck;
  uploading a new one replaces the old. This is a visual reference only —
  nothing on the photo is read automatically.
- **Share disputed pay periods** — the Share tab lists every pay period where
  a logged paycheck doesn't match the expected total. Tap Share on any of
  them to send the details (agency, period, expected/received amounts, and
  every visit in that period) by email or text — it uses your device's
  native share sheet, or copies the summary to your clipboard if that isn't
  available. Give an agency an optional payroll contact email/phone (in the
  Agencies tab) and it's included in the message automatically.
- **Backup / restore** — export all data (agencies, visits, paychecks) as a
  JSON file, or visits as CSV, and re-import the JSON later or on another
  device.

## Running it

No build step or server required.

- **Locally:** open `index.html` directly in a browser, or serve the folder
  with any static file server, e.g.:

  ```bash
  python3 -m http.server 8000
  ```

  then visit `http://localhost:8000`.

- **GitHub Pages:** enable Pages for this repo (Settings → Pages → deploy from
  branch), pointing at the branch/folder containing `index.html`.

## Data & privacy notes

- **Two ways this app can store data**, depending on where you open it:
  - **The hosted Claude artifact link** — saves to private, durable cloud
    storage tied to that link (survives app updates, and paystub photo
    uploads only work here). A small status line under the header says
    "Checking cloud storage…" briefly on load; it's gone once your data is
    confirmed synced.
  - **This repo — `index.html` opened locally, or via GitHub Pages** —
    always runs in browser-only mode: everything is saved to this browser's
    `localStorage` and paystub photo upload is hidden, since that needs the
    Claude-hosted runtime. Nothing is sent anywhere.
- In browser-only mode, data does not sync across devices or browsers
  automatically, and clearing your browser's site data will erase your
  entries — use **Data → Export JSON Backup** regularly and **Import** on
  another device/browser to bring it along.
- Do not enter patient names or identifiers in the "Notes" field — the app is
  designed to track payment logistics only.
- If you used an earlier version of this app, your existing visits and
  paychecks are preserved automatically: on first load, any agency name you'd
  typed as free text is turned into a proper Agency entry (with a default
  monthly schedule and no preset rates, which you can adjust in the Agencies
  tab). Older visits won't have a visit type set until you edit them.
