import { AuthControls } from "@/app/auth/auth-controls";

const steps = [
  { number: "01", title: "Upload a photo", description: "Campus life, city adventures, everyday chaos. Add a little context if you want." },
  { number: "02", title: "Find the punchline", description: "Get three AI-generated captions. Want another angle? Generate a few more." },
  { number: "03", title: "Choose and share", description: "Pick your favorite, then post it to the community feed. You make the final call." },
];

function SampleComic() {
  return (
    <figure className="landing-example comic-panel">
      <div className="flex items-center justify-between gap-3 border-b-2 border-ink px-5 py-3">
        <span className="font-mono text-xs font-bold uppercase tracking-wider">An everyday plot twist</span>
        <span className="comic-stamp">Example comic</span>
      </div>
      <div className="landing-illustration">
        <svg viewBox="0 0 520 300" role="img" aria-label="Comic illustration of a takeaway coffee beside a stack of textbooks on a study desk" className="block h-auto w-full">
          <defs>
            <pattern id="desk-dots" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#660033" opacity=".12" /></pattern>
          </defs>
          <path fill="#eaf3dc" d="M0 0h520v300H0z" />
          <path fill="url(#desk-dots)" d="M0 0h520v300H0z" />
          <circle cx="400" cy="80" r="59" fill="#e673ac" opacity=".45" />
          <path d="M0 239h520v61H0z" fill="#ecd5b9" />
          <path d="M0 239h520" stroke="#660033" strokeWidth="3" />
          <g stroke="#660033" strokeWidth="3" strokeLinejoin="round">
            <path d="m62 206 220-8 16 32-222 8z" fill="#e673ac" />
            <path d="m76 216 208-8 8 14-212 9z" fill="#fff8ed" />
            <path d="m75 166 204 9-5 32-204-9z" fill="#469110" />
            <path d="m82 177 196 8-2 14-196-8z" fill="#fff8ed" />
            <path d="m100 137 189-9 9 35-189 9z" fill="#fff8ed" />
            <path d="m109 148 183-9" fill="none" />
            <path d="m116 160 176-9" fill="none" opacity=".4" />
            <path d="m328 125 20 112h78l20-112z" fill="#fffdfa" />
            <path d="m336 160 10 53h82l9-53z" fill="#e673ac" />
            <rect x="322" y="113" width="130" height="15" rx="4" fill="#660033" />
            <path d="m335 113 6-12h91l8 12z" fill="#fff8ed" />
            <path d="M366 80c-18-16 18-21 0-40M399 80c-18-16 18-21 0-40" fill="none" strokeLinecap="round" />
            <path d="m366 187 12-11 10 9 13-10" fill="none" strokeLinecap="round" />
            <path d="m148 253 106-4 2 10-106 4z" fill="#00520a" />
            <path d="m148 253-13 6 13 4z" fill="#fff8ed" />
          </g>
          <text x="89" y="196" fill="#00520a" fontFamily="monospace" fontWeight="bold" fontSize="12" transform="rotate(3 89 196)">REQUIRED READING</text>
          <text x="46" y="59" fill="#660033" fontFamily="monospace" fontWeight="bold" fontSize="13">MIDTERM FUEL.</text>
          <path d="M92 72q-13 24 4 49m-11-4 11 4 3-12" fill="none" stroke="#660033" strokeWidth="2" />
        </svg>
      </div>
      <figcaption className="border-t-2 border-ink p-5 sm:p-6">
        <p className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-muted">The punchline ↓</p>
        <blockquote className="text-xl font-bold leading-snug sm:text-2xl">“This latte and my degree have the same financing plan.”</blockquote>
        <p className="mt-4 text-xs text-muted">Illustrative example. Your photo, your choice of caption.</p>
      </figcaption>
    </figure>
  );
}

export function LandingPage() {
  return (
    <main className="comic-page landing-page">
      <div className="mx-auto w-full max-w-7xl">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div>
            <p className="comic-eyebrow">Campus life. Comic relief. NYC edition.</p>
            <h1 id="landing-title" className="comic-heading landing-title">Your camera roll.<br /><span>Campus comic relief.</span></h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-muted sm:text-lg sm:leading-8">Turn everyday photos into funny AI-generated captions. Pick your favorite and share it with the campus community.</p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-5">
              <AuthControls isSignedIn={false} signInLabel="Continue with Google" />
              <a href="#how-it-works" className="text-sm font-bold underline decoration-2 underline-offset-4">See how it works <span aria-hidden="true">↓</span></a>
            </div>
            <p className="mt-4 text-sm text-muted">Sign in to create captions and browse the community.</p>
          </div>
          <SampleComic />
        </section>

        <section id="how-it-works" className="landing-how" aria-labelledby="how-title">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
            <h2 id="how-title" className="comic-heading text-3xl sm:text-4xl">One photo. Three plot twists.</h2>
            <p className="font-mono text-xs font-bold uppercase tracking-wider text-muted">From camera roll to comic relief</p>
          </div>
          <ol className="grid gap-5 md:grid-cols-3">
            {steps.map((step) => (
              <li key={step.number} className="comic-panel landing-step p-6">
                <span className="landing-step-number comic-heading" aria-hidden="true">{step.number}</span>
                <h3 className="mt-4 text-xl font-extrabold">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted">{step.description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-community comic-panel" aria-labelledby="community-title">
          <div>
            <p className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-forest">A little shared comic relief</p>
            <h2 id="community-title" className="comic-heading text-3xl sm:text-4xl">Same campus. Different punchlines.</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted">Explore everyone&apos;s everyday moments in the community feed. Heart your favorites, share your own, and find the funny between classes.</p>
          </div>
          <div className="landing-sharing-note">
            <span className="comic-stamp">You choose what goes live</span>
            <p className="mt-3 text-sm leading-6">Your photo and chosen caption are shared when you click Post to feed. Optional context stays private.</p>
          </div>
        </section>
        <footer className="mt-10 flex flex-wrap justify-between gap-3 border-t-2 border-ink-soft pt-5 font-mono text-xs text-muted">
          <span>The Humour Project</span><span>Everyone&apos;s camera roll has a story. Find the punchline.</span>
        </footer>
      </div>
    </main>
  );
}
