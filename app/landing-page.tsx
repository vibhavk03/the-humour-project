import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HomeFeedSort } from "@/app/posts/feed-sort";
import { Feed } from "@/app/posts/feed";

export function LandingPage({ supabase, sort = "all" }: { supabase: SupabaseClient; sort?: HomeFeedSort }) {
  return (
    <main className="comic-page">
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <section className="comic-panel grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-center" aria-labelledby="landing-title">
          <div>
            <p className="comic-eyebrow">COLUMBIA LIFE. NYC HUMOR. POWERED BY AI.</p>
            <h1 id="landing-title" className="comic-heading mb-4 text-3xl leading-tight sm:text-5xl">TURN YOUR PHOTOS INTO FUNNY MEMES.</h1>
            <p className="max-w-2xl text-base leading-7 text-muted">Upload a photo or choose a meme template. Let AI generate funny captions inspired by life at Columbia University and in NYC. Pick your favorite and share it with the community.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 lg:flex-col lg:items-start">
            <a href="#community-feed" className="comic-button">Explore community feed <span aria-hidden="true" className="ml-2">↓</span></a>
            <Link href="/try" className="comic-button comic-button-secondary">Create a meme</Link>
          </div>
        </section>

        <section id="community-feed" aria-labelledby="community-title" className="scroll-mt-6 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="community-title" className="comic-heading text-2xl sm:text-3xl">The community feed</h2>
          </div>
          <Feed supabase={supabase} userId={null} scope="home" sort={sort} />
        </section>

        <section aria-label="How to make a meme" className="comic-panel flex flex-wrap items-center justify-between gap-5 bg-green-light p-5 sm:p-7">
          <div>
            <h2 className="comic-heading text-2xl">Your turn to bring the punchline.</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Upload a photo. Choose from AI-generated captions. Share your favorite.</p>
            <p className="mt-2 text-xs leading-5 text-muted">Nothing is posted until you choose to share. Published photos and captions are visible to everyone; optional context stays private.</p>
          </div>
          <Link href="/try" className="comic-button">Create a meme</Link>
        </section>
        <footer className="flex flex-wrap justify-between gap-3 border-t-2 border-ink-soft pt-5 font-mono text-xs text-muted">
          <span>The Humour Project</span><span>Everyone&apos;s camera roll has a story. Find the punchline.</span>
        </footer>
      </div>
    </main>
  );
}
