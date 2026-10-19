"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthControls } from "@/app/auth/auth-controls";

export function HeartButton({ postId, initialCount, initialHearted, available, isSignedIn = true }: {
  postId: string; initialCount: number; initialHearted: boolean; available: boolean; isSignedIn?: boolean;
}) {
  const router = useRouter();
  const pending = useRef(false);
  const signInDialog = useRef<HTMLDialogElement>(null);
  const [hearted, setHearted] = useState(initialHearted);
  const [count, setCount] = useState(initialCount);
  const [isSaving, setIsSaving] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [error, setError] = useState("");

  async function toggleHeart() {
    if (!isSignedIn) {
      signInDialog.current?.showModal();
      setShowSignIn(true);
      return;
    }
    if (pending.current || !available) return;
    pending.current = true;
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/posts/${postId}/heart`, { method: hearted ? "DELETE" : "PUT" });
      const result = await response.json() as { error?: string; hearted: boolean; count: number };
      if (!response.ok) {
        setError(result.error ?? "Your heart could not be saved.");
        return;
      }
      setHearted(result.hearted);
      setCount(result.count);
      router.refresh();
    } catch {
      setError("Could not save your heart. Please try again.");
    } finally {
      pending.current = false;
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={toggleHeart}
        disabled={isSaving || (isSignedIn && !available)}
        aria-haspopup={!isSignedIn ? "dialog" : undefined}
        aria-expanded={!isSignedIn ? showSignIn : undefined}
        aria-controls={!isSignedIn ? `heart-sign-in-${postId}` : undefined}
        aria-pressed={hearted}
        aria-label={!isSignedIn ? `Sign in to like this post${available ? `, ${count} ${count === 1 ? "heart" : "hearts"}` : ""}` : available ? `${hearted ? "Remove heart from" : "Heart"} this post, ${count} ${count === 1 ? "heart" : "hearts"}` : "Hearts unavailable"}
        className="comic-reaction inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill={hearted ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
        </svg>
        <span>{available ? count : isSignedIn ? "Unavailable" : "Like"}</span>
      </button>
      {!isSignedIn ? (
        <dialog
          ref={signInDialog}
          id={`heart-sign-in-${postId}`}
          aria-labelledby={`heart-sign-in-title-${postId}`}
          aria-describedby={`heart-sign-in-description-${postId}`}
          onClose={() => setShowSignIn(false)}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
              event.currentTarget.close();
            }
          }}
          className="comic-panel fixed inset-0 m-auto max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto bg-green-light p-6 text-ink backdrop:bg-ink/40 sm:p-8"
        >
          <button
            type="button"
            aria-label="Close sign-in popup"
            onClick={() => signInDialog.current?.close()}
            className="absolute right-3 top-3 flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm text-2xl transition-colors hover:bg-pink-light focus-visible:bg-pink-light active:bg-pink"
          ><span aria-hidden="true">×</span></button>
          <div className="space-y-5">
            <h2 id={`heart-sign-in-title-${postId}`} className="comic-heading pr-5 text-2xl">Sign in to like this post.</h2>
            <p id={`heart-sign-in-description-${postId}`} className="text-sm leading-6 text-muted">Give your favorite punchlines a little love.</p>
            <AuthControls isSignedIn={false} signInLabel="Continue with Google" returnToPostId={postId} />
            <button type="button" onClick={() => signInDialog.current?.close()} className="cursor-pointer rounded-sm px-2 py-1 text-xs font-bold underline underline-offset-4 transition-colors hover:bg-pink-light hover:decoration-2 focus-visible:bg-pink-light active:bg-pink">Dismiss</button>
          </div>
        </dialog>
      ) : null}
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
