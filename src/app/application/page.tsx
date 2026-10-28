
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type ApplicationDraft = {
  firstName: string;
  lastName: string;
  school: string;
  whyAttend: string;
  currentStep: number;
  status: "draft";
};

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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let requestId = 0;

    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        const id = ++requestId;

        setLoading(true);
        setUser(currentUser);
        setDraft({ ...emptyDraft });
        setMessage("");

        if (!currentUser) {
          setLoading(false);
          return;
        }

        try {
          const docRef = doc(
            db,
            "applications",
            currentUser.uid
          );

          const snapshot = await getDoc(docRef);

          if (id !== requestId) return;

          if (snapshot.exists()) {
            setDraft(snapshot.data() as ApplicationDraft);
          }
        } catch (error) {
          if (id !== requestId) return;

          console.error("Error loading application:", error);
          setMessage("Could not load your saved application.");
        } finally {
          if (id === requestId) {
            setLoading(false);
          }
        }
      }
    );

    return () => {
      requestId++;
      unsubscribe();
    };
  }, []);

  function updateField(
    field: "firstName" | "lastName" | "school" | "whyAttend",
    value: string
  ) {
    setDraft((previous) => ({
      ...previous,
      [field]: value,
    }));

    setMessage("");
  }

  async function saveDraft() {
    if (!user || saving || loading) return;

    setSaving(true);
    setMessage("");

    try {
      const docRef = doc(
        db,
        "applications",
        user.uid
      );

      await setDoc(docRef, draft);

      setMessage("Your progress has been saved!");
    } catch (error) {
      console.error("Error saving application:", error);
      setMessage("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="p-8">
        <p>Loading your application...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="mb-4 text-3xl font-bold">
          Hack the Coast Application
        </h1>

        <p>Please sign in to start your application.</p>

        <Link
          href="/login"
          className="mt-4 inline-block rounded bg-blue-600 px-5 py-3 text-white"
        >
          Go to Login
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 p-8">
      <header>
        <h1 className="text-3xl font-bold">
          Hack the Coast Application
        </h1>

        <p className="mt-2 text-sm opacity-70">
          Signed in as {user.email}
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

      <button
        type="button"
        onClick={saveDraft}
        disabled={saving}
        className="w-full rounded bg-blue-600 px-5 py-3 font-medium text-white disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Progress"}
      </button>

      {message && (
        <p role="status" className="text-center text-sm">
          {message}
        </p>
      )}

      <p className="text-center text-sm opacity-60">
        This is a development prototype.
        Progress is saved when you click Save Progress.
      </p>
    </main>
  );
}