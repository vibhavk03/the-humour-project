"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function PendingVoteRetry({ postId, vote }: { postId: string; vote: 1 | -1 }) {
  const router = useRouter();
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function retry() {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/posts/${postId}/vote`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vote }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save your vote. Please try again.");
      setSaved(true);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save your vote. Please try again.");
    } finally { pending.current = false; setSaving(false); }
  }
  return <div className="comic-panel space-y-3 bg-green-light p-4">
    <p role="status" className="text-sm text-ink">{saved ? "Your vote has been saved." : `You’re signed in, but your ${vote === 1 ? "upvote" : "downvote"} couldn’t be saved.`}</p>
    {!saved ? <button type="button" disabled={saving} onClick={() => void retry()} className="comic-button comic-button-secondary">{saving ? "Saving…" : "Retry vote"}</button> : null}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
  </div>;
}
