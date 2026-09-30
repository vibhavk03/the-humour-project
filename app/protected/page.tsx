import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/app/supabase/server";

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
};

export default async function ProtectedPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, photo_url")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  let signedPhotoUrl: string | null = null;

  if (profile?.photo_url) {
    const { data } = await supabase.storage
      .from("photos")
      .createSignedUrl(profile.photo_url, 60 * 60);

    signedPhotoUrl = data?.signedUrl ?? null;
  }

  const fullName =
    profile?.first_name || profile?.last_name
      ? `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim()
      : "Profile incomplete";

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-950">
      <section className="mx-auto w-full max-w-2xl space-y-6">
        <nav className="flex items-center justify-between">
          <Link
            href="/"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-950"
          >
            The Humour Project
          </Link>
          <Link
            href="/profile"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100"
          >
            Edit Profile
          </Link>
        </nav>

        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-normal">
            Protected Page
          </h1>
          <p className="text-base leading-7 text-zinc-600">
            This page only renders for signed-in users.
          </p>
        </div>

        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 text-sm text-zinc-500">
              {signedPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={signedPhotoUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                "No photo"
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xl font-semibold">{fullName}</p>
              <p className="truncate text-sm text-zinc-500">{user.email}</p>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
