"use client";

import Link from "next/link";
import { Navigation } from "@/app/navigation";
import { useAccount } from "@/app/profile/account-provider";
import { Avatar } from "@/app/profile/avatar";

export function FeedHeader({ title, description, showCreateAction = true }: {
  title: string; description: string; showCreateAction?: boolean;
}) {
  return <AccountPageHeader title={title} description={description} firstName="Campus contributor" photoUrl={null} showCreateAction={showCreateAction} />;
}

export function AccountPageHeader({ title, description, firstName, lastName, photoUrl, showCreateAction = true }: {
  title: string; description: string; firstName: string; lastName?: string | null; photoUrl: string | null; showCreateAction?: boolean;
}) {
  const account = useAccount();
  firstName = account?.firstName ?? firstName;
  lastName = account?.lastName ?? lastName;
  photoUrl = account ? account.photoUrl : photoUrl;
  const fullName = [firstName, lastName?.trim()].filter(Boolean).join(" ");
  const initials = [firstName, lastName?.trim()].filter(Boolean).map(name => name![0]).join("").toUpperCase();
  return (
    <section aria-labelledby="feed-title" className="comic-panel space-y-5 bg-green-light p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-3">
            <Link href="/profile" aria-label={`Edit ${fullName}’s profile`} className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-ink bg-pink-light text-sm font-bold transition-shadow hover:ring-2 hover:ring-ink/20">
              <Avatar photoUrl={photoUrl} initials={initials} />
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
