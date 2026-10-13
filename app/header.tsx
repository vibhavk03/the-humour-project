import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "./supabase/server";
import { AccountMenu } from "./auth/account-menu";
import { AuthControls } from "./auth/auth-controls";

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
    <header className="border-b border-zinc-200 bg-white px-6 text-zinc-950">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 py-4">
        <Link href="/" className="text-sm font-semibold sm:text-base">The Humour Project</Link>
        {user ? <AccountMenu key={user.id} name={name} email={user.email ?? ""} photoUrl={photoUrl} /> : <AuthControls isSignedIn={false} />}
      </div>
    </header>
  );
}
