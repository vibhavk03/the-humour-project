import { isHomeFeedSort } from "@/app/posts/feed-sort";
import { cookies } from "next/headers";
import { LandingPage } from "@/app/landing-page";
import { createClient } from "@/app/supabase/server";
import { Feed } from "@/app/posts/feed";
import { FeedHeader } from "@/app/posts/feed-header";

export default async function Page({ searchParams }: { searchParams: Promise<{ sort?: string | string[] }> }) {
  const params = await searchParams;
  const sort = isHomeFeedSort(params.sort) ? params.sort : "all";
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <LandingPage supabase={supabase} sort={sort} />;

  return (
    <main className="comic-page">
      <section className="mx-auto w-full max-w-7xl space-y-5">
        <FeedHeader title="Home Feed" description="Explore the latest posts from the community. Upload a photo or choose a meme template, then generate funny captions with AI. Pick your favorite and post it to the feed!" />
        <div id="community-feed" className="scroll-mt-6">
          <Feed supabase={supabase} userId={user.id} scope="home" sort={sort} />
        </div>
      </section>
    </main>
  );
}
