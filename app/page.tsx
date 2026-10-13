import { cookies } from "next/headers";
import { Navigation } from "@/app/navigation";
import { AuthControls } from "@/app/auth/auth-controls";
import { createClient } from "@/app/supabase/server";
import { Feed } from "@/app/posts/feed";

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const params = await searchParams;
  const page = typeof params.page === "string" && /^[1-9]\d*$/.test(params.page)
    ? Math.min(Number(params.page), 10000) : 1;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-8 text-zinc-950">
      <section className="mx-auto w-full max-w-2xl space-y-8">
        <div className="space-y-3">
          <p className="text-sm font-medium text-zinc-500">
            The Humour Project
          </p>
          <h1 className="text-3xl font-semibold tracking-normal">
            Home Feed
          </h1>
          <p className="text-base leading-7 text-zinc-600">
            Everyone&apos;s camera roll, with a punchline. Browse the community&apos;s generated images and captions, newest first.
          </p>
        </div>

        <Navigation />
        {!user ? (
          <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-600">Sign in with Google to browse the community feed.</p>
            <AuthControls isSignedIn={false} />
          </div>
        ) : null}
        {user ? <Feed supabase={supabase} userId={user.id} page={page} scope="home" /> : null}
      </section>
    </main>
  );
}
