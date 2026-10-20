import Link from "next/link";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getHomeFeed, getUserFeed } from "./feed-data";
import { makeFeedCursor } from "./feed-cursor";
import { InfiniteFeed } from "./infinite-feed";

export async function Feed({ supabase, userId, scope = "personal" }: { supabase: SupabaseClient; userId: string | null; scope?: "personal" | "home" }) {
  const isHome = scope === "home";
  if (!isHome && !userId) return null;
  const { posts, hasNext, error } = isHome ? await getHomeFeed(supabase, 1) : await getUserFeed(supabase, userId!, 1);
  if (error) return (
    <section role="alert" className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
      <p>Posts could not be loaded. Please try again.</p>
      <Link href={isHome ? "/#community-feed" : "/your-posts"} prefetch={false} className="font-medium underline">Reload feed</Link>
    </section>
  );
  return <InfiniteFeed key={createHash("sha256").update(JSON.stringify([scope, userId, posts])).digest("hex")} initialPosts={posts} initialCursor={hasNext ? makeFeedCursor(posts) : null} userId={userId} scope={scope} />;
}
