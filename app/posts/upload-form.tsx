"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CAPTIONS_PER_REQUEST, MAX_CAPTIONS_PER_PICTURE, PICTURE_CAPTION_LIMIT_MESSAGE } from "./caption-limits";
import { SamplePicker } from "./sample-picker";
import { getSample } from "@/app/trial/samples";
import { ACCEPTED_IMAGE_TYPES, MAX_CONTEXT_LENGTH, validateImage } from "./upload-validation";

export function UploadForm() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const sampleRequest = useRef(0);
  const [source, setSource] = useState<"template" | "upload">("template");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(true);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [context, setContext] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [choices, setChoices] = useState<{ caption: string; reviewToken: string }[]>([]);
  const [selected, setSelected] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const busy = isUploading || isPublishing || isLoadingTemplate;
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [savedCaption, setSavedCaption] = useState<string | null>(null);
  const [savedPreview, setSavedPreview] = useState<string | null>(null);

  const [generationToken, setGenerationToken] = useState<string | null>(null);
  const [remainingCaptions, setRemainingCaptions] = useState<number | null>(null);
  const captionAllowance = Math.max(0, Math.min(remainingCaptions ?? MAX_CAPTIONS_PER_PICTURE, MAX_CAPTIONS_PER_PICTURE - choices.length));
  const generationLimitReached = captionAllowance < CAPTIONS_PER_REQUEST;

  useEffect(() => {
    if (preview) return () => URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    if (savedPreview) return () => URL.revokeObjectURL(savedPreview);
  }, [savedPreview]);

  useEffect(() => () => { sampleRequest.current += 1; }, []);

  function changeSource(nextSource: "template" | "upload") {
    if (busy || nextSource === source) return;
    sampleRequest.current += 1;
    setSource(nextSource);
    setTemplateId(null);
    setShowTemplates(true);
    setRemainingCaptions(null);
    setGenerationToken(null);
    setImage(null);
    setPreview(null);
    setChoices([]);
    setSelected("");
    setError("");
    setSuccess("");
  }

  async function chooseTemplate(id: string) {
    const sample = getSample(id);
    if (!sample || busy) return;
    const requestId = ++sampleRequest.current;
    setIsLoadingTemplate(true);
    setTemplateId(id);
    setRemainingCaptions(null);
    setGenerationToken(null);
    setImage(null);
    setPreview(null);
    setChoices([]);
    setSelected("");
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/samples/${sample.id}`);
      if (!response.ok) throw new Error("Template unavailable");
      const file = new File([await response.blob()], sample.filename, { type: sample.mimeType });
      if (requestId !== sampleRequest.current) return;
      const validationError = validateImage(file);
      if (validationError) throw new Error(validationError);
      setImage(file);
      setPreview(URL.createObjectURL(file));
      setShowTemplates(false);
    } catch {
      if (requestId !== sampleRequest.current) return;
      setTemplateId(null);
      setError("This template could not be loaded. Please try again or upload your own image.");
    } finally {
      if (requestId === sampleRequest.current) setIsLoadingTemplate(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (generationLimitReached) { setError(PICTURE_CAPTION_LIMIT_MESSAGE); return; }
    setError("");
    setSuccess("");
    if (!image) {
      setError("Choose an image to upload.");
      return;
    }
    const imageError = validateImage(image);
    if (imageError) {
      setError(imageError);
      return;
    }
    if (context.trim().length > MAX_CONTEXT_LENGTH) {
      setError(`Context must be ${MAX_CONTEXT_LENGTH} characters or fewer.`);
      return;
    }

    setIsUploading(true);
    try {
      const body = new FormData();
      body.set("image", image);
      body.set("context", context);
      if (generationToken) body.set("generationToken", generationToken);
      body.set("previousCaptions", JSON.stringify(choices.slice(-60).map(choice => choice.caption)));
      const response = await fetch("/api/posts", { method: "POST", body });
      const result = await response.json() as { error?: string; captions?: string[]; reviewToken?: string; remainingCaptions?: number; generationToken?: string };
      if (typeof result.remainingCaptions === "number") setRemainingCaptions(result.remainingCaptions);
      if (!response.ok || !result.captions || !result.reviewToken) {
        setError(result.error ?? "Could not generate captions. Please try again.");
        return;
      }
      if (result.generationToken) setGenerationToken(result.generationToken);
      const token = result.reviewToken;
      const newChoices = result.captions.map(caption => ({ caption, reviewToken: token }));
      setChoices(current => [...current, ...newChoices.filter(choice => !current.some(previous => previous.caption.toLowerCase() === choice.caption.toLowerCase()))]);
    } catch {
      setError("Could not finish generating your caption. Check your connection and try again.");
    } finally {
      setIsUploading(false);
    }
  }

  async function publish() {
    const choice = choices.find(choice => choice.caption === selected);
    if (busy || !image || !choice) return;
    setError("");
    setIsPublishing(true);
    try {
      const body = new FormData();
      body.set("action", "publish");
      body.set("image", image);
      body.set("context", context);
      body.set("caption", choice.caption);
      body.set("reviewToken", choice.reviewToken);
      const response = await fetch("/api/posts", { method: "POST", body });
      const result = await response.json() as { error?: string; message?: string; post?: { id: string } };
      if (!response.ok) {
        setError(result.error ?? "Could not post. Please try again.");
        return;
      }
      setSuccess(result.message ?? "Posted to the feed.");
      setSavedCaption(choice.caption);
      setSavedPreview(URL.createObjectURL(image));
      setRemainingCaptions(null);
      setGenerationToken(null);
      setImage(null);
      setPreview(null);
      setTemplateId(null);
      setShowTemplates(true);
      setContext("");
      setChoices([]);
      setSelected("");
      if (fileInput.current) fileInput.current.value = "";
      router.replace(result.post?.id ? `/#post-${result.post.id}` : "/#community-feed");
      router.refresh();
    } catch {
      setError("Could not post. Check your connection and try again.");
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="comic-panel space-y-5 p-5 sm:p-7">
      <div role="group" aria-label="Choose an image source" className="flex flex-wrap gap-3">
        <button type="button" disabled={busy} aria-pressed={source === "template"} onClick={() => changeSource("template")} className={`comic-button ${source === "template" ? "" : "comic-button-secondary"}`}>Use a template</button>
        <button type="button" disabled={busy} aria-pressed={source === "upload"} onClick={() => changeSource("upload")} className={`comic-button ${source === "upload" ? "" : "comic-button-secondary"}`}>Upload your own</button>
      </div>
      {source === "template" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">{templateId && !showTemplates ? getSample(templateId)?.label : "Choose a meme template"}</h2>
            {templateId && !showTemplates ? <button type="button" disabled={busy} onClick={() => setShowTemplates(true)} className="cursor-pointer rounded-sm px-2 py-1 text-sm font-bold underline underline-offset-4 hover:bg-pink-light">Change template</button> : null}
          </div>
          {showTemplates ? <SamplePicker selectedId={templateId} onSelect={chooseTemplate} disabled={busy} /> : null}
          {isLoadingTemplate ? <p role="status" className="text-sm text-muted">Loading your template…</p> : null}
        </div>
      ) : (
      <label className="block space-y-2 text-sm font-medium text-ink">
        <span className="block text-base font-semibold">Upload your photo or GIF</span>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          required
          disabled={busy}
          aria-describedby="image-help"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            const validationError = file ? validateImage(file) : "";
            setError(validationError);
            setSuccess("");
            setChoices([]);
            setSelected("");
            setPreview(file && !validationError ? URL.createObjectURL(file) : null);
            setRemainingCaptions(null);
            setGenerationToken(null);
            setImage(validationError ? null : file);
          }}
          className="comic-file block w-full text-sm text-ink"
        />
        <span id="image-help" className="block text-xs font-normal text-muted">PNG, JPG, WEBP or GIF · Up to 5 MB</span>
      </label>
      )}
      {image?.type === "image/gif" ? <p className="text-xs leading-5 text-muted">Your GIF will stay animated when posted. Captions use its first frame; add context to describe the action.</p> : null}
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Selected image preview" className="max-h-80 w-full rounded-md border border-ink-soft object-contain" />
      ) : null}
      <details className="border-t border-ink-soft pt-4">
        <summary className="w-fit cursor-pointer text-sm font-medium text-ink">Add context <span className="font-normal text-muted">(optional)</span></summary>
        <div className="mt-3 space-y-2">
          <label className="block space-y-2 text-sm font-medium text-ink">
          <span className="sr-only">Context (optional)</span>
          <textarea
            value={context}
            onChange={(event) => { setContext(event.target.value); setChoices([]); setSelected(""); }}
            maxLength={MAX_CONTEXT_LENGTH}
            disabled={busy}
            rows={2}
            placeholder="e.g. First subway ride after a week of midterms."
            aria-describedby="context-help"
            className="comic-field"
          />
        </label>
        <p id="context-help" className="flex flex-wrap justify-between gap-2 text-xs text-muted"><span>Optional for templates and uploads. A little backstory helps shape the joke.</span><span>{context.length}/{MAX_CONTEXT_LENGTH}</span></p>
        </div>
      </details>
      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {success ? <p role="status" className="rounded-md border border-forest bg-green-light px-3 py-2 text-sm text-forest">{success}</p> : null}
      <p role="status" className="text-xs leading-5 text-muted">{generationLimitReached ? PICTURE_CAPTION_LIMIT_MESSAGE : remainingCaptions === null ? "Up to 30 captions per selection." : `${captionAllowance} of 30 captions remaining for this selection.`}</p>
      {choices.length ? (
        <section aria-label="Review captions" className="space-y-4 border-t border-ink-soft pt-5">
          <fieldset disabled={busy} className="space-y-3">
            <legend className="mb-2 comic-heading text-2xl">Choose your caption</legend>
            <p className="text-sm text-muted">{generationLimitReached ? "Choose your favorite caption to post." : "Pick a favorite, or request three more."}</p>
            {choices.map((choice, index) => (
              <label key={choice.caption} className="comic-choice">
                <input type="radio" name="caption" value={choice.caption} checked={selected === choice.caption} onChange={() => setSelected(choice.caption)} className="mt-1" />
                <span className="min-w-0 flex-1"><span className="mb-2 flex flex-wrap items-center gap-2"><span className="comic-stamp">Take {String(index + 1).padStart(2, "0")}</span>{selected === choice.caption ? <span className="comic-stamp bg-card text-ink">This one!</span> : null}</span><span className="text-base font-medium leading-7">{choice.caption}</span></span>
              </label>
            ))}
          </fieldset>
          <p className="text-xs leading-5 text-muted">Posting makes your photo, chosen caption, and name visible to everyone. Optional context stays private.</p>
          <p role="status" className="text-sm text-muted">{choices.length} captions available{selected ? ". Ready to post your selection." : ". Select one to post."}</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={publish} disabled={busy || !selected} className="comic-button comic-button-post">{isPublishing ? "Posting..." : "Post to feed"}</button>
            <button type="submit" disabled={busy || generationLimitReached} className="comic-button comic-button-secondary">{isUploading ? "Finding more punchlines..." : "Request more captions"}</button>
          </div>
        </section>
      ) : (
        <div className="space-y-3">
          <button type="submit" disabled={busy || !image || generationLimitReached} className="comic-button">
            {isUploading ? "Finding the punchlines..." : "Generate captions"}
          </button>
          <p className="text-xs text-muted">You&apos;ll review the captions before anything is posted.</p>
        </div>
      )}
      <details className="border-t border-ink-soft pt-3 text-xs text-muted">
        <summary className="w-fit cursor-pointer hover:text-ink">How your photo is used</summary>
        <p className="mt-2 max-w-xl leading-6">Your photo and optional context are sent to OpenAI to generate captions. When you choose Post to feed, your photo, selected caption, and name are publicly visible, including to people who are not signed in. Your context stays private.</p>
      </details>
      {savedCaption ? (
        <section aria-label="Your saved caption" className="space-y-3 border-t border-ink-soft pt-5">
          <h3 className="text-sm font-medium text-muted">Your latest caption</h3>
          {savedPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={savedPreview} alt="Image for your generated caption" className="max-h-80 w-full rounded-md object-contain" />
          ) : null}
          <p className="comic-caption">{savedCaption}</p>
          <Link href="/" prefetch={false} className="mr-4 inline-block text-sm font-medium underline underline-offset-4">View on feed</Link>
          <Link href="/your-posts" prefetch={false} className="inline-block text-sm font-medium underline underline-offset-4">View in Your Posts</Link>
        </section>
      ) : null}
    </form>
  );
}
