import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type HeartStats = { post_id: string; heart_count: number; hearted: boolean };

export async function getPostHearts(supabase: SupabaseClient, postIds: string[]) {
  const { data, error } = await supabase.rpc("get_post_hearts", { post_ids: postIds });
  if (error) {
    console.error("Post hearts could not be loaded:", error.code);
    return null;
  }
  return new Map((data as HeartStats[] ?? []).map(stats => [stats.post_id, stats]));
}
