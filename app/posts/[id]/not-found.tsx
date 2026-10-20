import Link from "next/link";

export default function PostNotFound() {
  return <main className="comic-page grid flex-1 place-items-center"><section className="comic-panel max-w-lg space-y-4 p-8 text-center">
    <h1 className="comic-heading text-3xl">This meme is no longer available</h1>
    <p className="text-sm text-muted">It may have been removed, or the link may be incorrect.</p>
    <Link href="/#community-feed" className="comic-button">Browse the community feed</Link>
  </section></main>;
}
