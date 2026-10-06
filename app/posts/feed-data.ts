import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const FEED_PAGE_SIZE = 12;
export type FeedPost = {
  id: string;
  image_path: string;
  context: string | null;
  caption: string | null;
  created_at: string;
  signedImageUrl: string | null;
};

export async function getUserFeed(supabase: SupabaseClient, userId: string, page: number) {
  const start = (page - 1) * FEED_PAGE_SIZE;
  const { data, error } = await supabase.from("posts")
    .select("id, image_path, context, caption, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(start, start + FEED_PAGE_SIZE)
    .returns<Omit<FeedPost, "signedImageUrl">[]>();

  if (error) {
    console.error("Feed query failed:", error.code);
    return { posts: [] as FeedPost[], hasNext: false, error: true };
  }
  const rows = data ?? [];
  const visible = rows.slice(0, FEED_PAGE_SIZE);
  if (!visible.length) return { posts: [] as FeedPost[], hasNext: false, error: false };

  const { data: images, error: signingError } = await supabase.storage.from("post-images")
    .createSignedUrls(visible.map(post => post.image_path), 60 * 60);
  if (signingError) console.error("Feed image signing failed:", signingError.name);
  const urls = new Map((images ?? []).map(image => [image.path, image.signedUrl]));
  return {
    posts: visible.map(post => ({ ...post, signedImageUrl: urls.get(post.image_path) || null })),
    hasNext: rows.length > FEED_PAGE_SIZE,
    error: false,
  };
}
