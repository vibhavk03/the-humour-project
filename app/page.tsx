import { PageIntro } from "@/app/page-intro";
import { cookies } from "next/headers";
import { Navigation } from "@/app/navigation";
import { LandingPage } from "@/app/landing-page";
import { createClient } from "@/app/supabase/server";
import { Feed } from "@/app/posts/feed";

export default async function Page() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <LandingPage supabase={supabase} />;

  return (
    <main className="comic-page">
      <section className="mx-auto w-full max-w-7xl space-y-5">
        <PageIntro title="Home Feed" eyebrow="The campus comic · NYC edition" compact>
          Everyone&apos;s camera roll, with a punchline.
        </PageIntro>

        <Navigation />
        <div id="community-feed" className="scroll-mt-6">
          <Feed supabase={supabase} userId={user.id} scope="home" />
        </div>
      </section>
    </main>
  );
}
