import Link from "next/link";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { Navigation } from "@/app/navigation";
import { defaultFirstName } from "@/app/auth/default-profile";

export async function FeedHeader({ supabase, user, title, description, showCreateAction = true }: {
  supabase: SupabaseClient; user: Pick<User, "id" | "email">; title: string; description: string; showCreateAction?: boolean;
}) {
  const { data: profile } = await supabase.from("profiles")
    .select("first_name, last_name, photo_url").eq("id", user.id)
    .maybeSingle<{ first_name: string | null; last_name: string | null; photo_url: string | null }>();
  const firstName = profile?.first_name?.trim() || defaultFirstName(user.email);
  let photoUrl: string | null = null;
  if (profile?.photo_url?.startsWith(`${user.id}/`)) {
    const { data } = await supabase.storage.from("photos").createSignedUrl(profile.photo_url, 60 * 60);
    photoUrl = data?.signedUrl ?? null;
  }

  return <AccountPageHeader title={title} description={description} firstName={firstName} lastName={profile?.last_name} photoUrl={photoUrl} showCreateAction={showCreateAction} />;
}

export function AccountPageHeader({ title, description, firstName, lastName, photoUrl, showCreateAction = true }: {
  title: string; description: string; firstName: string; lastName?: string | null; photoUrl: string | null; showCreateAction?: boolean;
}) {
  const fullName = [firstName, lastName?.trim()].filter(Boolean).join(" ");
  const initials = [firstName, lastName?.trim()].filter(Boolean).map(name => name![0]).join("").toUpperCase();
  return (
    <section aria-labelledby="feed-title" className="comic-panel space-y-5 bg-green-light p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-3">
            <Link href="/profile" aria-label={`Edit ${fullName}’s profile`} className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-ink bg-pink-light text-sm font-bold transition-shadow hover:ring-2 hover:ring-ink/20">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="" width={40} height={40} className="h-full w-full object-cover" />
              ) : <span aria-hidden="true">{initials}</span>}
            </Link>
            <p className="min-w-0 break-words text-sm font-bold text-forest">Hey, {firstName} <span aria-hidden="true">👋</span></p>
          </div>
          <h1 id="feed-title" className="comic-heading text-3xl sm:text-4xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>
        </div>
        {showCreateAction ? <Link href="/generate" className="comic-button shrink-0 self-start sm:self-center">Create a meme</Link> : null}
      </div>
      <Navigation embedded showCreate={false} />
    </section>
  );
}
