import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Vote = -1 | 0 | 1;
export type VoteStats = { post_id: string; score: number; user_vote: Vote };

export async function getPostVotes(supabase: SupabaseClient, postIds: string[]) {
  const { data, error } = await supabase.rpc("get_post_votes", { post_ids: postIds });
  if (error) {
    console.error("Post votes could not be loaded:", error.code);
    return null;
  }
  return new Map((data as VoteStats[] ?? []).map(stats => [stats.post_id, stats]));
}
