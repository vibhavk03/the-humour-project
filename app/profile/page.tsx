import { defaultFirstName } from "@/app/auth/default-profile";
import { getFeedReturnPath } from "@/app/auth/return-path";
import { AccountPageHeader } from "@/app/posts/feed-header";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/app/supabase/server";
import { ProfileForm, type ProfileFormData } from "@/app/profile/profile-form";

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
};

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const returnTo = getFeedReturnPath((await searchParams).next);
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
    firstName: profile?.first_name?.trim() || defaultFirstName(user.email),
    lastName: profile?.last_name ?? "",
    signedPhotoUrl,
  };

  return (
    <main className="comic-page">
      <section className="mx-auto w-full max-w-7xl space-y-5">
        <AccountPageHeader
          title="Your Profile"
          description="Update your name and profile photo."
          firstName={formData.firstName}
          lastName={formData.lastName}
          photoUrl={signedPhotoUrl}
        />
        <ProfileForm initialProfile={formData} returnTo={returnTo === "/" ? undefined : returnTo} />
      </section>
    </main>
  );
}
