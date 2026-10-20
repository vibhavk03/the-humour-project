import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/app/supabase/server";
import { GUEST_COOKIE, readGuestSession } from "@/app/trial/guest-session";
import { PENDING_SHARE_COOKIE, readPendingShare } from "@/app/trial/pending-share";
import { getTrialSelection } from "@/app/trial/publish-sample";
import { TrialPreview } from "@/app/trial/trial-preview";

export default async function PreviewPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/try");
  const pending = readPendingShare(cookieStore.get(PENDING_SHARE_COOKIE)?.value);
  const guestId = readGuestSession(cookieStore.get(GUEST_COOKIE)?.value);
  let selection = null;
  try {
    if (pending && guestId) selection = await getTrialSelection(guestId, pending.sampleId, pending.caption, pending.reviewToken);
  } catch { /* Expired or changed selections must be reviewed again. */ }

  return (
    <main className="comic-page">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link href="/try" className="inline-block text-sm font-bold underline underline-offset-4 hover:text-forest">← Back to editing</Link>
        <div>
          <p className="comic-eyebrow">One last look</p>
          <h1 className="comic-heading text-3xl sm:text-5xl">Ready to share the laugh?</h1>
          <p className="mt-3 text-base leading-7 text-muted">Review your post below.</p>
        </div>
        {selection ? (
          <TrialPreview sampleId={selection.sample.id} caption={selection.caption} reviewToken={selection.reviewToken} />
        ) : (
          <div className="comic-panel space-y-4 p-6">
            <p role="alert" className="text-sm leading-6 text-muted">This preview expired or is no longer available. Your saved choices may still be available in the editor.</p>
            <Link href="/try" className="comic-button">Back to your meme</Link>
          </div>
        )}
      </div>
    </main>
  );
}
