# Hack the Coast Applications

Applicant portal for Hack the Coast. Applicants sign in with Firebase Auth, fill out an application that autosaves to Firestore, and application data is written to Google Sheets.

Built with Next.js, Firebase (Auth + Firestore) and the Google Sheets API.

## Setup

### 1. Install Node 24

Firebase needs Node 24.12 or newer. With [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install 24
nvm use 24
```

The repo has an `.nvmrc`, so after the first install you can run `nvm use` on its own.

### 2. Install dependencies

```bash
npm ci
```

### 3. Get access to the Firebase project

Ask the tech lead to add you to the club's Firebase project. You need access before you can generate a service account key (step 5).

### 4. Create your `.env` file

```bash
cp .env.example .env
```

`.env` is gitignored. Never commit it. Fill in every variable:

| Variable | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase console → ⚙️ Project settings → General → Your apps → Web app → SDK setup and configuration → Config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Same place as above |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Same place as above |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Same place as above |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Same place as above |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Same place as above |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` in the service account JSON (step 5) |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | `private_key` in the service account JSON (step 5) |
| `GOOGLE_SHEETS_ID` | The club account's Google Sheet, where application data is written. Ask the tech lead. |
| `SHEETS_RELEASE_SECRET` | Any long random string, e.g. from `openssl rand -hex 32`. Only needed to test [releasing decisions](#organizer-decisions) locally. The deployed app's value must match the Sheet's `RELEASE_SECRET`. |

The tech lead can also send you the Firebase config and sheet IDs directly.

A sheet ID is the part of the sheet's URL between `/d/` and `/edit`:
`https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`

### 5. Generate your service account key

1. Firebase console → ⚙️ Project settings → **Service accounts** → **Generate new private key**.
2. Open the downloaded JSON file.
3. Copy `client_email` into `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
4. Copy `private_key` into `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`. Wrap it in double quotes and keep the `\n` sequences as they are:

   ```bash
   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
   ```

5. **Don't commit the JSON file.** Delete it, or store it outside the repo.

### 6. Check sheet access

The club sheet (`GOOGLE_SHEETS_ID`) needs a tab named exactly `Applications`, and it must be shared with your `GOOGLE_SERVICE_ACCOUNT_EMAIL` with **Editor** access. Ask the tech lead if you get a permission error.

The tab must be set up as described in [Setting up the Sheet](#setting-up-the-sheet-once-per-event).

Note: the "Test Google Sheets Connection" button on the application page writes a fake "Test Applicant" row for your account to this sheet. Delete that row when you're done testing.

### 7. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). It redirects to the login page.

## Applicant data

Every field, status and Sheet column is defined in [`src/lib/applicationSchema.ts`](src/lib/applicationSchema.ts). Start there when you change the form.

- **Firestore holds the real data.** Each application is stored at `applications/{uid}`.
- **The Google Sheet is where organizers review applicants and make decisions.** Once an applicant submits, the server writes one row for them. It updates that same row (matched by UID in column A) whenever their data or status changes, using `upsertApplicationRow` in [`src/lib/sheets.ts`](src/lib/sheets.ts).
- **Each column has one owner.** The server writes the applicant's answers and `Status`. Organizers edit only `Decision` and `Organizer Notes`, and the server never writes those. The server-written columns are protected so organizers can't change them by accident.
- **Drafts are not in the Sheet.** It only shows applications from `submitted` onward.
- **Columns are matched by position, not by name.** Row 1 must contain the headers from `SHEET_COLUMNS`, in that order. When you add a column, add it to the end of `SHEET_COLUMNS` and add its header to the Sheet in the same position.

Statuses:

| Status | Meaning | Set by |
| --- | --- | --- |
| `draft` | Started, not submitted. The applicant can still edit. | App, on first save |
| `submitted` | Applicant submitted. They can no longer edit. | Server |
| `accepted` | Offered a spot | Organizers, on release |
| `waitlisted` | May get a spot later | Organizers, on release |
| `rejected` | Not offered a spot | Organizers, on release |
| `confirmed` | Accepted and RSVP'd yes | Server, on RSVP |
| `declined` | Accepted and RSVP'd no | Server, on RSVP |

### Organizer decisions

1. Organizers pick `accepted`, `waitlisted` or `rejected` in the **Decision** column. Applicants don't see anything yet. `Status` still says `submitted`, so you can tell which decisions haven't gone out.
2. When they're ready, an organizer clicks **Hack the Coast → Release decisions** in the Sheet. The app copies each decision into Firestore and updates `Status` to match. A popup lists any rows it couldn't release.

Rules for releasing:

- A decision only applies to `submitted` or `waitlisted` applicants. An applicant who has already been accepted, rejected, confirmed or declined is left alone, and their row is listed in the popup. This means a release can't undo a decision the applicant has already seen.
- Releasing again is safe. Decisions that were already released are skipped.

### Setting up the Sheet (once per event)

Do this in the club account's Sheet.

1. **Header row.** Put the headers from `SHEET_COLUMNS` in row 1 of the `Applications` tab, in order. To get them tab-separated so they paste into A1 across the row:

   ```bash
   grep -oE 'header: "[^"]+"' src/lib/applicationSchema.ts | sed -E 's/header: "(.*)"/\1/' | paste -sd '\t' -
   ```

2. **Decision dropdown.** Select column `D` from row 2 down (`D2:D`). Then go to Data → Data validation → Add rule → Dropdown, with options `accepted`, `waitlisted` and `rejected`, and set it to **Reject the input**.
3. **Protect the server columns.** Go to Data → Protect sheets and ranges → Sheet → `Applications`. Tick **Except certain cells** and add `D2:E`. Under **Set permissions**, restrict editing to the club account **and** `GOOGLE_SERVICE_ACCOUNT_EMAIL`. If you leave out the service account, the app can't write rows.
4. **Share** the Sheet with organizers as **Editor**. They can only change Decision and Organizer Notes.
5. **Add the Release decisions menu.**
   1. Go to Extensions → Apps Script. Replace the contents of `Code.gs` with [`scripts/google-sheets/release-decisions.gs`](scripts/google-sheets/release-decisions.gs) and save.
   2. Go to Project Settings → Script properties. Add `RELEASE_URL` (`https://<deployed site>/api/sheets/release-decisions`) and `RELEASE_SECRET` (the same value as `SHEETS_RELEASE_SECRET` in the deployed app).
   3. Reload the Sheet. The **Hack the Coast** menu appears, and Google asks for permission the first time someone uses it.

The menu only works against the deployed site, because Apps Script runs on Google's servers and can't reach `localhost`. To test a release locally, call the endpoint yourself:

```bash
curl -X POST http://localhost:3000/api/sheets/release-decisions \
  -H "Authorization: Bearer <your SHEETS_RELEASE_SECRET>"
```

Anyone who can edit the Sheet can open its Apps Script and see `RELEASE_SECRET`. That's acceptable, because the secret only triggers a release, which they can already do from the menu. Don't reuse it anywhere else.

## Firestore security rules

The rules are in [`firestore.rules`](firestore.rules). Each applicant's application is stored at `applications/{uid}`.

- Applicants can only read and edit **their own** application.
- Applicants can create and edit an application only while its `status` is `"draft"`, and they can't change `status`.
- Only the server (using the Firebase Admin SDK, which bypasses the rules) can move an application out of `draft`.
- Applicants can only write the fields listed in `hasOnlyDraftFields()`. **When you add a field to the form, add it there too**, or saves will fail with a permission error.

To deploy the rules (requires access to the Firebase project):

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules --project htc-hack-application
```

You can also paste the rules into Firebase console → Firestore Database → Rules and click **Publish**.
