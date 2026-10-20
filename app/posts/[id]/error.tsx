"use client";

import Link from "next/link";

export default function PostError({ reset }: { reset: () => void }) {
  return <main className="comic-page grid flex-1 place-items-center"><section className="comic-panel max-w-lg space-y-4 p-8 text-center">
    <h1 className="comic-heading text-3xl">Couldn’t load this meme</h1>
    <p className="text-sm text-muted">Please try again in a moment.</p>
    <button type="button" onClick={reset} className="comic-button">Try again</button>
    <Link href="/#community-feed" className="block text-sm font-bold underline underline-offset-4">Community feed</Link>
  </section></main>;
}
