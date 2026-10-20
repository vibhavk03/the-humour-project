"use client";

import { useRef, useState } from "react";

export function SharePostButton({ postId }: { postId: string }) {
  const [message, setMessage] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const pending = useRef(false);

  async function share() {
    if (pending.current) return;
    pending.current = true;
    setMessage("");
    setManualUrl("");
    const url = new URL(`/posts/${postId}`, window.location.origin).href;
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
        try {
          await navigator.share({ title: "The Humour Project", url });
          return;
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") return;
          // If native sharing is unavailable, offer the clipboard instead.
        }
      }
      await navigator.clipboard.writeText(url);
      setMessage("Link copied!");
    } catch {
      setManualUrl(url);
      setMessage("Copy this link to share:");
    } finally {
      pending.current = false;
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      <button type="button" onClick={() => void share()} aria-label="Share this meme"
        className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-ink/40 px-3 text-xs font-bold text-ink transition-colors hover:bg-pink-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [@media(pointer:coarse)]:min-h-11">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 16V3m-5 5 5-5 5 5M5 14v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" /></svg>
        Share
      </button>
      <p role="status" aria-live="polite" className="text-xs text-muted">{message}</p>
      {manualUrl ? <input aria-label="Meme share link" readOnly value={manualUrl} onFocus={event => event.currentTarget.select()} className="w-full min-w-0 rounded border border-ink/40 bg-paper p-2 text-xs" /> : null}
    </div>
  );
}
