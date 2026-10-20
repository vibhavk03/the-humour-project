import Link from "next/link";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getHomeFeed, getUserFeed } from "./feed-data";
import { makeFeedCursor } from "./feed-cursor";
import { FeedFilters, homeFeedHref, type HomeFeedSort } from "./feed-filters";
import { InfiniteFeed } from "./infinite-feed";

export async function Feed({ supabase, userId, scope = "personal", sort = "all" }: { supabase: SupabaseClient; userId: string | null; scope?: "personal" | "home"; sort?: HomeFeedSort }) {
  const isHome = scope === "home";
  if (!isHome && !userId) return null;
  const filters = isHome ? <FeedFilters sort={sort} signedIn={Boolean(userId)} /> : null;
  if (isHome && sort === "unrated" && !userId) return <div className="space-y-4">{filters}<p className="text-sm text-muted">Sign in to see posts you haven’t rated.</p></div>;
  const { posts, hasNext, error } = isHome ? await getHomeFeed(supabase, 1, sort) : await getUserFeed(supabase, userId!, 1);
  if (error) return (
    <div className="space-y-4">
      {filters}
      <section role="alert" className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        <p>Posts could not be loaded. Please try again.</p>
        <Link href={isHome ? homeFeedHref(sort) : "/your-posts"} prefetch={false} className="font-medium underline">Reload feed</Link>
      </section>
    </div>
  );
  return (
    <div className="space-y-5">
      {filters}
      <InfiniteFeed
        key={createHash("sha256").update(JSON.stringify([scope, userId, sort, posts])).digest("hex")}
        initialPosts={posts}
        initialCursor={hasNext ? makeFeedCursor(posts, posts.find(post => post.crowdPick)?.id ?? null, sort) : null}
        userId={userId}
        scope={scope}
        sort={sort}
      />
    </div>
  );
}
