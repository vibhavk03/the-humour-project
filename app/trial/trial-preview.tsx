"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSample } from "./samples";

export function TrialPreview({ sampleId, caption, reviewToken }: { sampleId: string; caption: string; reviewToken: string }) {
  const sample = getSample(sampleId);
  const router = useRouter();
  const pending = useRef(false);
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState("");

  async function confirmPost() {
    if (pending.current) return;
    pending.current = true;
    setIsPosting(true);
    setError("");
    try {
      const response = await fetch("/api/trial", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", sampleId, caption, reviewToken }),
      });
      const data = await response.json() as { error?: string; postId?: string };
      if (!response.ok || !data.postId) {
        setError(data.error ?? "Could not post your meme. Please try again.");
        return;
      }
      router.replace(`/#post-${data.postId}`);
      router.refresh();
    } catch {
      setError("Could not post your meme. Check your connection and try again.");
    } finally {
      pending.current = false;
      setIsPosting(false);
    }
  }

  return (
    <section aria-label="Your meme preview" className="comic-panel overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/samples/${sampleId}`} alt={sample?.description ?? "Selected meme template"} className="max-h-96 w-full bg-pink-light object-contain" />
      <div className="space-y-5 border-t-2 border-ink p-5 sm:p-7">
        <blockquote className="comic-caption">{caption}</blockquote>
        <p className="text-sm leading-6 text-muted">Post this meme to the community feed? Your image, caption, and name will be visible to everyone.</p>
        {error ? <p role="alert" className="rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" disabled={isPosting} onClick={confirmPost} className="comic-button comic-button-post">{isPosting ? "Posting…" : "Post to feed"}</button>
          <Link href="/try" className="comic-button comic-button-secondary">Back to editing</Link>
        </div>
      </div>
    </section>
  );
}
