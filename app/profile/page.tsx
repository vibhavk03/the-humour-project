import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/app/supabase/server";
import { ProfileForm, type ProfileFormData } from "@/app/profile/profile-form";

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
};

export default async function ProfilePage() {
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

  const formData: ProfileFormData = {
    firstName: profile?.first_name ?? "",
    lastName: profile?.last_name ?? "",
    signedPhotoUrl,
  };

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-950">
      <section className="mx-auto w-full max-w-2xl space-y-6">
        <nav className="flex items-center justify-between">
          <Link href="/" className="text-sm font-medium text-zinc-600 hover:text-zinc-950">
            The Humour Project
          </Link>
          <span className="text-sm text-zinc-500">{user.email}</span>
        </nav>

        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-normal">Profile</h1>
          <p className="text-base leading-7 text-zinc-600">
            Add your first and last name. A profile photo is optional and stays
            in private Supabase Storage.
          </p>
        </div>

        <ProfileForm initialProfile={formData} />
      </section>
    </main>
  );
}
