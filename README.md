# Pratikriti Registrations

Password-protected live dashboard for **Pratikriti**, Day 0 of IEMPACT, by IEM Photography Club.
It shows total and event-wise registrations, Chitrantar photo submissions, genre/theme splits,
date-wise charts, colleges, and a detailed fee-collection breakdown.

```
4 Google Form response sheets (Restricted)
        │  read-only, as a Google service account
        ▼
Vercel function /api/stats ── counts only, behind a password ──► browser
```

- The sheets stay **Restricted**. They are shared only with the service account's email.
- No names, phone numbers, emails, transaction IDs or Drive links ever leave the server.
- Sheet IDs, the Google key and the password live only in Vercel environment variables.

## Folder layout

| Path | What it is |
| --- | --- |
| `public/` | The website (plain HTML/CSS/JS, no build step) |
| `api/stats.js` | Reads the sheets and returns statistics (needs a login session) |
| `api/login.js` | Checks the password and sets a secure session cookie |
| `lib/events.js` | **Which column holds what** in each form, genres and fees. Edit here if a form changes |
| `lib/aggregate.js` | Turns form rows into counts, charts and fee figures |
| `lib/sheets.js` | Google Sheets reader (service account, read-only) |
| `lib/auth.js` | Password check, signed cookie, brute-force lockout |

## Setup

### 1. Create the Google service account (about 10 minutes, free)

1. Open <https://console.cloud.google.com/> and create a project (e.g. `pratikriti-dashboard`).
2. **APIs & Services → Library** → search **Google Sheets API** → **Enable**.
3. **APIs & Services → Credentials → Create credentials → Service account**. Give it a name and click
   **Done** (no roles needed).
4. Open the service account → **Keys → Add key → Create new key → JSON**. A `.json` file downloads.
   Keep it private and never commit it.
5. Copy the service account's email (looks like `name@project.iam.gserviceaccount.com`).

### 2. Share the four response sheets with it

For each sheet (Chitrantar, Kshanika, Chitragati, Rongolipi): **Share** → paste the service account
email → **Viewer** → untick "Notify people" → **Share**. General access can stay **Restricted**.

### 3. Deploy on Vercel

1. <https://vercel.com> → **Add New… → Project** → import
   **Deepan003/PRATIKRITI-Registration-counter**. Framework preset: **Other**.
2. Add these **Environment Variables** before clicking Deploy:

| Name | Value |
| --- | --- |
| `DASHBOARD_PASSWORD` | the dashboard password |
| `SESSION_SECRET` | any long random string (optional, recommended) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | open the downloaded `.json` file, copy everything, paste |
| `SHEET_CHITRANTAR` | the Chitrantar responses sheet link (or just its ID) |
| `SHEET_KSHANIKA` | Kshanika responses sheet link |
| `SHEET_CHITRAGATI` | Chitragati responses sheet link |
| `SHEET_RONGOLIPI` | Rongolipi responses sheet link |

3. **Deploy**. If you change a variable later: **Deployments → ⋯ → Redeploy**.

An event whose sheet variable is empty simply shows as "not connected".

## How things are counted

- **Registrations**: one form response = one registration.
- **Chitrantar submissions**: photos, not rows. A registration with 3 photos counts 3, each under its own theme.
- **Chitragati "Both"**: one registration. It's shown as its own slice so nobody is counted twice.
- **Fees**: from the option each person chose. Chitrantar ₹49 / ₹89 / ₹129 for 1 / 2 / 3 photos,
  Kshanika ₹79, Chitragati ₹29 (one section) or ₹49 (both), Rongolipi ₹39 per member (each response =
  one member). Genre-wise fees split a multi-photo / two-section fee equally across what it covers.
  Fees are **not** checked against payment screenshots or transaction IDs.
- **Colleges**: spelling variants are merged (e.g. "IEM", "IEM Salt Lake", "Institute of Engineering
  & Management" → IEM Kolkata). Add more rules in `COLLEGE_ALIASES` in `lib/events.js`.
- Days are in Indian Standard Time.

## If a form changes

Columns are matched **by position**, because some forms repeat question titles. If questions are
added or reordered, update the column numbers in `lib/events.js` (A = 0, B = 1, …). The function logs
a warning in Vercel when a header no longer looks right.

## Security

- Password checked on the server only (constant-time compare); 8 wrong tries from one IP locks it for 15 min.
- Session is an HttpOnly, Secure, SameSite=Strict signed cookie (7 days). Sign-out clears it.
  Changing `DASHBOARD_PASSWORD` or `SESSION_SECRET` signs everyone out.
- Statistics responses are `private, no-store`, so they're never cached on a shared CDN.
- Strict Content-Security-Policy, no third-party scripts, `noindex`, frames blocked, per-IP rate limit.
- `.gitignore` blocks spreadsheet exports and key files from ever being committed.
