import { PageIntro } from "@/app/page-intro";
import { cookies } from "next/headers";
import { Navigation } from "@/app/navigation";
import { LandingPage } from "@/app/landing-page";
import { createClient } from "@/app/supabase/server";
import { Feed } from "@/app/posts/feed";

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const params = await searchParams;
  const page = typeof params.page === "string" && /^[1-9]\d*$/.test(params.page)
    ? Math.min(Number(params.page), 10000) : 1;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <LandingPage />;

  return (
    <main className="comic-page">
      <section className="mx-auto w-full max-w-7xl space-y-5">
        <PageIntro title="Home Feed" eyebrow="The campus comic · NYC edition" compact>
          Everyone&apos;s camera roll, with a punchline.
        </PageIntro>

        <Navigation />
        <Feed supabase={supabase} userId={user.id} page={page} scope="home" />
      </section>
    </main>
  );
}
