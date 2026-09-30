"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/supabase/client";

type AuthControlsProps = {
  isSignedIn: boolean;
};

export function AuthControls({ isSignedIn }: AuthControlsProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function signIn() {
    setIsLoading(true);
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
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

    router.refresh();
    setIsLoading(false);
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={isSignedIn ? signOut : signIn}
        disabled={isLoading}
        className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {isLoading
          ? "Working..."
          : isSignedIn
            ? "Sign Out"
            : "Sign In with Google"}
      </button>

      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </div>
  );
}
