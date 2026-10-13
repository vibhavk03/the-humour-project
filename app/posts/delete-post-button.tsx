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

  if (deleted) return <p role="status" className="text-sm text-zinc-500">Post deleted.</p>;

  return (
    <div className="space-y-2">
      {confirming ? (
        <div className="space-y-3 rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-800">Delete this post? This cannot be undone.</p>
          <div className="flex gap-3">
            <button type="button" onClick={deletePost} disabled={deleting} className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50">{deleting ? "Deleting..." : "Delete permanently"}</button>
            <button type="button" onClick={() => { setConfirming(false); setError(""); }} disabled={deleting} className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50">Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-red-700 hover:border-red-200 hover:bg-red-50">Delete post</button>
      )}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
