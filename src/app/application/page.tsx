"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type ApplicationDraft = {
  firstName: string;
  lastName: string;
  school: string;
  whyAttend: string;
  currentStep: number;
  status: "draft";
};

type SaveStatus = "saved" | "unsaved" | "saving" | "error";

const emptyDraft: ApplicationDraft = {
  firstName: "",
  lastName: "",
  school: "",
  whyAttend: "",
  currentStep: 1,
  status: "draft",
};

export default function ApplicationPage() {
  const [user, setUser] = useState<User | null>(null);
  const [draft, setDraft] = useState<ApplicationDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [loadError, setLoadError] = useState("");
  const [testingSheets, setTestingSheets] = useState(false);
  const [sheetsMessage, setSheetsMessage] = useState("");

  // Track edits so loading a draft doesn't trigger autosave.
  const versionRef = useRef(0);
  const savedVersionRef = useRef(0);

  // Keep Firestore writes in order.
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Load the applicant's saved draft.
  useEffect(() => {
    let active = true;
    let requestId = 0;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const id = ++requestId;

      setLoading(true);
      setUser(currentUser);
      setDraft({ ...emptyDraft });
      setLoadError("");
      setSaveStatus("saved");
      setSheetsMessage("");
      versionRef.current = 0;
      savedVersionRef.current = 0;

      if (!currentUser) {
        setLoading(false);
        return;
      }

      try {
        const snapshot = await getDoc(
          doc(db, "applications", currentUser.uid)
        );

        if (
          !active ||
          id !== requestId ||
          auth.currentUser?.uid !== currentUser.uid
        ) {
          return;
        }

        if (snapshot.exists()) {
          setDraft(snapshot.data() as ApplicationDraft);
        }
      } catch (error) {
        console.error("Failed to load application:", error);

        if (active && id === requestId) {
          setLoadError(
            "Could not load your application. Please refresh before editing."
          );
        }
      } finally {
        if (active && id === requestId) {
          setLoading(false);
        }
      }
    });

    return () => {
      active = false;
      requestId++;
      unsubscribe();
    };
  }, []);

  function updateField(
    field: "firstName" | "lastName" | "school" | "whyAttend",
    value: string
  ) {
    versionRef.current += 1;

    setDraft((previous) => ({
      ...previous,
      [field]: value,
    }));

    setSaveStatus("unsaved");
  }

  const saveDraft = useCallback(
    async (snapshot: ApplicationDraft, version: number) => {
      if (!user || loadError) return;

      const userId = user.uid;

      if (version <= savedVersionRef.current) return;

      setSaveStatus("saving");

      // Serialize writes to avoid older saves overwriting newer ones.
      const operation = saveQueueRef.current
        .catch(() => {
          // A failed save should not block later attempts.
        })
        .then(async () => {
          if (auth.currentUser?.uid !== userId) return;

          await setDoc(
            doc(db, "applications", userId),
            snapshot
          );

          if (auth.currentUser?.uid !== userId) return;

          savedVersionRef.current = Math.max(
            savedVersionRef.current,
            version
          );

          if (version === versionRef.current) {
            setSaveStatus("saved");
          }
        });

      saveQueueRef.current = operation;

      try {
        await operation;
      } catch (error) {
        console.error("Failed to save application:", error);

        if (
          auth.currentUser?.uid === userId &&
          version === versionRef.current
        ) {
          setSaveStatus("error");
        }
      }
    },
    [user, loadError]
  );

  // Autosave one second after the applicant stops typing.
  useEffect(() => {
    if (loading || !user || loadError) return;
    if (saveStatus !== "unsaved") return;

    const snapshot = { ...draft };
    const version = versionRef.current;

    const timer = window.setTimeout(() => {
      void saveDraft(snapshot, version);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [draft, user, loading, loadError, saveStatus, saveDraft]);

  // Send a test request to the Google Sheets backend.
  async function testGoogleSheets() {
    if (testingSheets) return;

    setTestingSheets(true);
    setSheetsMessage("");

    try {
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error("Please sign in first.");
      }

      const token = await currentUser.getIdToken();

      const response = await fetch("/api/sheets/test", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ?? "Google Sheets request failed."
        );
      }

      setSheetsMessage(
        "Success! A test row was added to Google Sheets."
      );
    } catch (error) {
      console.error("Google Sheets test failed:", error);

      setSheetsMessage(
        error instanceof Error
          ? `Google Sheets test failed: ${error.message}`
          : "Google Sheets test failed."
      );
    } finally {
      setTestingSheets(false);
    }
  }

  if (loading) {
    return (
      <main className="p-8">
        Loading your application...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="mb-4 text-3xl font-bold">
          Hack the Coast Application
        </h1>

        <p>Please sign in to continue.</p>

        <Link
          href="/login"
          className="mt-4 inline-block underline"
        >
          Go to Login
        </Link>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-bold">
          Unable to load application
        </h1>

        <p role="alert" className="mt-4 text-red-600">
          {loadError}
        </p>
      </main>
    );
  }

  const statusMessages: Record<SaveStatus, string> = {
    saved: "✓ All changes saved",
    unsaved: "Unsaved changes",
    saving: "Saving...",
    error: "Save failed. Please retry.",
  };

  return (
    <main className="mx-auto max-w-xl space-y-6 p-8">
      <header>
        <h1 className="text-3xl font-bold">
          Hack the Coast Application
        </h1>

        <p className="mt-2 text-sm opacity-70">
          Signed in as {user.email}
        </p>

        <p
          role="status"
          aria-live="polite"
          className={`mt-3 text-sm ${
            saveStatus === "error"
              ? "text-red-600"
              : saveStatus === "saved"
                ? "text-green-600"
                : "opacity-70"
          }`}
        >
          {statusMessages[saveStatus]}
        </p>
      </header>

      <section className="space-y-5">
        <div>
          <label
            htmlFor="firstName"
            className="mb-2 block font-medium"
          >
            First Name
          </label>

          <input
            id="firstName"
            type="text"
            value={draft.firstName}
            onChange={(e) =>
              updateField("firstName", e.target.value)
            }
            placeholder="Enter your first name"
            className="w-full rounded border p-3"
          />
        </div>

        <div>
          <label
            htmlFor="lastName"
            className="mb-2 block font-medium"
          >
            Last Name
          </label>

          <input
            id="lastName"
            type="text"
            value={draft.lastName}
            onChange={(e) =>
              updateField("lastName", e.target.value)
            }
            placeholder="Enter your last name"
            className="w-full rounded border p-3"
          />
        </div>

        <div>
          <label
            htmlFor="school"
            className="mb-2 block font-medium"
          >
            School
          </label>

          <input
            id="school"
            type="text"
            value={draft.school}
            onChange={(e) =>
              updateField("school", e.target.value)
            }
            placeholder="e.g. University of British Columbia"
            className="w-full rounded border p-3"
          />
        </div>

        <div>
          <label
            htmlFor="whyAttend"
            className="mb-2 block font-medium"
          >
            Why do you want to attend Hack the Coast?
          </label>

          <textarea
            id="whyAttend"
            value={draft.whyAttend}
            onChange={(e) =>
              updateField("whyAttend", e.target.value)
            }
            placeholder="Tell us why you're interested..."
            maxLength={300}
            rows={5}
            className="w-full rounded border p-3"
          />

          <p className="mt-1 text-right text-sm opacity-60">
            {draft.whyAttend.length}/300 characters
          </p>
        </div>
      </section>

      {/* Manual save backup */}
      <button
        type="button"
        onClick={() =>
          void saveDraft({ ...draft }, versionRef.current)
        }
        disabled={saveStatus === "saving"}
        className="w-full rounded bg-blue-600 px-5 py-3 font-medium text-white disabled:opacity-50"
      >
        {saveStatus === "error"
          ? "Retry Save"
          : "Save Progress"}
      </button>

      <p className="text-center text-sm opacity-60">
        Your changes are saved automatically after you stop typing.
      </p>

      {/* Temporary Google Sheets test */}
      <div className="space-y-3 border-t pt-6">
        <h2 className="text-lg font-semibold">
          Google Sheets Integration Test
        </h2>

        <p className="text-sm opacity-70">
          This development-only button will append a test
          applicant row to your Google Sheet.
        </p>

        <button
          type="button"
          onClick={testGoogleSheets}
          disabled={testingSheets}
          className="w-full rounded bg-green-600 px-5 py-3 font-medium text-white disabled:opacity-50"
        >
          {testingSheets
            ? "Testing Connection..."
            : "Test Google Sheets Connection"}
        </button>

        {sheetsMessage && (
          <p role="status" className="text-sm">
            {sheetsMessage}
          </p>
        )}
      </div>
    </main>
  );
}