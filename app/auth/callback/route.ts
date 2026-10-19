import { getFeedReturnPath } from "@/app/auth/return-path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/app/supabase/server";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.first_name || !profile?.last_name) {
    redirect(returnTo === "/" ? "/profile" : `/profile?next=${encodeURIComponent(returnTo)}`);
  }

  redirect(returnTo);
}
