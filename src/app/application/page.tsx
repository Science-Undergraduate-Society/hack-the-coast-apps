"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import {
  AGE_RANGES,
  LEVELS_OF_STUDY,
  PLAYLIST_SONG_MAX_LENGTH,
  REFERRAL_SOURCES,
  SHORT_ANSWER_MAX_LENGTH,
  YEAR_LEVELS,
  type Application,
} from "@/lib/applicationSchema";

// What the applicant can edit and what autosave writes to applications/{uid}.
// Server-only fields (email, submittedAt) are left out, and so is resumeUrl
// until the team decides how resume upload works.
//
// firestore.rules (hasOnlyDraftFields) must list exactly these fields.
type ApplicationDraft = Omit<
  Application,
  "email" | "submittedAt" | "resumeUrl" | "status"
> & { status: "draft" };

type SaveStatus = "saved" | "unsaved" | "saving" | "error";

const emptyDraft: ApplicationDraft = {
  status: "draft",

  // Personal info
  firstName: "",
  lastName: "",
  ageRange: "",
  pronouns: "",
  country: "",
  phone: "",

  // Profile
  school: "",
  levelOfStudy: "",
  major: "",
  yearLevel: "",

  // Additional info
  hackathonsAttended: null,
  dietaryRestrictions: "",
  referralSource: "",

  // Short answers
  hopeToLearn: "",
  recentChallenge: "",
  teamRole: "",
  favouriteBodyOfWater: "",
  playlistSong: "",

  // Consent
  consentUbcCoc: false,
  consentMlhCoc: false,
  consentMlhDataSharing: false,
  consentSusEmails: false,
  consentPhotos: false,
  consentMlhMarketing: false,
};

const draftFields = Object.keys(emptyDraft) as (keyof ApplicationDraft)[];

// Builds form state from a saved Firestore doc, keeping only known fields.
// Older drafts may contain fields that were removed from the form (e.g.
// whyAttend, currentStep). Dropping them here means the next setDoc removes
// them from Firestore, instead of every save failing the security rules.
function draftFromDoc(data: Record<string, unknown>): ApplicationDraft {
  const draft: Record<string, unknown> = { ...emptyDraft };

  for (const field of draftFields) {
    if (field in data) {
      draft[field] = data[field];
    }
  }

  return draft as ApplicationDraft;
}

const PRONOUN_SUGGESTIONS = ["she/her", "he/him", "they/them"];

const inputClass = "w-full rounded border p-3";
const labelClass = "mb-2 block font-medium";

function TextField({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  maxLength,
  list,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "tel";
  placeholder?: string;
  maxLength?: number;
  list?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>

      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        list={list}
        className={inputClass}
      />
    </div>
  );
}

function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T | "";
  options: readonly T[];
  onChange: (value: T | "") => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>

      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T | "")}
        className={inputClass}
      >
        <option value="">Select…</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function ShortAnswerField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>

      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={SHORT_ANSWER_MAX_LENGTH}
        rows={5}
        className={inputClass}
      />

      <p className="mt-1 text-right text-sm opacity-60">
        {value.length}/{SHORT_ANSWER_MAX_LENGTH} characters
      </p>
    </div>
  );
}

