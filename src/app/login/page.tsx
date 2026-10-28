
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function LoginPage() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setCheckingAuth(false);
    });
  }, []);

  async function handleEmailAuth(createAccount: boolean) {
    setLoading(true);
    setError("");

    try {
      if (createAccount) {
        await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );
      } else {
        await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Authentication failed."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setLoading(true);
    setError("");

    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Google sign-in failed."
      );
    } finally {
      setLoading(false);
    }
  }

  if (checkingAuth) {
    return <main className="p-8">Checking sign-in...</main>;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-3xl font-bold">Hack the Coast</h1>
      <p className="text-sm opacity-70">Applicant Portal</p>

      {user ? (
        <>
          <p>Signed in as {user.email}</p>

          <Link
            href="/application"
            className="rounded bg-blue-600 p-3 text-center text-white"
          >
            Continue Application
          </Link>

          <button
            onClick={() => signOut(auth)}
            className="rounded border p-3"
          >
            Sign Out
          </button>
        </>
      ) : (
        <>
          <input
            type="email"
            placeholder="Email"
            aria-label="Email"
            className="rounded border p-3"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            aria-label="Password"
            className="rounded border p-3"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            disabled={loading}
            onClick={() => handleEmailAuth(false)}
            className="rounded bg-blue-600 p-3 text-white disabled:opacity-50"
          >
            Sign In
          </button>

          <button
            disabled={loading}
            onClick={() => handleEmailAuth(true)}
            className="rounded border p-3 disabled:opacity-50"
          >
            Create Account
          </button>

          <button
            disabled={loading}
            onClick={handleGoogleLogin}
            className="rounded border p-3 disabled:opacity-50"
          >
            Continue with Google
          </button>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
    </main>
  );
}