import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/app/supabase/server";

const MAX_NAME_LENGTH = 80;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

function sanitizeName(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/\s+/g, " ");
}

function validateName(value: string, label: string) {
  if (!value) {
    return `${label} is required.`;
  }

  if (value.length > MAX_NAME_LENGTH) {
    return `${label} must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }

  return "";
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const formData = await request.formData();
  const firstName = sanitizeName(formData.get("first_name"));
  const lastName = sanitizeName(formData.get("last_name"));
  const firstNameError = validateName(firstName, "First name");
  const lastNameError = validateName(lastName, "Last name");

  if (firstNameError || lastNameError) {
    return NextResponse.json(
      { error: firstNameError || lastNameError },
      { status: 400 },
    );
  }

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("photo_url")
    .eq("id", user.id)
    .maybeSingle<{ photo_url: string | null }>();

  let photoUrl = existingProfile?.photo_url ?? null;
  const photo = formData.get("photo");
  const shouldDeletePhoto = formData.get("delete_photo") === "true";

  if (shouldDeletePhoto && photoUrl) {
    const { error: deleteError } = await supabase.storage
      .from("photos")
      .remove([photoUrl]);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    photoUrl = null;
  }

  if (photo instanceof File && photo.size > 0) {
    const extension = ALLOWED_PHOTO_TYPES.get(photo.type);

    if (!extension) {
      return NextResponse.json(
        { error: "Photo must be a PNG, JPG, WEBP, or GIF file." },
        { status: 400 },
      );
    }

    if (photo.size > MAX_PHOTO_BYTES) {
      return NextResponse.json(
        { error: "Photo must be 5 MB or smaller." },
        { status: 400 },
      );
    }

    const photoPath = `${user.id}/profile-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(photoPath, photo, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }

    if (photoUrl) {
      await supabase.storage.from("photos").remove([photoUrl]);
    }

    photoUrl = photoPath;
  }

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      first_name: firstName,
      last_name: lastName,
      photo_url: photoUrl,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ message: "Profile saved." });
}
