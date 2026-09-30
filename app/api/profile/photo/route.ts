import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/app/supabase/server";

export async function DELETE() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("photo_url")
    .eq("id", user.id)
    .maybeSingle<{ photo_url: string | null }>();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  if (profile?.photo_url) {
    const { error: deleteError } = await supabase.storage
      .from("photos")
      .remove([profile.photo_url]);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      photo_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ message: "Photo deleted." });
}
