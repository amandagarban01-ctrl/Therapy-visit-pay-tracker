# Visit Pay Tracker

A simple, private tracking app for logging therapy visits and expected pay, then
reconciling that against the paychecks you actually receive — so you can catch
underpayment or missed visits quickly.

**No patient information is collected.** There are no name, date of birth, or
patient-ID fields anywhere in the app. Only track: visit date, company/payer,
session type (e.g. "Individual 45min"), expected pay, and pay status.

## Features

- **Calendar entry** — the Visits tab opens on a month calendar. Click any day
  to add a visit for that date, or click an existing entry to edit or delete
  it. A list of all visits (with filters by company/status) sits below the
  calendar for bulk review.
- **Visits** — log each billable visit: date, company/payer, session type,
  expected pay amount, expected pay date, and status (pending / paid / disputed).
- **Paychecks & Reconciliation** — log each paycheck you receive (company, date
  received, pay period start/end, actual amount, check/reference number). The
  app automatically sums the expected pay for all visits from that company
  falling inside the pay period and shows the **difference** between what you
  expected and what you actually got paid, so shortfalls are easy to spot.
- **Data stays local** — everything is stored in your browser's `localStorage`.
  Nothing is sent to a server.
- **Backup / restore** — export all data as a JSON file (or visits as CSV) and
  re-import it later or on another device.

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
- Do not enter patient names or identifiers in the "Notes" or "Session type"
  fields — the app is designed to track payment logistics only.
