import { cookies } from "next/headers";
import sharp from "sharp";
import { createClient } from "@/app/supabase/server";
import { findPublicPost } from "@/app/posts/public-post";

export const runtime = "nodejs";

// A permanent preview URL; never put expiring storage links into share metadata.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createClient(await cookies());
  try {
    const post = await findPublicPost(supabase, id);
    if (!post) return new Response("Meme unavailable", { status: 404 });
    const { data, error } = await supabase.storage.from("post-images").download(post.image_path);
    if (error || !data) return new Response("Image unavailable", { status: 503 });
    // Use one frame for GIF previews; the public post page keeps the original animation.
    const preview = await sharp(Buffer.from(await data.arrayBuffer()), { animated: false })
      .rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#fff8ed" }).jpeg({ quality: 85 }).toBuffer();
    return new Response(new Uint8Array(preview), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Preview temporarily unavailable", { status: 503 });
  }
}
