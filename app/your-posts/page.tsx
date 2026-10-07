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
    <main className="min-h-screen bg-zinc-50 px-6 py-8 text-zinc-950">
      <section className="mx-auto w-full max-w-2xl space-y-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold">Your Posts</h1>
          <p className="text-base leading-7 text-zinc-600">All your saved images and captions. Your optional context is only visible here.</p>
        </div>
        {user ? <Feed supabase={supabase} userId={user.id} page={page} /> : (
          <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-600">Sign in with Google to see your posts.</p>
            <AuthControls isSignedIn={false} />
          </div>
        )}
      </section>
    </main>
  );
}
