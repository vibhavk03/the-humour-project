import { FeedHeader } from "@/app/posts/feed-header";
import { Navigation } from "@/app/navigation";
import { cookies } from "next/headers";
import { AuthControls } from "@/app/auth/auth-controls";
import { createClient } from "@/app/supabase/server";
import { UploadForm } from "@/app/posts/upload-form";

export default async function GeneratePage() {
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="comic-page">
      <section className="mx-auto w-full max-w-7xl space-y-5">
        {user ? (
          <FeedHeader
            supabase={supabase}
            user={user}
            title="Find the punchline"
            description="Choose a meme template or upload your own photo or GIF. Add context if you want, then pick your favorite AI caption."
            showCreateAction={false}
          />
        ) : (
          <section aria-labelledby="generate-title" className="comic-panel space-y-5 bg-green-light p-5 sm:p-6">
            <div>
              <h1 id="generate-title" className="comic-heading text-3xl sm:text-4xl">Find the punchline</h1>
              <p className="mt-2 text-sm leading-6 text-muted">Choose a meme template or upload your own photo or GIF. Add context if you want, then pick your favorite AI caption.</p>
            </div>
            <Navigation embedded showCreate={false} />
          </section>
        )}
        <div className="w-full">
          {user ? <UploadForm /> : (
            <div className="comic-panel space-y-4 p-5 sm:p-7">
              <p className="text-sm text-muted">Sign in with Google to choose a meme template or upload your own image and generate captions.</p>
              <AuthControls isSignedIn={false} returnTo="/generate" />
              <p className="text-sm text-muted">Just exploring? <a href="/try" className="font-bold underline underline-offset-4">Try a sample photo or GIF</a>.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
