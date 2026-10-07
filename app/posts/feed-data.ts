import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPostHearts } from "./heart-data";

export const FEED_PAGE_SIZE = 12;
export type FeedPost = {
  id: string;
  user_id: string;
  image_path: string;
  context: string | null;
  caption: string | null;
  created_at: string;
  signedImageUrl: string | null;
  heartCount: number;
  hearted: boolean;
  heartsAvailable: boolean;
};

export async function getUserFeed(supabase: SupabaseClient, userId: string, page: number) {
  return getFeed(supabase, page, userId);
}

export async function getHomeFeed(supabase: SupabaseClient, page: number) {
  return getFeed(supabase, page);
}

async function getFeed(supabase: SupabaseClient, page: number, userId?: string) {
  const start = (page - 1) * FEED_PAGE_SIZE;
  // Cross-user reads go through a restricted view, not broader posts RLS.
  let query = supabase.from(userId ? "posts" : "home_feed")
    .select(userId ? "id, user_id, image_path, context, caption, created_at" : "id, user_id, image_path, caption, created_at");
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(start, start + FEED_PAGE_SIZE)
    .returns<Omit<FeedPost, "signedImageUrl" | "heartCount" | "hearted" | "heartsAvailable">[]>();

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
  const hearts = await getPostHearts(supabase, visible.filter(post => post.caption).map(post => post.id));
  return {
    posts: visible.map(post => ({
      ...post, context: userId ? post.context : null,
      signedImageUrl: urls.get(post.image_path) || null,
      heartCount: Number(hearts?.get(post.id)?.heart_count ?? 0),
      hearted: hearts?.get(post.id)?.hearted ?? false,
      heartsAvailable: hearts !== null && hearts.has(post.id),
    })),
    hasNext: rows.length > FEED_PAGE_SIZE,
    error: false,
  };
}
