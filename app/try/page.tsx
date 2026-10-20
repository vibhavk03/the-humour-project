import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/app/supabase/server";
import { TrialExperience } from "@/app/trial/trial-experience";

export default async function TryPage({ searchParams }: { searchParams: Promise<{ share?: string | string[] }> }) {
  const shareExpired = (await searchParams).share === "expired";
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <main className="comic-page">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link href="/#community-feed" className="inline-block text-sm font-bold underline underline-offset-4 hover:text-forest">← Back to the memes</Link>
        <section aria-labelledby="trial-title">
          <p className="comic-eyebrow">A little test drive</p>
          <h1 id="trial-title" className="comic-heading mb-3 text-3xl sm:text-5xl">Pick a mood. Find the punchline.</h1>
          <p className="max-w-2xl text-base leading-7 text-muted">Choose a photo or GIF and let AI write funny captions. Pick your favorite and share it.</p>
        </section>
        <TrialExperience isSignedIn={Boolean(user)} shareExpired={shareExpired} />
      </div>
    </main>
  );
}
