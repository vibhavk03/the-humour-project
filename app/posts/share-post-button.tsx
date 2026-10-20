"use client";

import { useEffect, useRef, useState } from "react";

export function SharePostButton({ postId }: { postId: string }) {
  const [message, setMessage] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const pending = useRef(false);

  useEffect(() => {
    if (!message || manualUrl) return;
    const timeout = setTimeout(() => setMessage(""), 2500);
    return () => clearTimeout(timeout);
  }, [message, manualUrl]);

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
    <div className="relative shrink-0">
      <button type="button" onClick={() => void share()} aria-label="Share this meme"
        className="group relative inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-ink/40 text-ink transition-colors hover:bg-pink-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [@media(pointer:coarse)]:h-12 [@media(pointer:coarse)]:w-12">
        {!message ? <span aria-hidden="true" className="pointer-events-none absolute bottom-full right-0 z-10 mb-2 rounded bg-ink px-2 py-1 text-xs font-bold text-pink-light opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">Share</span> : null}
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 16V3m-5 5 5-5 5 5M5 14v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" /></svg>
      </button>
      <p role="status" aria-live="polite" className={message ? "pointer-events-none absolute bottom-full right-0 z-10 mb-2 whitespace-nowrap rounded bg-ink px-2 py-1 text-xs font-bold text-pink-light" : "sr-only"}>{message}</p>
      {manualUrl ? <input aria-label="Meme share link" readOnly value={manualUrl} onFocus={event => event.currentTarget.select()} className="absolute right-0 top-full z-10 mt-2 w-64 max-w-[calc(100vw-4rem)] rounded border border-ink/40 bg-paper p-2 text-xs shadow-sm" /> : null}
    </div>
  );
}
