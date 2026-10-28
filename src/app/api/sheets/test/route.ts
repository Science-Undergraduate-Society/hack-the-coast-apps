import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import {
  cert,
  getApp,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

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

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
      ?.replace(/\\n/g, "\n");
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    if (!projectId || !clientEmail || !privateKey || !spreadsheetId) {
      throw new Error("Missing Google Sheets configuration");
    }

    const adminApp = getApps().length
      ? getApp()
      : initializeApp({
          credential: cert({ projectId, clientEmail, privateKey }),
        });

    const user = await getAuth(adminApp).verifyIdToken(
      authHeader.slice(7)
    );

    const googleAuth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({
      version: "v4",
      auth: googleAuth,
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "'Applications'!A:G",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[
          user.uid,
          "Test",
          "Applicant",
          user.email ?? "",
          "UBC",
          "Testing Google Sheets integration",
          new Date().toISOString(),
        ]],
      },
    });

    return NextResponse.json({
      success: true,
      message: "Test row added to Google Sheets!",
    });
  } catch (error) {
    console.error("Google Sheets test failed:", error);
    return NextResponse.json(
      { error: "Failed to write to Google Sheets" },
      { status: 500 }
    );
  }
}