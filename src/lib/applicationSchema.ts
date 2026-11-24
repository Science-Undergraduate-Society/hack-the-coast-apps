// The shape of applicant data, shared by Firestore and the Google Sheet.
//
// Firestore (applications/{uid}) holds the real data. The Sheet is where
// organizers review applicants and make decisions:
//
// - App columns (applicant answers, Status) are written only by the server.
//   It adds a row when someone submits and updates that row whenever their
//   data or status changes. Organizers can't edit these columns (they're
//   protected in the Sheet).
// - Organizer columns (Decision, Organizer Notes) are edited only by
//   organizers. The server never writes them.
// - Decisions reach Firestore in batches: when organizers click
//   "Hack the Coast → Release decisions" in the Sheet, the server copies each
//   unreleased Decision into Firestore and updates Status to match.
//
// Questions are based on the Feb 2026 application until the hackathon team
// confirms this year's.

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------
//
//   draft → submitted → accepted   → confirmed / declined
//                     → waitlisted → accepted (if a spot opens) / rejected
//                     → rejected
//
// draft       Started, not submitted. The only status the applicant can edit.
// submitted   Applicant hit submit. Set by the server.
// accepted    Offered a spot. Set when organizers release decisions.
// waitlisted  May get a spot later. Set when organizers release decisions.
// rejected    Not offered a spot. Set when organizers release decisions.
// confirmed   Accepted and RSVP'd yes. Set by the server on RSVP.
// declined    Accepted but RSVP'd no. Set by the server on RSVP.

export const APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "accepted",
  "waitlisted",
  "rejected",
  "confirmed",
  "declined",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

// What organizers can pick in the Sheet's Decision column.
export const DECISIONS = ["accepted", "waitlisted", "rejected"] as const;

export type Decision = (typeof DECISIONS)[number];

export function isDecision(value: unknown): value is Decision {
  return DECISIONS.includes(value as Decision);
}

