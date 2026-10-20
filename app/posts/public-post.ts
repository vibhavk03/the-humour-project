import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/app/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PUBLIC_SITE_URL = "https://the-humour-project.vercel.app";
export const isPostId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export type PublicPost = { id: string; user_id: string; image_path: string; caption: string; created_at: string; author_name: string | null };

export async function findPublicPost(supabase: SupabaseClient, id: string): Promise<PublicPost | null> {
  if (!isPostId(id)) return null;
  // Query the public projection, never the base table or the private context.
  const { data, error } = await supabase.from("home_feed")
    .select("id, user_id, image_path, caption, created_at, author_name")
    .eq("id", id).maybeSingle<PublicPost>();
  if (error) throw new Error("This meme could not be loaded. Please try again.");
  return data;
}

// Share the lookup between page rendering and metadata within this request.
export const getPublicPost = cache(async (id: string) => {
  if (!isPostId(id)) return null;
  return findPublicPost(createClient(await cookies()), id);
});
