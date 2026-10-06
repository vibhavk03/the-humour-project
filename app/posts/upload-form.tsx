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
    if (isUploading) return;
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
      const response = await fetch("/api/posts", { method: "POST", body });
      const result = await response.json() as { error?: string; message?: string; post?: { caption?: string } };
      if (!response.ok) {
        setError(result.error ?? "Upload failed. Please try again.");
        return;
      }
      setSuccess(result.message ?? "Image and caption saved.");
      setSavedCaption(result.post?.caption ?? null);
      setSavedPreview(URL.createObjectURL(image));
      setImage(null);
      setPreview(null);
      setContext("");
      if (fileInput.current) fileInput.current.value = "";
    } catch {
      setError("Could not finish generating your caption. Check your connection and try again.");
    } finally {
      setIsUploading(false);
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
          disabled={isUploading}
          aria-describedby="image-help"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            const validationError = file ? validateImage(file) : "";
            setError(validationError);
            setSuccess("");
            setPreview(file && !validationError ? URL.createObjectURL(file) : null);
            setImage(validationError ? null : file);
          }}
          className="block w-full text-sm text-zinc-700 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-950 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800"
        />
      </label>
      <p id="image-help" className="text-sm text-zinc-500">PNG, JPG, or WEBP. Maximum 5 MB. Your image is sent to OpenAI to generate a caption and saved privately.</p>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Selected image preview" className="max-h-80 w-full rounded-md border border-zinc-200 object-contain" />
      ) : null}
      <label className="block space-y-2 text-sm font-medium text-zinc-800">
        <span>Context (optional)</span>
        <textarea
          value={context}
          onChange={(event) => setContext(event.target.value)}
          maxLength={MAX_CONTEXT_LENGTH}
          disabled={isUploading}
          rows={3}
          placeholder="e.g. My first time taking the subway downtown after a week of midterms."
          aria-describedby="context-help"
          className="w-full resize-y rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition-colors focus:border-zinc-950"
        />
      </label>
      <p id="context-help" className="text-sm text-zinc-500">{context.length}/{MAX_CONTEXT_LENGTH} characters</p>
      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {success ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p> : null}
      <button type="submit" disabled={isUploading || !image} className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400">
        {isUploading ? "Finding the punchline..." : "Generate caption"}
      </button>
      {savedCaption ? (
        <section aria-label="Your saved caption" className="space-y-3 border-t border-zinc-200 pt-5">
          <h3 className="text-sm font-medium text-zinc-500">Your latest caption</h3>
          {savedPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={savedPreview} alt="Image for your generated caption" className="max-h-80 w-full rounded-md object-contain" />
          ) : null}
          <p className="text-lg font-medium text-zinc-950">{savedCaption}</p>
          <Link href="/" prefetch={false} className="inline-block text-sm font-medium underline underline-offset-4">View in your feed</Link>
        </section>
      ) : null}
    </form>
  );
}
