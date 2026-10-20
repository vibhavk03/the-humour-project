import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getHomeFeed, getUserFeed } from "./feed-data";
import { HeartButton } from "./heart-button";
import { DeletePostButton } from "./delete-post-button";

export async function Feed({ supabase, userId, page, scope = "personal" }: { supabase: SupabaseClient; userId: string | null; page: number; scope?: "personal" | "home" }) {
  const isHome = scope === "home";
  const basePath = isHome ? "/" : "/your-posts";
  const pageHref = (number: number) => `${number === 1 ? basePath : `${basePath}?page=${number}`}${isHome ? "#community-feed" : ""}`;
  if (!isHome && !userId) return null;
  const { posts, hasNext, error } = isHome ? await getHomeFeed(supabase, page) : await getUserFeed(supabase, userId!, page);

  if (error) {
    return (
      <section role="alert" className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        <p>Posts could not be loaded. Please try again.</p>
        <Link href={pageHref(page)} prefetch={false} className="font-medium underline">Reload feed</Link>
      </section>
    );
  }

  return (
    <section aria-label={isHome ? "Community posts" : "Your saved posts"} className="space-y-6">
      {!posts.length ? (
        <div className="comic-panel space-y-4 p-7 text-center">
          <h2 className="comic-heading text-2xl">{page === 1 ? (isHome ? "Be the first to bring the punchline" : "Your first punchline starts here") : "No posts on this page"}</h2>
          <p className="text-sm text-muted">{page === 1 ? (isHome ? "Generate a caption to start the community feed." : "Upload an image and generate a caption. Your saved posts will appear here.") : "Go back to see your earlier posts."}</p>
          {page === 1 ? <Link href="/generate" className="comic-button">Generate a caption</Link> : null}
        </div>
      ) : <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">{posts.map(post => (
        <article key={post.id} id={`post-${post.id}`} className="comic-panel comic-feed-card scroll-mt-6 min-w-0 overflow-hidden">
          {isHome && page === 1 && post.crowdPick ? (
            <div className="border-b-2 border-ink bg-green-light px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-forest">
              <span aria-hidden="true">★ </span>Crowd Pick <span className="font-normal">· Most liked</span>
            </div>
          ) : null}
          {post.signedImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.signedImageUrl} alt={(!isHome && post.context) || "Image for this caption"} loading="lazy" className="comic-feed-image w-full bg-pink-light object-contain" />
          ) : (
            <div className="comic-feed-image flex items-center justify-center bg-pink-light p-6 text-sm text-muted">Image unavailable. Refresh the feed to try again.</div>
          )}
          <div className="space-y-3 border-t-2 border-ink p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="min-w-0 break-words text-sm font-bold">By {post.authorName || "Campus contributor"}</p>
              {post.user_id === userId ? <span className="comic-stamp">Your post</span> : null}
            </div>
            <p className={post.caption ? "comic-caption" : "text-sm text-muted"}>{post.caption || "This image was saved before caption generation was available."}</p>
            {!isHome && post.context ? <p className="whitespace-pre-wrap break-words text-sm text-muted">{post.context}</p> : null}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                {post.caption ? <HeartButton key={`${post.id}-${post.heartCount}-${post.hearted}`} postId={post.id} initialCount={post.heartCount} initialHearted={post.hearted} available={post.heartsAvailable} isSignedIn={Boolean(userId)} /> : null}
              </div>
              {post.user_id === userId ? <DeletePostButton postId={post.id} /> : null}
            </div>
            <time dateTime={post.created_at} className="block text-xs text-muted">
              {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(new Date(post.created_at))}
            </time>
          </div>
        </article>
      ))}</div>}
      {page > 1 || hasNext ? (
        <nav aria-label="Feed pagination" className="flex items-center justify-between gap-3 text-sm">
          {page > 1 ? <Link href={pageHref(page - 1)} prefetch={false} className="comic-button comic-button-secondary">Newer posts</Link> : <span />}
          <span className="text-muted">Page {page}</span>
          {hasNext ? <Link href={pageHref(page + 1)} prefetch={false} className="comic-button comic-button-secondary">Older posts</Link> : <span />}
        </nav>
      ) : null}
    </section>
  );
}
