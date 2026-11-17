// Called by the "Hack the Coast → Release decisions" menu in the Google
// Sheet (see scripts/google-sheets/release-decisions.gs).
//
// For every row with a Decision, it moves the applicant's Firestore status to
// that decision (if allowed), then writes the new status into the row's
// Status column. Running it twice is safe: decisions that were already
// released are skipped, and any Status cell that's out of date is fixed.

import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  canApplyDecision,
  isDecision,
  type ApplicationStatus,
} from "@/lib/applicationSchema";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  readDecisionRows,
  writeStatuses,
  type SheetDecisionRow,
} from "@/lib/sheets";

export const runtime = "nodejs";

// How many applicants to update in Firestore at the same time.
const CONCURRENCY = 20;

function hasValidSecret(request: NextRequest): boolean {
  const secret = process.env.SHEETS_RELEASE_SECRET;
  const header = request.headers.get("authorization");

  if (!secret || !header?.startsWith("Bearer ")) return false;

  // Hash both so they're the same length for a constant-time comparison.
  const expected = createHash("sha256").update(secret).digest();
  const received = createHash("sha256").update(header.slice(7)).digest();

  return timingSafeEqual(expected, received);
}

type Outcome =
  | { kind: "released" | "unchanged"; status: ApplicationStatus }
  | { kind: "blocked"; status: ApplicationStatus }
  | { kind: "missing" };

async function releaseOne(row: SheetDecisionRow): Promise<Outcome> {
  const db = getAdminDb();
  const ref = db.collection("applications").doc(row.uid);
  const decision = row.decision;

  if (!isDecision(decision)) throw new Error("Not a decision");

  return db.runTransaction(async (transaction): Promise<Outcome> => {
    const snapshot = await transaction.get(ref);

    if (!snapshot.exists) return { kind: "missing" };

    const current = snapshot.get("status") as ApplicationStatus;

    if (current === decision) return { kind: "unchanged", status: current };
    if (!canApplyDecision(current, decision)) {
      return { kind: "blocked", status: current };
    }

    transaction.update(ref, { status: decision });
    return { kind: "released", status: decision };
  });
}

export async function POST(request: NextRequest) {
  if (!hasValidSecret(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const rows = await readDecisionRows();
    const problems: string[] = [];
    const statusUpdates: { rowNumber: number; status: ApplicationStatus }[] =
      [];
    let released = 0;

    const label = (row: SheetDecisionRow) =>
      `Row ${row.rowNumber}${row.name ? ` (${row.name})` : ""}`;

    const toRelease = rows.filter((row) => {
      if (row.decision === "") return false;

      if (!isDecision(row.decision)) {
        problems.push(
          `${label(row)}: "${row.decision}" isn't a valid decision.`
        );
        return false;
      }

      return true;
    });

    for (let i = 0; i < toRelease.length; i += CONCURRENCY) {
      const chunk = toRelease.slice(i, i + CONCURRENCY);
      const outcomes = await Promise.allSettled(chunk.map(releaseOne));

      outcomes.forEach((result, index) => {
        const row = chunk[index];

        if (result.status === "rejected") {
          console.error(`Failed to release ${row.uid}:`, result.reason);
          problems.push(`${label(row)}: couldn't be updated. Try again.`);
          return;
        }

        const outcome = result.value;

        if (outcome.kind === "missing") {
          problems.push(`${label(row)}: no application found for this UID.`);
          return;
        }

        if (outcome.kind === "blocked") {
          problems.push(
            `${label(row)}: already "${outcome.status}", so it can't be changed to "${row.decision}".`
          );
        }

        if (outcome.kind === "released") released += 1;

        // Keep the Sheet's Status in line with Firestore.
        if (outcome.status !== row.status) {
          statusUpdates.push({
            rowNumber: row.rowNumber,
            status: outcome.status,
          });
        }
      });
    }

    await writeStatuses(statusUpdates);

    return NextResponse.json({ released, problems });
  } catch (error) {
    console.error("Releasing decisions failed:", error);
    return NextResponse.json(
      { error: "Releasing decisions failed" },
      { status: 500 }
    );
  }
}
