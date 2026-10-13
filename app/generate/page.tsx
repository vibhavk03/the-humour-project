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
          Upload a photo. Choose from three captions. Post your favorite.
        </PageIntro>

        <Navigation />
        {user ? <UploadForm /> : (
          <div className="comic-panel space-y-4 p-5 sm:p-7">
            <p className="text-sm text-muted">Sign in with Google to upload an image and generate a caption.</p>
            <AuthControls isSignedIn={false} />
          </div>
        )}
      </section>
    </main>
  );
}
