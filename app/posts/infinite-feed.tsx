"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { HomeFeedSort } from "./feed-sort";
import type { FeedPost } from "./feed-data";
import { VoteButtons } from "./vote-buttons";
import { DeletePostButton } from "./delete-post-button";
import { AuthorProfilePopover } from "./author-profile";

export function InfiniteFeed({ initialPosts, initialCursor, userId, scope, sort = "all" }: {
  initialPosts: FeedPost[]; initialCursor: string | null; userId: string | null; scope: "personal" | "home"; sort?: HomeFeedSort;
}) {
  const isHome = scope === "home";
  const [posts, setPosts] = useState(initialPosts);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const sentinel = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const loadMore = useCallback(async () => {
    if (!cursor || pending.current) return;
    pending.current = true;
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ scope, cursor, sort });
      const response = await fetch(`/api/feed?${params}`, { cache: "no-store", signal: request.signal });
      const result = await response.json() as { posts?: FeedPost[]; nextCursor?: string | null; error?: string };
      if (!response.ok) throw new Error(result.error || "Posts could not be loaded. Please try again.");
      if (!Array.isArray(result.posts) || (result.nextCursor !== null && typeof result.nextCursor !== "string") || result.nextCursor === cursor) {
        throw new Error("Posts could not be loaded. Please try again.");
      }
      if (request.signal.aborted) return;
      setPosts(current => {
        const seen = new Set(current.map(post => post.id));
        return [...current, ...result.posts!.filter(post => {
          if (seen.has(post.id)) return false;
          seen.add(post.id);
          return true;
        })];
      });
      setCursor(result.nextCursor ?? null);
    } catch (failure) {
      if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load more posts. Check your connection and try again.");
    } finally {
      pending.current = false;
      if (!request.signal.aborted) setLoading(false);
    }
  }, [cursor, scope, sort]);

  useEffect(() => {
    const target = sentinel.current;
    if (!target || !cursor || loading || error || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void loadMore();
    }, { rootMargin: "600px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [cursor, loading, error, loadMore]);

  return (
    <section aria-label={isHome ? "Community posts" : "Your saved posts"} className="space-y-6">
      {!posts.length && !cursor ? (
        <div className="comic-panel space-y-4 p-7 text-center">
          <h2 className="comic-heading text-2xl">{isHome && sort === "unrated" ? "You’ve rated every post" : isHome ? "Be the first to bring the punchline" : "Your first punchline starts here"}</h2>
          <p className="text-sm text-muted">{isHome && sort === "unrated" ? "Check back for new posts, or switch to All to browse the community." : isHome ? "Generate a caption to start the community feed." : "Upload an image and generate a caption. Your saved posts will appear here."}</p>
          <Link href={isHome && sort === "unrated" ? "/#community-feed" : userId ? "/generate" : "/try"} className="comic-button">{isHome && sort === "unrated" ? "See all posts" : "Generate a caption"}</Link>
        </div>
      ) : <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">{posts.map(post => (

        <article key={post.id} id={`post-${post.id}`} className="comic-panel comic-feed-card scroll-mt-6 min-w-0 overflow-hidden">
          {isHome && post.crowdPick ? (
            <div className="border-b-2 border-ink bg-green-light px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-forest">
              <span aria-hidden="true">★ </span>Crowd Pick <span className="font-normal">· Top voted</span>
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
              <AuthorProfilePopover authorId={post.user_id} authorName={post.authorName} />
              {post.user_id === userId ? <span className="comic-stamp">Your post</span> : null}
            </div>
            <p className={post.caption ? "comic-caption" : "text-sm text-muted"}>{post.caption || "This image was saved before caption generation was available."}</p>
            {!isHome && post.context ? <p className="whitespace-pre-wrap break-words text-sm text-muted">{post.context}</p> : null}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                {post.caption ? <VoteButtons key={`${post.id}-${post.score}-${post.userVote}`} postId={post.id} initialScore={post.score} initialVote={post.userVote} available={post.votesAvailable} isSignedIn={Boolean(userId)} onVoteChange={vote => { if (sort === "unrated" && vote !== 0) setPosts(current => current.filter(item => item.id !== post.id)); }} /> : null}
              </div>
              {post.user_id === userId ? <DeletePostButton postId={post.id} onDeleted={() => setPosts(current => current.filter(item => item.id !== post.id))} /> : null}
            </div>
            <time dateTime={post.created_at} className="block text-xs text-muted">
              {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(new Date(post.created_at))}
            </time>
          </div>
        </article>
      ))}</div>}
      <div ref={sentinel} className="flex min-h-16 flex-col items-center justify-center gap-3" aria-busy={loading}>
        <p role="status" aria-live="polite" className="text-sm text-muted">
          {loading ? "Loading more memes…" : !cursor && posts.length ? (isHome ? "You’re all caught up." : "That’s all your posts for now.") : ""}
        </p>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        {cursor ? <button type="button" onClick={() => void loadMore()} disabled={loading} className="comic-button comic-button-secondary disabled:opacity-50">
          {error ? "Try again" : loading ? "Loading…" : "Load more memes"}
        </button> : null}
      </div>
    </section>
  );
}
