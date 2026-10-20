import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/app/supabase/server";
import { PENDING_SHARE_COOKIE } from "@/app/trial/pending-share";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Sign out from this website to continue." }, { status: 403 });
  }
  try {
    const supabase = createClient(await cookies());
    const { error } = await supabase.auth.signOut();
    if (error) return NextResponse.json({ error: "Could not sign out. Please try again." }, { status: 500 });
    const response = NextResponse.json({ message: "Signed out." });
    response.headers.set("Cache-Control", "no-store");
    response.cookies.delete(PENDING_SHARE_COOKIE);
    // Retain the guest quota cookie: signing out clears drafts, not usage limits.
    return response;
  } catch {
    return NextResponse.json({ error: "Could not sign out. Please try again." }, { status: 500 });
  }
}
