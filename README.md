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

Note: the "Test Google Sheets Connection" button on the application page adds a fake "Test Applicant" row to this sheet. Delete those rows when you're done testing.

### 7. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). It redirects to the login page.

## Firestore security rules

The rules are in [`firestore.rules`](firestore.rules). Each applicant's application is stored at `applications/{uid}`.

- Applicants can only read and edit **their own** application.
- Applicants can create and edit an application only while its `status` is `"draft"`, and they can't change `status`.
- Only the server (using the Firebase Admin SDK, which bypasses the rules) can mark an application submitted, accepted or RSVP'd.
- Applicants can only write the fields listed in `hasOnlyDraftFields()`. **When you add a field to the form, add it there too**, or saves will fail with a permission error.

To deploy the rules (requires access to the Firebase project):

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules --project <project-id>
```

You can also paste the rules into Firebase console → Firestore Database → Rules and click **Publish**.
