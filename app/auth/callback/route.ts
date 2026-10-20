import { ensureDefaultProfile } from "@/app/auth/default-profile";
import { GUEST_COOKIE, readGuestSession } from "@/app/trial/guest-session";
import { PENDING_SHARE_COOKIE, readPendingShare } from "@/app/trial/pending-share";
import { getFeedReturnPath } from "@/app/auth/return-path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/app/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const returnTo = getFeedReturnPath(requestUrl.searchParams.get("next"));
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    redirect("/");
  }

  const cookieStore = await cookies();
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

  if (!await ensureDefaultProfile(supabase, user)) {
    redirect(returnTo === "/" ? "/profile" : `/profile?next=${encodeURIComponent(returnTo)}`);
  }

  // Authentication only restores the selection; posting requires confirmation in preview.
  if (returnTo === "/try" && cookieStore.get(PENDING_SHARE_COOKIE)) {
    const pending = readPendingShare(cookieStore.get(PENDING_SHARE_COOKIE)?.value);
    const guestId = readGuestSession(cookieStore.get(GUEST_COOKIE)?.value);
    redirect(pending && guestId ? "/try/preview" : "/try?share=expired");
  }

  redirect(returnTo);
}
