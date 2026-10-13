"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function DeletePostButton({ postId }: { postId: string }) {
  const router = useRouter();
  const pending = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState("");

  async function deletePost() {
    if (pending.current) return;
    pending.current = true;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Your post could not be deleted. Please try again.");
        return;
      }
      setDeleted(true);
      router.refresh();
    } catch {
      setError("Could not delete your post. Check your connection and try again.");
    } finally {
      pending.current = false;
      setDeleting(false);
    }
  }

  if (deleted) return <p role="status" className="text-sm text-muted">Post deleted.</p>;

  return (
    <div className="min-w-0 max-w-xs space-y-2">
      {confirming ? (
        <div className="space-y-3 rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-800">Delete this post? This cannot be undone.</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={deletePost} disabled={deleting} className="comic-button comic-button-danger">{deleting ? "Deleting..." : "Delete permanently"}</button>
            <button type="button" onClick={() => { setConfirming(false); setError(""); }} disabled={deleting} className="comic-button comic-button-secondary">Cancel</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label="Delete post"
          title="Delete post"
          className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-ink-soft text-ink transition-colors hover:border-ink hover:bg-pink-light"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5" />
          </svg>
        </button>
      )}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
