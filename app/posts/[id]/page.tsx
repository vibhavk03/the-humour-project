import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/app/supabase/server";
import { getPublicPost, PUBLIC_SITE_URL } from "../public-post";
import { getPostVotes } from "../vote-data";
import { VoteButtons } from "../vote-buttons";
import { SharePostButton } from "../share-post-button";
import { AuthorProfilePopover } from "../author-profile";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const post = await getPublicPost(id);
  if (!post) notFound();
  const title = `Meme by ${post.author_name || "Campus contributor"} | The Humour Project`;
  const url = `${PUBLIC_SITE_URL}/posts/${post.id}`;
  const images = [{ url: `${PUBLIC_SITE_URL}/api/posts/${post.id}/share-image`, alt: post.caption }];
  return { title, description: post.caption, alternates: { canonical: url },
    openGraph: { type: "article", title, description: post.caption, url, siteName: "The Humour Project", images },
    twitter: { card: "summary_large_image", title, description: post.caption, images },
  };
}

export default async function PublicPostPage({ params }: Props) {
  const { id } = await params;
  const post = await getPublicPost(id);
  if (!post) notFound();
  const supabase = createClient(await cookies());
  const [{ data: { user } }, { data: image }, votes] = await Promise.all([
    supabase.auth.getUser(),
    supabase.storage.from("post-images").createSignedUrl(post.image_path, 60 * 60),
    getPostVotes(supabase, [post.id]),
  ]);
  const stats = votes?.get(post.id);
  return (
    <main className="comic-page">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <Link href="/#community-feed" className="self-start text-sm font-bold underline underline-offset-4 hover:text-muted">← Community feed</Link>
        <article id={`post-${post.id}`} className="comic-panel overflow-hidden">
          {image?.signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image.signedUrl} alt="Meme image" className="max-h-[65svh] w-full bg-pink-light object-contain" />
          ) : <p className="bg-pink-light p-8 text-center text-muted">Image unavailable. Refresh to try again.</p>}
          <div className="space-y-4 border-t-2 border-ink p-5 sm:p-6">
            <AuthorProfilePopover authorId={post.user_id} authorName={post.author_name} />
            <h1 className="comic-caption">{post.caption}</h1>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <VoteButtons postId={post.id} initialScore={Number(stats?.score ?? 0)} initialVote={stats?.user_vote ?? 0} available={Boolean(stats)} isSignedIn={Boolean(user)} returnTo={`/posts/${post.id}`} />
              <SharePostButton postId={post.id} />
            </div>
            <time dateTime={post.created_at} className="block text-xs text-muted">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(new Date(post.created_at))}</time>
          </div>
        </article>
        <div className="comic-panel space-y-3 bg-green-light p-5">
          <h2 className="comic-heading text-2xl">Got a punchline of your own?</h2>
          <p className="text-sm text-muted">Choose a template and find your favorite AI caption.</p>
          <Link href={user ? "/generate" : "/try"} className="comic-button">Create a meme</Link>
        </div>
      </div>
    </main>
  );
}
