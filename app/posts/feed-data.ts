import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPostVotes, type Vote } from "./vote-data";
import type { FeedCursor } from "./feed-cursor";

export const FEED_PAGE_SIZE = 12;
export type FeedPost = {
  id: string;
  user_id: string;
  image_path: string;
  context: string | null;
  caption: string | null;
  created_at: string;
  signedImageUrl: string | null;
  score: number;
  userVote: Vote;
  votesAvailable: boolean;
  authorName: string | null;
  crowdPick?: boolean;
};

export async function getUserFeed(supabase: SupabaseClient, userId: string, page: number) {
  return getFeed(supabase, page, userId);
}

export async function getHomeFeed(supabase: SupabaseClient, page: number) {
  return getFeed(supabase, page);
}

async function getFeed(supabase: SupabaseClient, page: number, userId?: string) {
  const start = (page - 1) * FEED_PAGE_SIZE;
  // Database ranking happens before range(), so an old favorite can lead page one.
  function queryFeed(ranked: boolean) {
    let query = supabase.from(userId ? "user_feed" : ranked ? "ranked_home_feed" : "home_feed")
      .select(userId ? "id, user_id, image_path, context, caption, created_at, authorName:author_name" : `id, user_id, image_path, caption, created_at, authorName:author_name${ranked ? ", crowdPick:is_crowd_pick" : ""}`);
    if (userId) query = query.eq("user_id", userId);
    if (ranked) query = query.order("is_crowd_pick", { ascending: false });
    return query.order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(start, start + FEED_PAGE_SIZE)
      .returns<Omit<FeedPost, "signedImageUrl" | "score" | "userVote" | "votesAvailable">[]>();
  }
  let { data, error } = await queryFeed(!userId);
  if (!userId && error && ["PGRST205", "42P01"].includes(error.code)) {
    // Keep browsing available until the ranking migration has been applied.
    console.warn("Crowd Pick ranking unavailable; apply supabase/crowd-pick.sql.");
    ({ data, error } = await queryFeed(false));
  }

  if (error) {
    console.error("Feed query failed:", error.code);
    return { posts: [] as FeedPost[], hasNext: false, error: true };
  }
  return hydrateFeed(supabase, data ?? [], userId);
}

// Continue chronologically using the initial Crowd Pick, even if votes change.
export async function getNextFeed(supabase: SupabaseClient, cursor: FeedCursor, userId?: string) {
  let query = supabase.from(userId ? "user_feed" : "home_feed")
    .select(userId ? "id, user_id, image_path, context, caption, created_at, authorName:author_name" : "id, user_id, image_path, caption, created_at, authorName:author_name");
  if (userId) query = query.eq("user_id", userId);
  if (!userId && cursor.pinnedId) query = query.neq("id", cursor.pinnedId);
  const { data, error } = await query
    .or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(0, FEED_PAGE_SIZE)
    .returns<Omit<FeedPost, "signedImageUrl" | "score" | "userVote" | "votesAvailable">[]>();
  if (error) {
    console.error("Feed continuation failed:", error.code);
    return { posts: [] as FeedPost[], hasNext: false, error: true };
  }
  return hydrateFeed(supabase, data ?? [], userId);
}

async function hydrateFeed(supabase: SupabaseClient, rows: Omit<FeedPost, "signedImageUrl" | "score" | "userVote" | "votesAvailable">[], userId?: string) {
  const visible = rows.slice(0, FEED_PAGE_SIZE);
  if (!visible.length) return { posts: [] as FeedPost[], hasNext: false, error: false };

  const { data: images, error: signingError } = await supabase.storage.from("post-images")
    .createSignedUrls(visible.map(post => post.image_path), 60 * 60);
  if (signingError) console.error("Feed image signing failed:", signingError.name);
  const urls = new Map((images ?? []).map(image => [image.path, image.signedUrl]));
  const votes = await getPostVotes(supabase, visible.filter(post => post.caption).map(post => post.id));
  return {
    posts: visible.map(post => ({
      ...post, context: userId ? post.context : null,
      authorName: post.authorName ?? null,
      crowdPick: !userId && post.crowdPick === true,
      signedImageUrl: urls.get(post.image_path) || null,
      score: Number(votes?.get(post.id)?.score ?? 0),
      userVote: votes?.get(post.id)?.user_vote ?? 0,
      votesAvailable: votes !== null && votes.has(post.id),
    })),
    hasNext: rows.length > FEED_PAGE_SIZE,
    error: false,
  };
}
