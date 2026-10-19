"use client";

import { useState } from "react";
import { createClient } from "@/app/supabase/client";

type AuthControlsProps = {
  isSignedIn: boolean;
  signInLabel?: string;
  returnToPostId?: string;
};

export function AuthControls({ isSignedIn, signInLabel = "Sign In with Google", returnToPostId }: AuthControlsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function signIn() {
    setIsLoading(true);
    setMessage("");

    const callbackUrl = new URL("/auth/callback", window.location.origin);
    if (returnToPostId) {
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

    const supabase = createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      setMessage(error.message);
      setIsLoading(false);
      return;
    }

    // Reload the landing page with the cleared session, including its header.
    window.location.replace("/");
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