// Whether releasing a decision may move an applicant out of their current
// status. Decisions apply to submitted or waitlisted applicants only, so a
// release can never undo an acceptance someone has already seen or RSVP'd to.
export function canApplyDecision(
  current: ApplicationStatus,
  decision: Decision
): boolean {
  if (current === "submitted") return true;
  if (current === "waitlisted") return decision !== "waitlisted";
  return false;
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export const AGE_RANGES = ["<18", "18–25", ">25"] as const;
export const YEAR_LEVELS = ["1", "2", "3", "4", "5", "6+", "N/A"] as const;
// MLH's standard "level of study" list.
export const LEVELS_OF_STUDY = [
  "Less than Secondary / High School",
  "Secondary / High School",
  "Undergraduate University (2 year - community college or similar)",
  "Undergraduate University (3+ year)",
  "Graduate University (Masters, Professional, Doctoral, etc)",
  "Code School / Bootcamp",
  "Other Vocational / Trade Program or Apprenticeship",
  "Post Doctorate",
  "Other",
  "I'm not currently a student",
  "Prefer not to answer",
] as const;
export const REFERRAL_SOURCES = [
  "Instagram",
  "LinkedIn",
  "Word of mouth",
  "Newsletter",
  "Club",
  "Discord",
  "Devpost",
  "Previous event",
  "Website",
  "Other",
] as const;

export const SHORT_ANSWER_MAX_LENGTH = 300;
export const PLAYLIST_SONG_MAX_LENGTH = 150;

// Everything stored for one applicant. The applicant's UID is the Firestore
// document ID, so it isn't a field here.
export type Application = {
  status: ApplicationStatus;
  email: string; // From Firebase Auth, set by the server on submit.
  submittedAt: string | null; // ISO timestamp, set by the server on submit.

  // Personal info (all required)
  firstName: string;
  lastName: string;
  ageRange: (typeof AGE_RANGES)[number] | "";
  pronouns: string; // she/her, he/him, they/them, or free text
  country: string;
  phone: string;

  // Profile (all required)
  school: string;
  levelOfStudy: (typeof LEVELS_OF_STUDY)[number] | ""; // MLH standard list
  major: string;
  yearLevel: (typeof YEAR_LEVELS)[number] | "";

  // Additional info
  hackathonsAttended: number | null; // required
  dietaryRestrictions: string; // required
  referralSource: (typeof REFERRAL_SOURCES)[number] | ""; // optional
  resumeUrl: string; // optional, link to the file in Firebase Storage

  // Short answers (SHORT_ANSWER_MAX_LENGTH chars, all required except the song)
  hopeToLearn: string;
  recentChallenge: string;
  teamRole: string;
  favouriteBodyOfWater: string;
  playlistSong: string; // optional, PLAYLIST_SONG_MAX_LENGTH chars

  // Consent
  consentUbcCoc: boolean; // required
  consentMlhCoc: boolean; // required
  consentMlhDataSharing: boolean; // required: MLH data sharing, Contest Terms, Privacy Policy
  consentSusEmails: boolean; // optional
  consentPhotos: boolean; // optional
  consentMlhMarketing: boolean; // optional
};

// An application plus the applicant's UID, which is what a Sheet row holds.
export type ApplicationRecord = Application & { uid: string };

// ---------------------------------------------------------------------------
// Google Sheet layout
// ---------------------------------------------------------------------------

export const SHEET_TAB = "Applications";

type AppColumn = { field: keyof ApplicationRecord; header: string };
type OrganizerColumn = { organizerField: "decision" | "notes"; header: string };

// Column order in the Sheet. Values are written by position, not by header
// name, so row 1 of the Sheet must contain these headers in this exact order.
// To add a column, add it here AND add the header to the Sheet in the same
// position. Add new columns at the end so existing rows stay lined up.
//
// Columns with `field` are written by the server. Columns with
// `organizerField` are edited by organizers and never written by the server.
export const SHEET_COLUMNS = [
  // System
  { field: "uid", header: "UID" },
  { field: "email", header: "Email" },
  { field: "status", header: "Status" },

  // Organizers
  { organizerField: "decision", header: "Decision" },
  { organizerField: "notes", header: "Organizer Notes" },

  { field: "submittedAt", header: "Submitted At" },

  // Personal info
  { field: "firstName", header: "First Name" },
  { field: "lastName", header: "Last Name" },
  { field: "ageRange", header: "Age" },
  { field: "pronouns", header: "Pronouns" },
  { field: "country", header: "Country" },
  { field: "phone", header: "Phone" },

  // Profile
  { field: "school", header: "School" },
  { field: "levelOfStudy", header: "Level of Study" },
  { field: "major", header: "Major" },
  { field: "yearLevel", header: "Year Level" },

  // Additional info
  { field: "hackathonsAttended", header: "Hackathons Attended" },
  { field: "dietaryRestrictions", header: "Dietary Restrictions" },
  { field: "referralSource", header: "Heard About Us" },
  { field: "resumeUrl", header: "Resume" },

  // Short answers
  { field: "hopeToLearn", header: "Hope to Learn" },
  { field: "recentChallenge", header: "Recent Challenge" },
  { field: "teamRole", header: "Team Role" },
  { field: "favouriteBodyOfWater", header: "Favourite Body of Water" },
  { field: "playlistSong", header: "Playlist Song" },

  // Consent
  { field: "consentUbcCoc", header: "UBC Code of Conduct" },
  { field: "consentMlhCoc", header: "MLH Code of Conduct" },
  { field: "consentMlhDataSharing", header: "MLH Data Sharing & Terms" },
  { field: "consentSusEmails", header: "SUS Email Updates" },
  { field: "consentPhotos", header: "Photo Consent" },
  { field: "consentMlhMarketing", header: "MLH Marketing Emails" },
] as const satisfies readonly (AppColumn | OrganizerColumn)[];

// Turns a 1-based column number into its letter: 1 → A, 27 → AA.
export function columnLetter(columnNumber: number): string {
  let letters = "";
  let n = columnNumber;

  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }

  return letters;
}

// Letter of the last column, e.g. "AC".
export const LAST_SHEET_COLUMN = columnLetter(SHEET_COLUMNS.length);

// 0-based position of a column in SHEET_COLUMNS (and in a row read from the
// Sheet).
export function sheetColumnIndex(
  key: AppColumn["field"] | OrganizerColumn["organizerField"]
): number {
  const index = SHEET_COLUMNS.findIndex(
    (column) =>
      ("field" in column && column.field === key) ||
      ("organizerField" in column && column.organizerField === key)
  );

  if (index === -1) throw new Error(`No Sheet column for "${key}"`);
  return index;
}

type CellValue = string | number | boolean;

// A run of side-by-side server-written columns, e.g. A–C or F–AE.
export type AppColumnRun = {
  startLetter: string;
  endLetter: string;
  fields: AppColumn["field"][];
};

// The server-written columns, grouped into runs so the server can update a
// row without touching the organizer columns in between.
export const APP_COLUMN_RUNS: AppColumnRun[] = (() => {
  const runs: AppColumnRun[] = [];
  let current: AppColumnRun | null = null;

  SHEET_COLUMNS.forEach((column, index) => {
    const letter = columnLetter(index + 1);

    if (!("field" in column)) {
      current = null;
      return;
    }

    if (current) {
      current.endLetter = letter;
      current.fields.push(column.field);
    } else {
      current = { startLetter: letter, endLetter: letter, fields: [column.field] };
      runs.push(current);
    }
  });

  return runs;
})();

// The values for a run of server-written columns.
export function toSheetValues(
  record: ApplicationRecord,
  fields: AppColumn["field"][]
): CellValue[] {
  return fields.map((field) => record[field] ?? "");
}
