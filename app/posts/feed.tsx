import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getHomeFeed, getUserFeed } from "./feed-data";
import { HeartButton } from "./heart-button";

export async function Feed({ supabase, userId, page, scope = "personal" }: { supabase: SupabaseClient; userId: string; page: number; scope?: "personal" | "home" }) {
  const isHome = scope === "home";
  const basePath = isHome ? "/" : "/your-posts";
  const pageHref = (number: number) => number === 1 ? basePath : `${basePath}?page=${number}`;
  const { posts, hasNext, error } = isHome ? await getHomeFeed(supabase, page) : await getUserFeed(supabase, userId, page);

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
        <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm">
          <h2 className="text-lg font-semibold">{page === 1 ? (isHome ? "Be the first to bring the punchline" : "Your first punchline starts here") : "No posts on this page"}</h2>
          <p className="text-sm text-zinc-600">{page === 1 ? (isHome ? "Generate a caption to start the community feed." : "Upload an image and generate a caption. Your saved posts will appear here.") : "Go back to see your earlier posts."}</p>
          {page === 1 ? <Link href="/generate" className="inline-block rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">Generate a caption</Link> : null}
        </div>
      ) : posts.map(post => (
        <article key={post.id} className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
          {post.signedImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.signedImageUrl} alt={(!isHome && post.context) || "Image for this caption"} loading="lazy" className="max-h-[36rem] w-full bg-zinc-100 object-contain" />
          ) : (
            <div className="flex min-h-48 items-center justify-center bg-zinc-100 p-6 text-sm text-zinc-500">Image unavailable. Refresh the feed to try again.</div>
          )}
          <div className="space-y-3 p-5">
            {isHome ? <p className="text-xs font-medium text-zinc-500">{post.user_id === userId ? "Your post" : "Community post"}</p> : null}
            <p className={post.caption ? "text-lg font-medium" : "text-sm text-zinc-500"}>{post.caption || "This image was saved before caption generation was available."}</p>
            {!isHome && post.context ? <p className="whitespace-pre-wrap break-words text-sm text-zinc-600">{post.context}</p> : null}
            {post.caption ? <HeartButton key={`${post.id}-${post.heartCount}-${post.hearted}`} postId={post.id} initialCount={post.heartCount} initialHearted={post.hearted} available={post.heartsAvailable} /> : null}
            <time dateTime={post.created_at} className="block text-xs text-zinc-500">
              {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(new Date(post.created_at))}
            </time>
          </div>
        </article>
      ))}
      {page > 1 || hasNext ? (
        <nav aria-label="Feed pagination" className="flex items-center justify-between gap-3 text-sm">
          {page > 1 ? <Link href={pageHref(page - 1)} prefetch={false} className="rounded-md border border-zinc-300 px-4 py-2 hover:bg-zinc-100">Newer posts</Link> : <span />}
          <span className="text-zinc-500">Page {page}</span>
          {hasNext ? <Link href={pageHref(page + 1)} prefetch={false} className="rounded-md border border-zinc-300 px-4 py-2 hover:bg-zinc-100">Older posts</Link> : <span />}
        </nav>
      ) : null}
    </section>
  );
}
