import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/app/supabase/server";
import {
  IMAGE_EXTENSIONS,
  MAX_CONTEXT_LENGTH,
  matchesImageType,
  validateImage,
} from "@/app/posts/upload-validation";

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
  }).select("id, context, created_at").single();

  if (saveError) {
    const { error: cleanupError } = await bucket.remove([imagePath]);
    console.error("Post save failed:", saveError);
    if (cleanupError) console.error("Post image cleanup failed:", cleanupError);
    return NextResponse.json({ error: "Post could not be saved. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ message: "Image and context saved.", post }, { status: 201 });
}
