import { PageIntro } from "@/app/page-intro";
import { Navigation } from "@/app/navigation";
import { cookies } from "next/headers";
import { AuthControls } from "@/app/auth/auth-controls";
import { createClient } from "@/app/supabase/server";
import { FeedHeader } from "@/app/posts/feed-header";
import { Feed } from "@/app/posts/feed";

export default async function YourPostsPage() {
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="comic-page">
      <section className="mx-auto w-full max-w-7xl space-y-5">
        {user ? (
          <FeedHeader title="Your Posts" description="Your moments. Your punchlines. All your published posts in one place, with optional context just for you." />
        ) : (
          <>
            <PageIntro title="Your Posts" eyebrow="Your personal back issues" compact>
              Your moments. Your punchlines. All your published posts in one place.
            </PageIntro>
            <Navigation />
          </>
        )}
        {user ? <Feed supabase={supabase} userId={user.id} /> : (
          <div className="comic-panel space-y-4 p-5 sm:p-7">
            <p className="text-sm text-muted">Sign in with Google to see your posts.</p>
            <AuthControls isSignedIn={false} />
          </div>
        )}
      </section>
    </main>
  );
}
