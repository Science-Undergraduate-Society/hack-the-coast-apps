// Server-only helpers for the Google Sheet. Never import this from a client
// component: it reads the service account private key.

import { google } from "googleapis";
import {
  APP_COLUMN_RUNS,
  LAST_SHEET_COLUMN,
  SHEET_TAB,
  columnLetter,
  sheetColumnIndex,
  toSheetValues,
  type AppColumnRun,
  type ApplicationRecord,
  type ApplicationStatus,
} from "@/lib/applicationSchema";

const TAB = `'${SHEET_TAB}'`;

function getSheetsConfig() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n"
  );
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  if (!clientEmail || !privateKey || !spreadsheetId) {
    throw new Error("Missing Google Sheets configuration");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return {
    sheets: google.sheets({ version: "v4", auth }),
    spreadsheetId,
  };
}

// Writes an applicant's row to the Sheet, keeping it in sync with Firestore.
// If a row with this UID exists, only the server-written columns are
// updated, so organizers' Decision and Notes are kept. Otherwise a new row is
// added at the bottom. Call this after every server-side change to an
// application (submit, status change, RSVP).
//
// Values are written as RAW so that answers starting with "=" are stored as
// text instead of running as formulas.
export async function upsertApplicationRow(record: ApplicationRecord) {
  const { sheets, spreadsheetId } = getSheetsConfig();

  // Column A holds UIDs. Row 1 is the header row.
  const uidColumn = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${TAB}!A:A`,
  });

  const rowIndex = (uidColumn.data.values ?? []).findIndex(
    (row, index) => index > 0 && row[0] === record.uid
  );

  // Write only the server-written columns of a row. The organizer columns in
  // between are never touched, even with blanks: writing "" into a Decision
  // cell hides its dropdown.
  const writeRuns = (rowNumber: number, runs: AppColumnRun[]) =>
    runs.length === 0
      ? Promise.resolve()
      : sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: "RAW",
            data: runs.map((run) => ({
              range: `${TAB}!${run.startLetter}${rowNumber}:${run.endLetter}${rowNumber}`,
              values: [toSheetValues(record, run.fields)],
            })),
          },
        });

  if (rowIndex !== -1) {
    await writeRuns(rowIndex + 1, APP_COLUMN_RUNS);
    return;
  }

  // New applicant. Append just the first run (starting with UID in column A)
  // so Sheets picks the next empty row for us, then fill in the rest of that
  // row. OVERWRITE fills an existing empty row instead of inserting one, so
  // the row keeps the column-wide dropdown and protection.
  const [firstRun, ...otherRuns] = APP_COLUMN_RUNS;

  const appended = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${TAB}!${firstRun.startLetter}:${firstRun.endLetter}`,
    valueInputOption: "RAW",
    insertDataOption: "OVERWRITE",
    requestBody: { values: [toSheetValues(record, firstRun.fields)] },
  });

  const updatedRange = appended.data.updates?.updatedRange ?? "";
  const rowNumber = Number(updatedRange.match(/![A-Z]+(\d+)/)?.[1]);

  if (!rowNumber) {
    throw new Error(`Couldn't tell which row was added: "${updatedRange}"`);
  }

  await writeRuns(rowNumber, otherRuns);
}

export type SheetDecisionRow = {
  rowNumber: number;
  uid: string;
  name: string;
  status: string;
  decision: string;
};

// Reads the UID, name, Status and Decision of every applicant row.
export async function readDecisionRows(): Promise<SheetDecisionRow[]> {
  const { sheets, spreadsheetId } = getSheetsConfig();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${TAB}!A2:${LAST_SHEET_COLUMN}`,
  });

  const uid = sheetColumnIndex("uid");
  const firstName = sheetColumnIndex("firstName");
  const lastName = sheetColumnIndex("lastName");
  const status = sheetColumnIndex("status");
  const decision = sheetColumnIndex("decision");

  return (response.data.values ?? [])
    .map((row, index) => ({
      rowNumber: index + 2,
      uid: String(row[uid] ?? "").trim(),
      name: `${row[firstName] ?? ""} ${row[lastName] ?? ""}`.trim(),
      status: String(row[status] ?? "").trim(),
      decision: String(row[decision] ?? "").trim().toLowerCase(),
    }))
    .filter((row) => row.uid !== "");
}

// Sets the Status cell of several rows at once.
export async function writeStatuses(
  updates: { rowNumber: number; status: ApplicationStatus }[]
) {
  if (updates.length === 0) return;

  const { sheets, spreadsheetId } = getSheetsConfig();
  const statusLetter = columnLetter(sheetColumnIndex("status") + 1);

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: updates.map(({ rowNumber, status }) => ({
        range: `${TAB}!${statusLetter}${rowNumber}`,
        values: [[status]],
      })),
    },
  });
}