function ConsentCheckbox({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1"
      />

      <label htmlFor={id}>{label}</label>
    </div>
  );
}

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
          setDraft(draftFromDoc(snapshot.data()));
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

  function updateField<K extends keyof ApplicationDraft>(
    field: K,
    value: ApplicationDraft[K]
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
        "Success! A test row was written to Google Sheets."
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
        <h2 className="text-xl font-semibold">Personal info</h2>

        <TextField
          id="firstName"
          label="First Name"
          value={draft.firstName}
          onChange={(value) => updateField("firstName", value)}
          placeholder="Enter your first name"
        />

        <TextField
          id="lastName"
          label="Last Name"
          value={draft.lastName}
          onChange={(value) => updateField("lastName", value)}
          placeholder="Enter your last name"
        />

        <SelectField
          id="ageRange"
          label="Age"
          value={draft.ageRange}
          options={AGE_RANGES}
          onChange={(value) => updateField("ageRange", value)}
        />

        <TextField
          id="pronouns"
          label="Pronouns"
          value={draft.pronouns}
          onChange={(value) => updateField("pronouns", value)}
          placeholder="e.g. they/them"
          list="pronoun-suggestions"
        />
        <datalist id="pronoun-suggestions">
          {PRONOUN_SUGGESTIONS.map((pronoun) => (
            <option key={pronoun} value={pronoun} />
          ))}
        </datalist>

        <TextField
          id="country"
          label="Country of Residence"
          value={draft.country}
          onChange={(value) => updateField("country", value)}
          placeholder="e.g. Canada"
        />

        <TextField
          id="phone"
          type="tel"
          label="Phone Number"
          value={draft.phone}
          onChange={(value) => updateField("phone", value)}
          placeholder="e.g. 604-555-0123"
        />
      </section>

      <section className="space-y-5">
        <h2 className="text-xl font-semibold">Profile</h2>

        <TextField
          id="school"
          label="School"
          value={draft.school}
          onChange={(value) => updateField("school", value)}
          placeholder="e.g. University of British Columbia"
        />

        <SelectField
          id="levelOfStudy"
          label="Level of Study"
          value={draft.levelOfStudy}
          options={LEVELS_OF_STUDY}
          onChange={(value) => updateField("levelOfStudy", value)}
        />

        <TextField
          id="major"
          label="Major"
          value={draft.major}
          onChange={(value) => updateField("major", value)}
          placeholder="e.g. Computer Science"
        />

        <SelectField
          id="yearLevel"
          label="Year Level"
          value={draft.yearLevel}
          options={YEAR_LEVELS}
          onChange={(value) => updateField("yearLevel", value)}
        />
      </section>

      <section className="space-y-5">
        <h2 className="text-xl font-semibold">Additional info</h2>

        <div>
          <label htmlFor="hackathonsAttended" className={labelClass}>
            How many hackathons have you attended?
          </label>

          <input
            id="hackathonsAttended"
            type="number"
            min={0}
            step={1}
            value={draft.hackathonsAttended ?? ""}
            onChange={(e) => {
              const count = e.target.valueAsNumber;
              updateField(
                "hackathonsAttended",
                Number.isFinite(count) ? count : null
              );
            }}
            className={inputClass}
          />
        </div>

        <TextField
          id="dietaryRestrictions"
          label="Dietary Restrictions"
          value={draft.dietaryRestrictions}
          onChange={(value) => updateField("dietaryRestrictions", value)}
          placeholder="e.g. None, vegetarian, nut allergy"
        />

        <SelectField
          id="referralSource"
          label="How did you hear about Hack the Coast? (optional)"
          value={draft.referralSource}
          options={REFERRAL_SOURCES}
          onChange={(value) => updateField("referralSource", value)}
        />
      </section>

      <section className="space-y-5">
        <h2 className="text-xl font-semibold">Short answers</h2>

        {/* TODO: Replace these labels with the exact wording from last
            year's application (or this year's, once the team confirms). */}
        <ShortAnswerField
          id="hopeToLearn"
          label="What do you hope to learn at Hack the Coast?"
          value={draft.hopeToLearn}
          onChange={(value) => updateField("hopeToLearn", value)}
        />

        <ShortAnswerField
          id="recentChallenge"
          label="Tell us about a recent challenge you faced and how you approached it."
          value={draft.recentChallenge}
          onChange={(value) => updateField("recentChallenge", value)}
        />

        <ShortAnswerField
          id="teamRole"
          label="What role do you usually take on in a team?"
          value={draft.teamRole}
          onChange={(value) => updateField("teamRole", value)}
        />

        <ShortAnswerField
          id="favouriteBodyOfWater"
          label="What's your favourite body of water, and why?"
          value={draft.favouriteBodyOfWater}
          onChange={(value) => updateField("favouriteBodyOfWater", value)}
        />

        <TextField
          id="playlistSong"
          label="What song would you add to the hackathon playlist? (optional)"
          value={draft.playlistSong}
          onChange={(value) => updateField("playlistSong", value)}
          maxLength={PLAYLIST_SONG_MAX_LENGTH}
          placeholder="Song – Artist"
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Consent</h2>

        {/* TODO: Replace these labels with the official consent wording and
            link each Code of Conduct, the MLH Contest Terms and the MLH
            Privacy Policy. */}
        <ConsentCheckbox
          id="consentUbcCoc"
          label="I agree to the UBC Code of Conduct (required)"
          checked={draft.consentUbcCoc}
          onChange={(checked) => updateField("consentUbcCoc", checked)}
        />

        <ConsentCheckbox
          id="consentMlhCoc"
          label="I agree to the MLH Code of Conduct (required)"
          checked={draft.consentMlhCoc}
          onChange={(checked) => updateField("consentMlhCoc", checked)}
        />

        <ConsentCheckbox
          id="consentMlhDataSharing"
          label="I authorize MLH to receive my application information, and I agree to the MLH Contest Terms and Privacy Policy (required)"
          checked={draft.consentMlhDataSharing}
          onChange={(checked) =>
            updateField("consentMlhDataSharing", checked)
          }
        />

        <ConsentCheckbox
          id="consentSusEmails"
          label="I'd like to receive emails from the Science Undergraduate Society"
          checked={draft.consentSusEmails}
          onChange={(checked) => updateField("consentSusEmails", checked)}
        />

        <ConsentCheckbox
          id="consentPhotos"
          label="I consent to being photographed and recorded at the event"
          checked={draft.consentPhotos}
          onChange={(checked) => updateField("consentPhotos", checked)}
        />

        <ConsentCheckbox
          id="consentMlhMarketing"
          label="I'd like to receive occasional emails from MLH about events and opportunities"
          checked={draft.consentMlhMarketing}
          onChange={(checked) => updateField("consentMlhMarketing", checked)}
        />
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
          This development-only button writes a test applicant
          row for your account to the Google Sheet.
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
