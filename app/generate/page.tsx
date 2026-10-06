import { cookies } from "next/headers";
import { AuthControls } from "@/app/auth/auth-controls";
import { createClient } from "@/app/supabase/server";
import { UploadForm } from "@/app/posts/upload-form";

export default async function GeneratePage() {
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-8 text-zinc-950">
      <section className="mx-auto w-full max-w-2xl space-y-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold">Generate a caption</h1>
          <p className="text-base leading-7 text-zinc-600">Turn dorm moments and city adventures into short, funny captions. Add an image and let us find the punchline.</p>
        </div>
        {user ? <UploadForm /> : (
          <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-600">Sign in with Google to upload an image and generate a caption.</p>
            <AuthControls isSignedIn={false} />
          </div>
        )}
      </section>
    </main>
  );
}
