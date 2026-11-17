import { NextRequest, NextResponse } from "next/server";
import type { ApplicationRecord } from "@/lib/applicationSchema";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { upsertApplicationRow } from "@/lib/sheets";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const user = await getAdminAuth().verifyIdToken(authHeader.slice(7));

    // A fake application for the signed-in user. Running the test again
    // updates the same row instead of adding a new one.
    const testRecord: ApplicationRecord = {
      uid: user.uid,
      email: user.email ?? "",
      status: "submitted",
      submittedAt: new Date().toISOString(),
      firstName: "Test",
      lastName: "Applicant",
      ageRange: "18–25",
      pronouns: "they/them",
      country: "Canada",
      phone: "000-000-0000",
      school: "University of British Columbia",
      levelOfStudy: "Undergraduate University (3+ year)",
      major: "Testing",
      yearLevel: "2",
      hackathonsAttended: 0,
      dietaryRestrictions: "None",
      referralSource: "Other",
      resumeUrl: "",
      hopeToLearn: "Testing Google Sheets integration",
      recentChallenge: "Test answer",
      teamRole: "Test answer",
      favouriteBodyOfWater: "Test answer",
      playlistSong: "",
      consentUbcCoc: true,
      consentMlhCoc: true,
      consentMlhDataSharing: true,
      consentSusEmails: false,
      consentPhotos: false,
      consentMlhMarketing: false,
    };

    await upsertApplicationRow(testRecord);

    return NextResponse.json({
      success: true,
      message: "Test row written to Google Sheets!",
    });
  } catch (error) {
    console.error("Google Sheets test failed:", error);
    return NextResponse.json(
      { error: "Failed to write to Google Sheets" },
      { status: 500 }
    );
  }
}
