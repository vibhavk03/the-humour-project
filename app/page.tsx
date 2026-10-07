import { cookies } from "next/headers";
import Link from "next/link";
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

        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          {user ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-zinc-500">Signed in as</p>
                <p className="break-all font-medium">{user.email}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/profile"
                  className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                >
                  Edit Profile
                </Link>
                <Link
                  href="/protected"
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100"
                >
                  Protected Page
                </Link>
                <AuthControls isSignedIn />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="font-medium">You are signed out.</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Sign in with Google to browse the community feed.
                </p>
              </div>
              <AuthControls isSignedIn={false} />
            </div>
          )}
        </div>
        {user ? <Feed supabase={supabase} userId={user.id} page={page} scope="home" /> : null}
      </section>
    </main>
  );
}
