"use client";

import { clearTrialDraft } from "@/app/trial/use-trial-draft";
import { getFeedReturnPath } from "@/app/auth/return-path";
import { useState } from "react";
import { createClient } from "@/app/supabase/client";

type AuthControlsProps = {
  isSignedIn: boolean;
  signInLabel?: string;
  returnToPostId?: string;
  returnTo?: string;
  beforeSignIn?: () => boolean | Promise<boolean>;
};

export function AuthControls({ isSignedIn, signInLabel = "Sign In with Google", returnToPostId, returnTo, beforeSignIn }: AuthControlsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function signIn() {
    setIsLoading(true);
    setMessage("");
    try {
      if (beforeSignIn && !await beforeSignIn()) {
        setIsLoading(false);
        return;
      }
    } catch {
      setMessage("Could not prepare sign-in. Please try again.");
      setIsLoading(false);
      return;
    }

    const callbackUrl = new URL("/auth/callback", window.location.origin);
    if (returnTo) {
      callbackUrl.searchParams.set("next", getFeedReturnPath(returnTo));
    } else if (returnToPostId) {
      callbackUrl.searchParams.set("next", `${window.location.pathname}${window.location.search}#post-${returnToPostId}`);
    }
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl.toString(),
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error) {
      setMessage(error.message);
      setIsLoading(false);
    }
  }

  async function signOut() {
    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/signout", { method: "POST" });
      if (!response.ok) {
        setMessage("Could not sign out. Please try again.");
        setIsLoading(false);
        return;
      }
      clearTrialDraft();
      // A full navigation also resets mounted UI state and the browser auth client.
      window.location.replace("/");
    } catch {
      setMessage("Could not sign out. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={isSignedIn ? signOut : signIn}
        disabled={isLoading}
        className="comic-button"
      >
        {isLoading
          ? "Working..."
          : isSignedIn
            ? "Sign Out"
            : signInLabel}
      </button>

      {message ? <p role="alert" className="text-sm text-red-600">{message}</p> : null}
    </div>
  );
}
