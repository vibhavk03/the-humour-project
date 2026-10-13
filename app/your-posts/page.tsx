import { PageIntro } from "@/app/page-intro";
import { Navigation } from "@/app/navigation";
import { cookies } from "next/headers";
import { AuthControls } from "@/app/auth/auth-controls";
import { createClient } from "@/app/supabase/server";
import { Feed } from "@/app/posts/feed";

export default async function YourPostsPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const params = await searchParams;
  const page = typeof params.page === "string" && /^[1-9]\d*$/.test(params.page)
    ? Math.min(Number(params.page), 10000) : 1;
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="comic-page">
      <section className="mx-auto w-full max-w-7xl space-y-5">
        <PageIntro title="Your Posts" eyebrow="Your personal back issues" compact>
          Your moments. Your punchlines. All your published posts in one place, with optional context just for you.
        </PageIntro>

        <Navigation />
        {user ? <Feed supabase={supabase} userId={user.id} page={page} /> : (
          <div className="comic-panel space-y-4 p-5 sm:p-7">
            <p className="text-sm text-muted">Sign in with Google to see your posts.</p>
            <AuthControls isSignedIn={false} />
          </div>
        )}
      </section>
    </main>
  );
}
