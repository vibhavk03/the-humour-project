import { PageIntro } from "@/app/page-intro";
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
      <section className="mx-auto w-full max-w-3xl space-y-6">
        <PageIntro title="Find the punchline" eyebrow="One photo. Three plot twists.">
          Choose a meme template or upload your own photo or GIF. Add context if you want, then pick your favorite AI caption.
        </PageIntro>

        <Navigation />
        {user ? <UploadForm /> : (
          <div className="comic-panel space-y-4 p-5 sm:p-7">
            <p className="text-sm text-muted">Sign in with Google to choose a meme template or upload your own image and generate captions.</p>
            <AuthControls isSignedIn={false} returnTo="/generate" />
            <p className="text-sm text-muted">Just exploring? <a href="/try" className="font-bold underline underline-offset-4">Try a sample photo or GIF</a>.</p>
          </div>
        )}
      </section>
    </main>
  );
}
