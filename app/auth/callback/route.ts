import { ensureDefaultProfile } from "@/app/auth/default-profile";
import { GUEST_COOKIE, readGuestSession } from "@/app/trial/guest-session";
import { PENDING_SHARE_COOKIE, readPendingShare } from "@/app/trial/pending-share";
import { getFeedReturnPath } from "@/app/auth/return-path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/app/supabase/server";
import { revalidatePath } from "next/cache";
import { applyPendingVote, PENDING_VOTE_COOKIE, readPendingVote } from "@/app/auth/pending-vote";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const returnTo = getFeedReturnPath(requestUrl.searchParams.get("next"));
  const code = requestUrl.searchParams.get("code");
  const cookieStore = await cookies();
  const pendingVote = readPendingVote(cookieStore.get(PENDING_VOTE_COOKIE)?.value);
  // Every callback consumes the cookie. Only the sign-in that prepared it may apply it.
  if (cookieStore.get(PENDING_VOTE_COOKIE)) cookieStore.delete(PENDING_VOTE_COOKIE);

  if (!code) {
    redirect("/");
  }

  const supabase = createClient(cookieStore);
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    redirect("/");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  let voteDestination: string | null = null;
  if (pendingVote && pendingVote.id === requestUrl.searchParams.get("voteIntent")) {
    const result = await applyPendingVote(supabase, user.id, pendingVote);
    if (result === "saved") {
      revalidatePath("/");
      revalidatePath("/your-posts");
      revalidatePath(`/posts/${pendingVote.postId}`);
      voteDestination = pendingVote.returnTo;
    } else {
      voteDestination = `/posts/${pendingVote.postId}${result === "failed" ? `?voteRetry=${pendingVote.vote}` : ""}`;
    }
  }

  if (!await ensureDefaultProfile(supabase, user)) {
    const next = voteDestination && !voteDestination.includes("?") ? voteDestination : returnTo;
    redirect(next === "/" ? "/profile" : `/profile?next=${encodeURIComponent(next)}`);
  }

  if (voteDestination) redirect(voteDestination);

  // Authentication only restores the selection; posting requires confirmation in preview.
  if (returnTo === "/try" && cookieStore.get(PENDING_SHARE_COOKIE)) {
    const pending = readPendingShare(cookieStore.get(PENDING_SHARE_COOKIE)?.value);
    const guestId = readGuestSession(cookieStore.get(GUEST_COOKIE)?.value);
    redirect(pending && guestId ? "/try/preview" : "/try?share=expired");
  }

  redirect(returnTo);
}
