import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export function defaultFirstName(email: string | undefined) {
  return email?.split("@")[0].replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80) || "Campus contributor";
}

export async function ensureDefaultProfile(supabase: SupabaseClient, user: Pick<User, "id" | "email">) {
  const { data: profile, error: readError } = await supabase.from("profiles")
    .select("first_name").eq("id", user.id).maybeSingle<{ first_name: string | null }>();
  if (readError) {
    console.error("Default profile lookup failed:", readError.code);
    return false;
  }
  if (profile?.first_name?.trim()) return true;
  const firstName = defaultFirstName(user.email);
  if (!profile) {
    const { error } = await supabase.from("profiles").upsert(
      { id: user.id, first_name: firstName, last_name: null },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (error) console.error("Default profile creation failed:", error.code);
    return !error;
  }
  // Do not overwrite a name edited concurrently with this sign-in.
  let update = supabase.from("profiles").update({ first_name: firstName }).eq("id", user.id);
  update = profile.first_name === null ? update.is("first_name", null) : update.eq("first_name", profile.first_name);
  const { error } = await update;
  if (error) console.error("Default profile update failed:", error.code);
  return !error;
}
