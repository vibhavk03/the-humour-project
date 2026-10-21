import { getCurrentAccount } from "./account-data";
import { getFeedReturnPath } from "@/app/auth/return-path";
import { AccountPageHeader } from "@/app/posts/feed-header";
import { redirect } from "next/navigation";
import { ProfileForm, type ProfileFormData } from "@/app/profile/profile-form";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const returnTo = getFeedReturnPath((await searchParams).next);
  const account = await getCurrentAccount();
  if (!account) redirect("/");
  const signedPhotoUrl = account.photoUrl;
  const formData: ProfileFormData = {
    firstName: account.firstName,
    lastName: account.lastName,
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
          showCreateAction={false}
        />
        <ProfileForm initialProfile={formData} returnTo={returnTo === "/" ? undefined : returnTo} />
      </section>
    </main>
  );
}
