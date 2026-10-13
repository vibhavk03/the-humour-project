import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "./supabase/server";
import { AccountMenu } from "./auth/account-menu";
import { AuthControls } from "./auth/auth-controls";
import { HeaderWidth } from "./header-width";

export async function Header() {
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  let name = user?.email?.split("@")[0] || "Your account";
  let photoUrl: string | null = null;
  if (user) {
    const { data: profile } = await supabase.from("profiles")
      .select("first_name, last_name, photo_url").eq("id", user.id).maybeSingle();
    const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
    if (fullName) name = fullName;
    if (profile?.photo_url) {
      const { data } = await supabase.storage.from("photos").createSignedUrl(profile.photo_url, 60 * 60);
      photoUrl = data?.signedUrl ?? null;
    }
  }

  return (
    <header className="comic-header px-6 text-ink">
      <HeaderWidth>
        <Link href="/" className="comic-brand"><span className="block">The Humour Project</span><span className="mt-1 block font-mono text-[0.6rem] font-medium tracking-[0.15em] text-muted">CAMPUS LIFE. COMIC RELIEF.</span></Link>
        {user ? <AccountMenu key={user.id} name={name} email={user.email ?? ""} photoUrl={photoUrl} /> : <AuthControls isSignedIn={false} />}
      </HeaderWidth>
    </header>
  );
}
