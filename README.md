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
- **Expected pay by period** — every visit is automatically grouped into its
  agency's pay period, so you can see what you're owed — per agency, per
  period — before a check even arrives.
- **Paychecks & Reconciliation** — log each paycheck you receive (agency, pay
  period, actual amount, check/reference number). The app sums the expected
  pay for all visits from that agency falling inside the pay period and shows
  the **difference** between what you expected and what you actually got
  paid, so shortfalls are easy to spot.
- **Data stays local** — everything is stored in your browser's `localStorage`.
  Nothing is sent to a server.
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

- Data lives only in the browser you use — it does not sync across devices or
  browsers automatically. Use **Data → Export JSON Backup** regularly, and
  **Import** on another device/browser to bring it along.
- Because storage is per-browser, clearing your browser's site data will erase
  your entries. Keep backups if that matters to you.
- Do not enter patient names or identifiers in the "Notes" field — the app is
  designed to track payment logistics only.
- If you used an earlier version of this app, your existing visits and
  paychecks are preserved automatically: on first load, any agency name you'd
  typed as free text is turned into a proper Agency entry (with a default
  monthly schedule and no preset rates, which you can adjust in the Agencies
  tab). Older visits won't have a visit type set until you edit them.
