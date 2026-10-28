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

  // Track edits so loading a draft doesn't trigger autosave.
  const versionRef = useRef(0);
  const savedVersionRef = useRef(0);

  // Keep Firestore writes in order.
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Load the current applicant's saved draft.
  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      setUser(currentUser);
      setDraft({ ...emptyDraft });
      setLoadError("");
      setSaveStatus("saved");
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

        if (!active || auth.currentUser?.uid !== currentUser.uid) {
          return;
        }

        if (snapshot.exists()) {
          setDraft(snapshot.data() as ApplicationDraft);
        }
      } catch (error) {
        console.error("Failed to load application:", error);

        if (active) {
          setLoadError(
            "Could not load your application. Please refresh before editing."
          );
        }
      } finally {
        if (active && auth.currentUser?.uid === currentUser.uid) {
          setLoading(false);
        }
      }
    });

    return () => {
      active = false;
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

      // Skip if this version has already been saved.
      if (version <= savedVersionRef.current) return;

      setSaveStatus("saving");

      const operation = saveQueueRef.current
        .catch(() => {
          // Allow later saves even if an earlier save failed.
        })
        .then(async () => {
          if (auth.currentUser?.uid !== userId) return;

          await setDoc(doc(db, "applications", userId), snapshot);

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

  // Autosave one second after the latest edit.
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

  if (loading) {
    return <main className="p-8">Loading your application...</main>;
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="mb-4 text-3xl font-bold">
          Hack the Coast Application
        </h1>
        <p>Please sign in to continue.</p>
        <Link href="/login" className="mt-4 inline-block underline">
          Go to Login
        </Link>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-bold">Unable to load application</h1>
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
          <label htmlFor="firstName" className="mb-2 block font-medium">
            First Name
          </label>
          <input
            id="firstName"
            className="w-full rounded border p-3"
            value={draft.firstName}
            onChange={(e) => updateField("firstName", e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="lastName" className="mb-2 block font-medium">
            Last Name
          </label>
          <input
            id="lastName"
            className="w-full rounded border p-3"
            value={draft.lastName}
            onChange={(e) => updateField("lastName", e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="school" className="mb-2 block font-medium">
            School
          </label>
          <input
            id="school"
            className="w-full rounded border p-3"
            value={draft.school}
            onChange={(e) => updateField("school", e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="whyAttend" className="mb-2 block font-medium">
            Why do you want to attend Hack the Coast?
          </label>
          <textarea
            id="whyAttend"
            className="w-full rounded border p-3"
            rows={5}
            maxLength={300}
            value={draft.whyAttend}
            onChange={(e) => updateField("whyAttend", e.target.value)}
          />
          <p className="mt-1 text-right text-sm opacity-60">
            {draft.whyAttend.length}/300 characters
          </p>
        </div>
      </section>

      <button
        type="button"
        onClick={() => void saveDraft({ ...draft }, versionRef.current)}
        disabled={saveStatus === "saving"}
        className="w-full rounded bg-blue-600 px-5 py-3 text-white disabled:opacity-50"
      >
        {saveStatus === "error" ? "Retry Save" : "Save Progress"}
      </button>

      <p className="text-center text-sm opacity-60">
        Your changes are saved automatically after you stop typing.
      </p>
    </main>
  );
}