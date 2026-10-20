import "server-only";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyReview } from "@/app/posts/caption-review";
import { IMAGE_EXTENSIONS } from "@/app/posts/upload-validation";
import { readSample } from "./sample-files";

export class TrialPublishError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export async function getTrialSelection(guestId: string, sampleId: unknown, caption: unknown, reviewToken: unknown) {
  const asset = await readSample(sampleId);
  const review = asset && typeof reviewToken === "string" && reviewToken.length <= 16000
    ? verifyReview(reviewToken, `guest:${guestId}`, asset.bytes, asset.sample.mimeType, asset.sample.description) : null;
  if (!asset || !review || typeof caption !== "string" || !review.captions.includes(caption)) {
    throw new TrialPublishError("This selection expired or changed. Generate fresh captions before posting.", 400);
  }
  return { ...asset, review, caption, reviewToken: reviewToken as string };
}

export async function publishTrialSelection(supabase: SupabaseClient, userId: string, selection: Awaited<ReturnType<typeof getTrialSelection>>) {
  const { sample, bytes, review, caption, reviewToken } = selection;
  // The same signed selection and account always resolve to the same primary key.
  // This survives lost responses, repeated callbacks, and concurrent requests.
  const hash = createHash("sha256").update(JSON.stringify([userId, sample.id, caption, reviewToken])).digest("hex");
  const postId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  async function existingPost() {
    const { data, error } = await supabase.from("posts").select("id").eq("id", postId).eq("user_id", userId).maybeSingle();
    if (error) throw new TrialPublishError("Your post could not be checked. Please try again.", 500);
    return Boolean(data);
  }
  function complete() {
    revalidatePath("/");
    revalidatePath("/your-posts");
    return postId;
  }
  if (await existingPost()) return complete();

  const imagePath = `${userId}/${postId}.${IMAGE_EXTENSIONS[sample.mimeType]}`;
  const bucket = supabase.storage.from("post-images");
  const { error: uploadError } = await bucket.upload(imagePath, bytes, { contentType: sample.mimeType, upsert: false });
  // A simultaneous request may already have uploaded this exact immutable image.
  const duplicateImage = uploadError && "statusCode" in uploadError && String(uploadError.statusCode) === "409";
  if (uploadError && !duplicateImage) {
    if (await existingPost()) return complete();
    throw new TrialPublishError("Your meme could not be uploaded. Please try again.", 500);
  }
  const { error: saveError } = await supabase.from("posts").insert({
    id: postId, user_id: userId, image_path: imagePath, context: null, caption,
    generation_prompt: review.generation_prompt, prompt_version: review.prompt_version, model: review.model,
  });
  if (saveError) {
    // Check for a committed or simultaneous insert before touching its image.
    if (await existingPost()) return complete();
    if (!uploadError) {
      const { error: cleanupError } = await bucket.remove([imagePath]);
      if (cleanupError) console.error("Trial image cleanup failed:", cleanupError.name);
    }
    throw new TrialPublishError("Your meme could not be posted. Please try again.", 500);
  }
  return complete();
}
