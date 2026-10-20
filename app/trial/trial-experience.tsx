"use client";

import { CAPTIONS_PER_REQUEST, MAX_CAPTIONS_PER_PICTURE, PICTURE_CAPTION_LIMIT_MESSAGE } from "@/app/posts/caption-limits";
import { SAMPLE_TRY_LIMITS_ENABLED } from "./settings";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AuthControls } from "@/app/auth/auth-controls";
import { SAMPLES, getSample } from "./samples";
import { saveTrialDraft, useTrialDraft } from "./use-trial-draft";
import type { Choice } from "./draft";

const PAGE_SIZE = 8;

export function TrialExperience({ isSignedIn, shareExpired = false }: { isSignedIn: boolean; shareExpired?: boolean }) {
  const router = useRouter();
  const draft = useTrialDraft();
  const sample = getSample(draft.sampleId) ?? SAMPLES[0];
  const result = draft.results[sample.id] ?? { choices: [], selected: "" };
  const captionAllowance = Math.max(0, Math.min(result.remainingCaptions ?? MAX_CAPTIONS_PER_PICTURE, MAX_CAPTIONS_PER_PICTURE - result.choices.length));
  const generationLimitReached = captionAllowance < CAPTIONS_PER_REQUEST;
  const [filter, setFilter] = useState<"all" | "images" | "gifs">("all");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<"generate" | "preview" | null>(null);
  const [error, setError] = useState(shareExpired ? "Your saved preview expired. Choose a caption to open a fresh preview." : "");
  const pending = useRef(false);
  const review = useRef<HTMLElement>(null);
  const filtered = SAMPLES.filter(item => filter === "all" || (item.mimeType === "image/gif") === (filter === "gifs"));
  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function selectSample(id: string) {
    if (id === sample.id || pending.current) return;
    saveTrialDraft({ ...draft, sampleId: id, results: { ...draft.results, [id]: { choices: [], selected: "" } } });
    setError("");
    if (window.matchMedia("(max-width: 1023px)").matches) {
      review.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    }
  }

  async function generate() {
    if (pending.current) return;
    if (generationLimitReached) { setError(PICTURE_CAPTION_LIMIT_MESSAGE); return; }
    pending.current = true;
    setBusy("generate");
    setError("");
    try {
      const response = await fetch("/api/trial", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", sampleId: sample.id, generationToken: result.generationToken, previousCaptions: result.choices.slice(-60).map(choice => choice.caption) }),
      });
      const data = await response.json() as { error?: string; captions?: string[]; reviewToken?: string; remaining?: number; remainingCaptions?: number; generationToken?: string };
      if (!response.ok || !data.captions || !data.reviewToken) {
        if (typeof data.remainingCaptions === "number") saveTrialDraft({ ...draft, results: { ...draft.results, [sample.id]: { ...result, remainingCaptions: data.remainingCaptions } } });
        setError(data.error ?? "Could not generate captions. Please try again.");
        return;
      }
      const token = data.reviewToken;
      const additions: Choice[] = data.captions.map(caption => ({ caption, reviewToken: token }));
      saveTrialDraft({
        ...draft, remaining: data.remaining ?? null,
        results: { ...draft.results, [sample.id]: { ...result, generationToken: data.generationToken, remainingCaptions: data.remainingCaptions ?? Math.max(0, captionAllowance - additions.length), choices: [...result.choices, ...additions] } },
      });
    } catch {
      setError("Could not reach the caption service. Check your connection and try again.");
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  async function openPreview() {
    const choice = result.choices.find(item => item.caption === result.selected);
    if (!choice || pending.current) return;
    pending.current = true;
    setBusy("preview");
    setError("");
    try {
      const response = await fetch("/api/trial", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepare-share", sampleId: sample.id, caption: choice.caption, reviewToken: choice.reviewToken }),
      });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        setError(data.error ?? "Could not open your preview. Please try again.");
        return;
      }
      router.push("/try/preview");
    } catch {
      setError("Could not open your preview. Check your connection and try again.");
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  return (
    <div className="grid items-start gap-7 lg:grid-cols-[1.1fr_1fr]">
      <section aria-labelledby="sample-gallery-title" className="comic-panel space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="sample-gallery-title" className="comic-heading text-2xl">01 · Choose your moment</h2>
          <span className="comic-stamp">{SAMPLES.length} moods to work with</span>
        </div>
        <div role="group" aria-label="Filter samples" className="flex flex-wrap gap-2">
          {([['all', 'All'], ['images', 'Images'], ['gifs', 'GIFs']] as const).map(([value, label]) => (
            <button key={value} type="button" disabled={Boolean(busy)} aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(1); }} className="comic-reaction cursor-pointer rounded-full px-4 py-2 text-sm font-bold disabled:opacity-50">{label}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {visible.map(item => (
            <button key={item.id} type="button" disabled={Boolean(busy)} aria-pressed={sample.id === item.id} onClick={() => selectSample(item.id)} className={`group cursor-pointer overflow-hidden rounded-sm border-2 border-ink text-left transition-colors hover:bg-pink-light focus-visible:bg-pink-light disabled:cursor-wait ${sample.id === item.id ? 'bg-pink-light shadow-[3px_3px_0_#660033]' : 'bg-card'}`}>
              <div className="relative border-b-2 border-ink bg-paper">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/samples/${item.id}?preview=1`} alt={item.description} loading="lazy" className="h-28 w-full object-contain sm:h-32" />
                {item.mimeType === "image/gif" ? <span className="comic-stamp absolute right-1 top-1">GIF</span> : null}
              </div>
              <span className="flex min-h-12 items-center justify-between gap-2 p-2 text-xs font-bold sm:p-3 sm:text-sm"><span>{item.label}</span>{sample.id === item.id ? <span aria-label="Selected">✓</span> : null}</span>
            </button>
          ))}
        </div>
        <nav aria-label="Sample gallery pages" className="flex items-center justify-between gap-2 text-xs">
          <button type="button" disabled={page === 1 || Boolean(busy)} onClick={() => setPage(current => current - 1)} className="comic-button comic-button-secondary">Previous</button>
          <span aria-live="polite">{page} / {pageCount}</span>
          <button type="button" disabled={page === pageCount || Boolean(busy)} onClick={() => setPage(current => current + 1)} className="comic-button comic-button-secondary">Next</button>
        </nav>
      </section>

      <section ref={review} aria-labelledby="trial-review-title" className="comic-panel scroll-mt-6 space-y-5 p-5 sm:p-6 lg:sticky lg:top-6">
        <h2 id="trial-review-title" className="comic-heading text-2xl">02 · Find the punchline</h2>
        <div className="overflow-hidden rounded-sm border-2 border-ink bg-pink-light">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={sample.id} src={`/api/samples/${sample.id}`} alt={sample.description} className="max-h-64 w-full object-contain sm:max-h-72" />
        </div>
        {/* {sample.animated ? <p className="text-xs text-muted">Your GIF stays animated when shared.</p> : null} */}
        {error ? <p role="alert" className="rounded-sm border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">{error}</p> : null}
        {result.choices.length ? (
          <fieldset disabled={Boolean(busy)} className="space-y-3">
            <legend className="mb-2 text-sm font-bold">Pick the one that lands.</legend>
            {result.choices.map((choice, index) => (
              <label key={choice.caption} className="comic-choice">
                <input type="radio" name="sample-caption" checked={result.selected === choice.caption} onChange={() => saveTrialDraft({ ...draft, results: { ...draft.results, [sample.id]: { ...result, selected: choice.caption } } })} className="mt-1" />
                <span className="min-w-0 space-y-2"><span className="comic-stamp">Take {String(index + 1).padStart(2, "0")}</span><span className="block text-sm leading-6">{choice.caption}</span></span>
              </label>
            ))}
          </fieldset>
        ) : null}
        <div className="space-y-3">
          <p className="text-xs leading-5 text-muted">{generationLimitReached ? PICTURE_CAPTION_LIMIT_MESSAGE : `${captionAllowance} of 30 captions remaining for this selection.`}</p>
          <button type="button" disabled={Boolean(busy) || generationLimitReached} onClick={generate} className={`comic-button ${result.choices.length ? "comic-button-secondary" : ""}`}>{busy === "generate" ? "Finding the punchlines…" : result.choices.length ? "Request more captions" : "Generate captions"}</button>
          <p role="status" className="text-xs leading-5 text-muted">{busy === "generate" ? "Finding three different angles. This can take a moment." : SAMPLE_TRY_LIMITS_ENABLED && draft.remaining !== null ? `${draft.remaining} sample ${draft.remaining === 1 ? "try" : "tries"} remaining today.` : "Choose a sample and find your favorite punchline."}</p>
        </div>
        {result.selected ? (
          <div className="space-y-3 border-t-2 border-ink-soft pt-5">
            <h3 className="comic-heading text-xl">03 · Share the laugh</h3>
            <blockquote className="comic-caption">{result.selected}</blockquote>
            {isSignedIn ? (
              <button type="button" disabled={Boolean(busy)} onClick={openPreview} className="comic-button comic-button-post">{busy === "preview" ? "Opening preview…" : "Preview meme"}</button>
            ) : (
              <AuthControls isSignedIn={false} signInLabel="Sign in to post" returnTo="/try" beforeSignIn={async () => {
                if (!saveTrialDraft(draft)) {
                  setError("Your browser can’t keep this selection through sign-in. Allow site storage, then try again.");
                  return false;
                }
                const choice = result.choices.find(item => item.caption === result.selected);
                if (!choice) return false;
                const response = await fetch("/api/trial", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "prepare-share", sampleId: sample.id, caption: choice.caption, reviewToken: choice.reviewToken }),
                });
                if (!response.ok) {
                  const data = await response.json() as { error?: string };
                  setError(data.error ?? "Could not save your selection for sign-in. Please try again.");
                  return false;
                }
                return true;
              }} />
            )}
            {!isSignedIn ? <p className="text-xs leading-5 text-muted">We’ll keep your meme and selected caption ready, sign in to share it!</p> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
