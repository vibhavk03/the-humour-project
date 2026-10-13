"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ACCEPTED_IMAGE_TYPES, MAX_CONTEXT_LENGTH, validateImage } from "./upload-validation";

export function UploadForm() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [context, setContext] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [choices, setChoices] = useState<{ caption: string; reviewToken: string }[]>([]);
  const [selected, setSelected] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const busy = isUploading || isPublishing;
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [savedCaption, setSavedCaption] = useState<string | null>(null);
  const [savedPreview, setSavedPreview] = useState<string | null>(null);

  useEffect(() => {
    if (preview) return () => URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    if (savedPreview) return () => URL.revokeObjectURL(savedPreview);
  }, [savedPreview]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
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
      body.set("previousCaptions", JSON.stringify(choices.slice(-60).map(choice => choice.caption)));
      const response = await fetch("/api/posts", { method: "POST", body });
      const result = await response.json() as { error?: string; captions?: string[]; reviewToken?: string };
      if (!response.ok || !result.captions || !result.reviewToken) {
        setError(result.error ?? "Could not generate captions. Please try again.");
        return;
      }
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
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) {
        setError(result.error ?? "Could not post. Please try again.");
        return;
      }
      setSuccess(result.message ?? "Posted to the feed.");
      setSavedCaption(choice.caption);
      setSavedPreview(URL.createObjectURL(image));
      setImage(null);
      setPreview(null);
      setContext("");
      setChoices([]);
      setSelected("");
      if (fileInput.current) fileInput.current.value = "";
    } catch {
      setError("Could not post. Check your connection and try again.");
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Give your image a punchline</h2>
        <p className="text-sm text-zinc-600">A dorm moment, a weekend adventure, or something only New York could explain.</p>
      </div>
      <label className="block space-y-2 text-sm font-medium text-zinc-800">
        <span>Image</span>
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
            setImage(validationError ? null : file);
          }}
          className="block w-full text-sm text-zinc-700 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-950 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800"
        />
      </label>
      <p id="image-help" className="text-sm text-zinc-500">PNG, JPG, or WEBP. Maximum 5 MB. Your image is sent to OpenAI to generate caption choices.</p>
      <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-700">Review your captions before posting. Only your image and chosen caption will be shared with everyone in the app. Your optional context stays private.</p>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Selected image preview" className="max-h-80 w-full rounded-md border border-zinc-200 object-contain" />
      ) : null}
      <label className="block space-y-2 text-sm font-medium text-zinc-800">
        <span>Context (optional)</span>
        <textarea
          value={context}
          onChange={(event) => { setContext(event.target.value); setChoices([]); setSelected(""); }}
          maxLength={MAX_CONTEXT_LENGTH}
          disabled={busy}
          rows={3}
          placeholder="e.g. My first time taking the subway downtown after a week of midterms."
          aria-describedby="context-help"
          className="w-full resize-y rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition-colors focus:border-zinc-950"
        />
      </label>
      <p id="context-help" className="text-sm text-zinc-500">{context.length}/{MAX_CONTEXT_LENGTH} characters</p>
      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {success ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p> : null}
      {choices.length ? (
        <section aria-label="Review captions" className="space-y-4 border-t border-zinc-200 pt-5">
          <fieldset disabled={busy} className="space-y-3">
            <legend className="mb-2 text-xl font-semibold">Choose your caption</legend>
            <p className="text-sm text-zinc-600">Pick your favorite, or request three more options. Nothing is posted until you choose Post to feed.</p>
            {choices.map((choice, index) => (
              <label key={choice.caption} className={`flex cursor-pointer gap-3 rounded-md border p-4 ${selected === choice.caption ? "border-zinc-950 bg-zinc-50" : "border-zinc-200"}`}>
                <input type="radio" name="caption" value={choice.caption} checked={selected === choice.caption} onChange={() => setSelected(choice.caption)} className="mt-1" />
                <span><span className="mb-1 block text-xs text-zinc-500">Option {index + 1}</span>{choice.caption}</span>
              </label>
            ))}
          </fieldset>
          <p role="status" className="text-sm text-zinc-500">{choices.length} captions available{selected ? ". Ready to post your selection." : ". Select one to post."}</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={publish} disabled={busy || !selected} className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400">{isPublishing ? "Posting..." : "Post to feed"}</button>
            <button type="submit" disabled={busy} className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50">{isUploading ? "Finding more punchlines..." : "Request more captions"}</button>
          </div>
        </section>
      ) : (
        <button type="submit" disabled={busy || !image} className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400">
          {isUploading ? "Finding the punchlines..." : "Generate 3 captions"}
        </button>
      )}
      {savedCaption ? (
        <section aria-label="Your saved caption" className="space-y-3 border-t border-zinc-200 pt-5">
          <h3 className="text-sm font-medium text-zinc-500">Your latest caption</h3>
          {savedPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={savedPreview} alt="Image for your generated caption" className="max-h-80 w-full rounded-md object-contain" />
          ) : null}
          <p className="text-lg font-medium text-zinc-950">{savedCaption}</p>
          <Link href="/" prefetch={false} className="mr-4 inline-block text-sm font-medium underline underline-offset-4">View on feed</Link>
          <Link href="/your-posts" prefetch={false} className="inline-block text-sm font-medium underline underline-offset-4">View in Your Posts</Link>
        </section>
      ) : null}
    </form>
  );
}
