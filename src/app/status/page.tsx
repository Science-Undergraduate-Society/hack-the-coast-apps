"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from "@/lib/applicationSchema";

// What the applicant sees for each status. Statuses are set by the server
// (submit, Release decisions in the Sheet, RSVP), never by the applicant.
const statusDetails: Record<
  ApplicationStatus,
  { label: string; message: string; className: string }
> = {
  draft: {
    label: "Not submitted",
    message:
      "You've started an application but haven't submitted it yet.",
    className: "border-gray-400",
  },
  submitted: {
    label: "Submitted",
    message:
      "Thanks for applying! Your application is under review. We'll email you when a decision is made.",
    className: "border-blue-500",
  },
  accepted: {
    label: "Accepted",
    message:
      "Congratulations, you're in! Look out for an email with instructions to confirm your spot.",
    className: "border-green-500",
  },
  waitlisted: {
    label: "Waitlisted",
    message:
      "You're on the waitlist. We'll email you if a spot opens up.",
    className: "border-yellow-500",
  },
  rejected: {
    label: "Not accepted",
    message:
      "Unfortunately, we couldn't offer you a spot this time. Thank you for applying, and we hope to see you at a future event.",
    className: "border-red-500",
  },
  confirmed: {
    label: "Confirmed",
    message: "You've confirmed your spot. See you at Hack the Coast!",
    className: "border-green-500",
  },
  declined: {
    label: "Declined",
    message:
      "You've let us know you can't attend. Thanks for telling us, and we hope to see you next time.",
    className: "border-gray-400",
  },
};

function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return APPLICATION_STATUSES.includes(value as ApplicationStatus);
}

export default function StatusPage() {
  const [user, setUser] = useState<User | null>(null);
  // null means the applicant has no application yet.
  const [status, setStatus] = useState<ApplicationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Load the signed-in applicant's own application. Firestore rules only
  // allow reading applications/{their uid}.
  useEffect(() => {
    let active = true;
    let requestId = 0;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const id = ++requestId;

      setLoading(true);
      setUser(currentUser);
      setStatus(null);
      setLoadError("");

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
          const value = snapshot.get("status");

          if (!isApplicationStatus(value)) {
            throw new Error(`Unknown application status: ${value}`);
          }

          setStatus(value);
        }
      } catch (error) {
        console.error("Failed to load application status:", error);

        if (active && id === requestId) {
          setLoadError(
            "Could not load your application status. Please refresh to try again."
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

  if (loading) {
    return <main className="p-8">Loading your application status...</main>;
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="mb-4 text-3xl font-bold">Application Status</h1>

        <p>Please sign in to see your application status.</p>

        <Link href="/login" className="mt-4 inline-block underline">
          Go to Login
        </Link>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-bold">Unable to load status</h1>

        <p role="alert" className="mt-4 text-red-600">
          {loadError}
        </p>
      </main>
    );
  }

  const details = status ? statusDetails[status] : null;

  return (
    <main className="mx-auto max-w-xl space-y-6 p-8">
      <header>
        <h1 className="text-3xl font-bold">Application Status</h1>

        <p className="mt-2 text-sm opacity-70">Signed in as {user.email}</p>
      </header>

      {details ? (
        <section className={`rounded border-l-4 p-5 ${details.className}`}>
          <p className="text-sm uppercase tracking-wide opacity-70">
            Status
          </p>

          <p className="mt-1 text-2xl font-semibold">{details.label}</p>

          <p className="mt-3">{details.message}</p>
        </section>
      ) : (
        <section className="rounded border-l-4 border-gray-400 p-5">
          <p className="text-2xl font-semibold">No application yet</p>

          <p className="mt-3">You haven&apos;t started an application.</p>
        </section>
      )}

      {(status === null || status === "draft") && (
        <Link
          href="/application"
          className="block rounded bg-blue-600 p-3 text-center text-white"
        >
          {status === "draft" ? "Continue Application" : "Start Application"}
        </Link>
      )}
    </main>
  );
}
