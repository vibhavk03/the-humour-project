"use client";

import { useRef, useState } from "react";
import { AuthControls } from "@/app/auth/auth-controls";
import type { Vote } from "./vote-data";

export function VoteButtons({ postId, initialScore, initialVote, available, isSignedIn = true, onVoteChange, returnTo }: {
  postId: string; initialScore: number; initialVote: Vote; available: boolean; isSignedIn?: boolean; onVoteChange?: (vote: Vote) => void; returnTo?: string;
}) {
  const pending = useRef(false);
  const signInDialog = useRef<HTMLDialogElement>(null);
  const [vote, setVote] = useState(initialVote);
  const [score, setScore] = useState(initialScore);
  const [isSaving, setIsSaving] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [pendingDirection, setPendingDirection] = useState<1 | -1>(1);
  const [error, setError] = useState("");

  async function castVote(direction: -1 | 1) {
    if (!isSignedIn) {
      setPendingDirection(direction);
      signInDialog.current?.showModal();
      setShowSignIn(true);
      return;
    }
    if (pending.current || !available) return;
    pending.current = true;
    setIsSaving(true);
    setError("");
    // Selecting the opposite arrow switches directly; selecting again clears it.
    const nextVote = vote === direction ? 0 : direction;
    try {
      const response = await fetch(`/api/posts/${postId}/vote`, nextVote === 0
        ? { method: "DELETE" }
        : { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vote: nextVote }) });
      const result = await response.json() as { error?: string; vote: Vote; score: number };
      if (!response.ok) {
        setError(result.error ?? "Your vote could not be saved. Please try again.");
        return;
      }
      if (![1, 0, -1].includes(result.vote) || !Number.isSafeInteger(result.score)) throw new Error("Invalid vote response");
      setVote(result.vote);
      setScore(result.score);
      onVoteChange?.(result.vote);
    } catch {
      setError("Could not save your vote. Please try again.");
    } finally {
      pending.current = false;
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div role="group" aria-label="Post votes" aria-busy={isSaving} className="comic-post-action inline-flex items-center justify-between gap-0.5 rounded-full border border-ink/40 bg-white p-0.5 text-ink">
        {([1, -1] as const).map(direction => {
          const label = direction === 1 ? "Upvote" : "Downvote";
          const action = vote === direction ? `Remove your ${label.toLowerCase()}` : `${label} this post`;
          return <button key={direction} type="button" onClick={() => void castVote(direction)}
            disabled={isSaving || (isSignedIn && !available)}
            aria-pressed={vote === direction}
            aria-label={!isSignedIn ? `Sign in to ${label.toLowerCase()} this post` : action}
            aria-haspopup={!isSignedIn ? "dialog" : undefined}
            aria-expanded={!isSignedIn ? showSignIn : undefined}
            aria-controls={!isSignedIn ? `vote-sign-in-${postId}` : undefined}
            title={!available && isSignedIn ? "Voting is temporarily unavailable" : isSignedIn ? action : label}
            className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10 ${isSaving || !available ? "disabled:cursor-not-allowed disabled:opacity-50" : "disabled:cursor-default disabled:opacity-100"} ${direction === -1 ? "hover:bg-ink hover:text-pink-light" : "hover:bg-pink-light"} ${vote === direction ? (direction === -1 ? "bg-ink text-pink-light" : "bg-pink text-ink") : ""} ${direction === -1 ? "order-3" : "order-1"}`}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-4 w-4 ${direction === -1 ? "rotate-180" : ""}`} fill={vote === direction ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 3 12h5v9h8v-9h5L12 3Z" />
            </svg>
          </button>;
        })}
        <span aria-label={available ? `${score} net votes` : "Vote score unavailable"} aria-live="polite" aria-atomic="true" className="order-2 min-w-5 px-0.5 text-center text-xs font-semibold tabular-nums">{available ? score : "—"}</span>
      </div>
      {isSignedIn && !available ? <p className="text-xs text-muted">Voting is temporarily unavailable.</p> : null}
      {!isSignedIn ? (
        <dialog
          ref={signInDialog}
          id={`vote-sign-in-${postId}`}
          aria-labelledby={`vote-sign-in-title-${postId}`}
          aria-describedby={`vote-sign-in-description-${postId}`}
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
            <h2 id={`vote-sign-in-title-${postId}`} className="comic-heading pr-5 text-2xl">Sign in to vote on this post.</h2>
            <p id={`vote-sign-in-description-${postId}`} className="text-sm leading-6 text-muted">Your {pendingDirection === 1 ? "upvote" : "downvote"} will be saved after you sign in.</p>
            <AuthControls isSignedIn={false} signInLabel="Continue with Google" returnToPostId={postId} returnTo={returnTo} pendingVote={{ postId, vote: pendingDirection }} />
            <button type="button" onClick={() => signInDialog.current?.close()} className="cursor-pointer rounded-sm px-2 py-1 text-xs font-bold underline underline-offset-4 transition-colors hover:bg-pink-light hover:decoration-2 focus-visible:bg-pink-light active:bg-pink">Dismiss</button>
          </div>
        </dialog>
      ) : null}
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
