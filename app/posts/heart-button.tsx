"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function HeartButton({ postId, initialCount, initialHearted, available }: {
  postId: string; initialCount: number; initialHearted: boolean; available: boolean;
}) {
  const router = useRouter();
  const pending = useRef(false);
  const [hearted, setHearted] = useState(initialHearted);
  const [count, setCount] = useState(initialCount);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function toggleHeart() {
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
        disabled={isSaving || !available}
        aria-pressed={hearted}
        aria-label={available ? `${hearted ? "Remove heart from" : "Heart"} this post, ${count} ${count === 1 ? "heart" : "hearts"}` : "Hearts unavailable"}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${hearted ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100" : "border-zinc-200 text-zinc-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"}`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill={hearted ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
        </svg>
        <span>{available ? count : "Unavailable"}</span>
      </button>
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
