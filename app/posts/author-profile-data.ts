export type AuthorProfile = { name: string; photoUrl: string | null };

// Repeated posts by one author share a request. Failures can be retried.
const profiles = new Map<string, { expires: number; result: Promise<AuthorProfile> }>();
export function loadAuthorProfile(id: string): Promise<AuthorProfile> {
  const cached = profiles.get(id);
  if (cached && cached.expires > Date.now()) return cached.result;
  const entry = {
    expires: Date.now() + 5 * 60 * 1000,
    result: fetch(`/api/authors/${encodeURIComponent(id)}`, { cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Profile details are unavailable right now.");
      if (typeof data.name !== "string" || (data.photoUrl !== null && typeof data.photoUrl !== "string")) throw new Error("Profile details are unavailable right now.");
      return { name: data.name, photoUrl: data.photoUrl };
    }),
  };
  profiles.set(id, entry);
  entry.result.catch(() => { if (profiles.get(id) === entry) profiles.delete(id); });
  // Bound memory use while someone browses a long feed.
  if (profiles.size > 100) profiles.delete(profiles.keys().next().value!);
  return entry.result;
}
