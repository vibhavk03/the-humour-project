"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function DeletePostButton({ postId, onDeleted }: { postId: string; onDeleted?: () => void }) {
  const router = useRouter();
  const pending = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogId = useId();
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
      dialog.current?.close();
      setDeleted(true);
      if (onDeleted) onDeleted();
      else router.refresh();
    } catch {
      setError("Could not delete your post. Check your connection and try again.");
    } finally {
      pending.current = false;
      setDeleting(false);
    }
  }

  if (deleted) return <p role="status" className="text-sm text-muted">Post deleted.</p>;

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={() => { setError(""); dialog.current?.showModal(); }}
        aria-label="Delete post"
        title="Delete post"
        aria-haspopup="dialog"
        aria-controls={dialogId}
        className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-2 border-ink-soft text-ink transition-colors hover:border-ink hover:bg-pink-light"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5" />
        </svg>
      </button>
      <dialog
        ref={dialog}
        id={dialogId}
        aria-labelledby={`${dialogId}-title`}
        aria-describedby={`${dialogId}-description`}
        onClose={() => setError("")}
        onCancel={event => { if (pending.current) event.preventDefault(); }}
        onClick={event => {
          if (event.target !== event.currentTarget || pending.current) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.current?.close();
        }}
        className="comic-panel fixed inset-0 m-auto max-h-[calc(100svh_-_2rem)] w-[calc(100vw_-_2rem)] max-w-sm overflow-y-auto bg-paper p-6 text-ink backdrop:bg-ink/40"
      >
        <h2 id={`${dialogId}-title`} className="comic-heading text-2xl">Delete this post?</h2>
        <p id={`${dialogId}-description`} className="mt-3 text-sm leading-6 text-muted">This will permanently remove your post from the feed. This cannot be undone.</p>
        {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button autoFocus type="button" onClick={() => { if (!pending.current) dialog.current?.close(); }} disabled={deleting} className="comic-button comic-button-secondary px-4 py-2 text-sm">Cancel</button>
          <button type="button" onClick={deletePost} disabled={deleting} className="comic-button comic-button-danger px-4 py-2 text-sm">{deleting ? "Deleting…" : "Delete post"}</button>
        </div>
      </dialog>
    </div>
  );
}
