import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/app/supabase/server";
import { createReview, verifyReview } from "@/app/posts/caption-review";
import { CaptionError, generateCaption } from "@/app/posts/generate-caption";
import {
  IMAGE_EXTENSIONS,
  MAX_CONTEXT_LENGTH,
  matchesImageType,
  validateImage,
} from "@/app/posts/upload-validation";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = createClient(await cookies());
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Sign in to upload an image." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send an image using multipart form data." }, { status: 400 });
  }

  const image = formData.get("image");
  const rawContext = formData.get("context");
  if (!(image instanceof File)) {
    return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
  }
  const imageError = validateImage(image);
  if (imageError) {
    return NextResponse.json({ error: imageError }, { status: 400 });
  }
  if (rawContext !== null && typeof rawContext !== "string") {
    return NextResponse.json({ error: "Context must be text." }, { status: 400 });
  }
  const context = (rawContext ?? "").trim();
  if (context.length > MAX_CONTEXT_LENGTH) {
    return NextResponse.json({ error: `Context must be ${MAX_CONTEXT_LENGTH} characters or fewer.` }, { status: 400 });
  }

  const bytes = new Uint8Array(await image.arrayBuffer());
  if (!matchesImageType(bytes, image.type)) {
    return NextResponse.json({ error: "The file contents do not match the selected image type." }, { status: 400 });
  }

  // Future image moderation belongs here, before storage or caption generation.
  // No moderation is performed in this version.
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Caption generation is not configured yet." }, { status: 503 });
  }
  const action = formData.get("action") ?? "generate";
  if (action !== "generate" && action !== "publish") {
    return NextResponse.json({ error: "Choose generate or publish." }, { status: 400 });
  }
  if (action === "generate") {
    let previousCaptions: string[] = [];
    const previous = formData.get("previousCaptions");
    if (previous !== null) {
      try {
        const parsed: unknown = JSON.parse(String(previous));
        if (!Array.isArray(parsed) || parsed.length > 60 || parsed.some(value => typeof value !== "string" || value.length > 200)) throw new Error();
        previousCaptions = parsed;
      } catch {
        return NextResponse.json({ error: "Previous captions must be a list of short captions." }, { status: 400 });
      }
    }
    try {
      const generated = await generateCaption(bytes, image.type, context, previousCaptions);
      return NextResponse.json({ captions: generated.captions, reviewToken: createReview(generated, user.id, bytes, image.type, context) });
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof CaptionError ? error.message : "Caption generation failed. Please try again.",
          code: error instanceof CaptionError ? error.code : "caption_generation_failed",
          retryAfterSeconds: error instanceof CaptionError ? error.retryAfterSeconds : undefined,
        },
        {
          status: error instanceof CaptionError ? error.status : 502,
          headers: error instanceof CaptionError && error.retryAfterSeconds
            ? { "Retry-After": String(error.retryAfterSeconds) } : undefined,
        },
      );
    }
  }

  const token = formData.get("reviewToken");
  const caption = formData.get("caption");
  const review = typeof token === "string" && token.length <= 16000
    ? verifyReview(token, user.id, bytes, image.type, context) : null;
  if (!review || typeof caption !== "string" || !review.captions.includes(caption)) {
    return NextResponse.json({ error: "Choose a generated caption for this image. If your review expired, generate captions again." }, { status: 400 });
  }
  const postId = crypto.randomUUID();
  const imagePath = `${user.id}/${postId}.${IMAGE_EXTENSIONS[image.type]}`;
  const bucket = supabase.storage.from("post-images");
  const { error: uploadError } = await bucket.upload(imagePath, bytes, {
    contentType: image.type,
    upsert: false,
  });
  if (uploadError) {
    console.error("Post image upload failed:", uploadError);
    return NextResponse.json({ error: "Image could not be uploaded. Please try again." }, { status: 500 });
  }

  const { data: post, error: saveError } = await supabase.from("posts").insert({
    id: postId,
    user_id: user.id,
    image_path: imagePath,
    context: context || null,
    caption,
    generation_prompt: review.generation_prompt,
    prompt_version: review.prompt_version,
    model: review.model,
  }).select("id, context, caption, created_at").single();

  if (saveError) {
    const { error: cleanupError } = await bucket.remove([imagePath]);
    console.error("Post save failed:", saveError);
    if (cleanupError) console.error("Post image cleanup failed:", cleanupError);
    return NextResponse.json({ error: "Post could not be saved. Please try again." }, { status: 500 });
  }

  revalidatePath("/");
  revalidatePath("/your-posts");
  return NextResponse.json({ message: "Your selected caption has been posted to the feed.", post }, { status: 201 });
}
