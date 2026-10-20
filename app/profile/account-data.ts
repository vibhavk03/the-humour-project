import "server-only";
import { cache } from "react";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/app/supabase/server";
import { defaultFirstName } from "@/app/auth/default-profile";
import type { AccountProfile } from "./account-provider";

export function avatarVersion(path: string) {
  return createHash("sha256").update(path).digest("hex").slice(0, 24);
}

export function avatarUrl(userId: string, path: string | null | undefined) {
  return path?.startsWith(`${userId}/`)
    ? `/api/profile/avatar?user=${encodeURIComponent(userId)}&v=${avatarVersion(path)}`
    : null;
}

// React cache only deduplicates within a request, never between accounts.
export const getCurrentAccount = cache(async (): Promise<AccountProfile | null> => {
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles")
    .select("first_name, last_name, photo_url").eq("id", user.id)
    .maybeSingle<{ first_name: string | null; last_name: string | null; photo_url: string | null }>();
  return {
    id: user.id, email: user.email ?? "",
    firstName: profile?.first_name?.trim() || defaultFirstName(user.email),
    lastName: profile?.last_name?.trim() || "",
    photoUrl: avatarUrl(user.id, profile?.photo_url),
  };
});
