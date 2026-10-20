# The Humour Project

Next.js 16 app using Supabase Auth, Google sign-in, a `profiles` table, and private Supabase Storage for profile photos.

## Local Environment

Create `.env.local` in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-or-anon-key
```

These values must come from the same Supabase project where you run the SQL setup.

## Supabase SQL Setup

Open the Supabase project, go to **SQL Editor**, and run the full contents of:

```txt
supabase/profiles.sql
```

That file creates:

- `public.profiles`
- an `updated_at` trigger
- an `auth.users` trigger that creates a profile row for each new user
- RLS policies for profile rows
- a private `photos` Storage bucket
- Storage policies so users can access only their own photo folder

After running the SQL, refresh Supabase's API schema cache:

```sql
select pg_notify('pgrst', 'reload schema');
```

## Image Uploads and Posts

Run `supabase/posts.sql` separately in the Supabase SQL Editor. It creates the
`posts` table, ownership-based RLS, a newest-first per-user feed index, and a private
`post-images` bucket with owner-only access. Existing profile setup is unchanged.

After running `posts.sql`, run **`supabase/shared-feed.sql`** in the SQL Editor to
enable community reads. It adds a restricted `home_feed` view, a newest-first
community index, and a storage read policy for images belonging to generated posts.
Base `posts` RLS remains owner-only so context and generation metadata stay private.
The bucket stays private, and upload/update/delete permissions remain owner-only.

The navigation below each page introduction has Home Feed (`/`), Your Posts
(`/your-posts`), and Generate (`/generate`). The top-right account menu shows the
user's name/photo and contains their email, Edit Profile, and Sign Out. Home Feed is available to everyone, including signed-out visitors, and shows everyone's
generated image-caption posts, including older generated posts, newest first.
Uploads are shared after the user selects a caption and clicks Post to feed. Guest samples are reviewed in a preview after sign-in and shared only through the final Post to feed confirmation. Your Posts shows only the
current user's uploads, including optional context and older uploads without
captions. Both feeds have 12 posts per page and one-hour signed image URLs.
Your own posts show a Delete post option on both feeds, with confirmation before
permanent deletion. `DELETE /api/posts/[id]` requires authentication and explicitly
filters by the signed-in owner in addition to posts RLS. Deletion removes the post,
cascades its hearts, attempts to remove the stored image, and invalidates both feeds.
Storage cleanup failures are logged; the post stays deleted.
New saves invalidate both feeds. Generate explains that published images, captions, and author names are
public while optional context stays private.
`POST /api/posts` validates the session, file type/signature, 5 MB size limit, and
1,000-character context limit. The default `generate` action returns three distinct
captions and a signed review token without uploading or saving a post. The review
screen lets the user select a caption or request three more, keeping earlier choices.
Each generation uses a server-side OpenAI Responses API call containing the actual
image (base64 input), optional context, and up to 60 recent choices to avoid repeats.
The `publish` action verifies the selected caption and the token's user, image,
context, and 24-hour expiry, then uploads the image and saves the selected caption,
full persona prompt, prompt version, and model. Publishing does not call OpenAI.
The bucket remains private. If saving the post fails, the upload is removed.

Add `OPENAI_API_KEY` to `.env.local` and your deployment's server environment.
Never use a `NEXT_PUBLIC_` prefix for this key. `OPENAI_CAPTION_MODEL` optionally
overrides the default `gpt-4.1-mini` with another Responses-compatible model that
accepts image inputs. Restart the development server after changing environment
variables. No new SQL is needed if `supabase/posts.sql` has already been applied;
older uploads retain null captions.

The prompt in `app/posts/caption-prompt.ts` uses Sam's Columbia/Midwest/NYC persona,
image-specific observational humor, and a limit of 25 words / 200 characters.
The form displays the latest saved caption next to its image. PNG, JPEG, and WEBP
and GIF are accepted for caption generation (up to 5 MB). Animated GIFs remain
animated in previews and feeds. Sharp converts the first frame to PNG for the
caption service, resized to at most 1536 pixels per side with a 40-megapixel decode
limit; optional context can describe action beyond that frame. Review tokens bind
to the original GIF, and publishing stores the original bytes and GIF MIME type.
The existing `post-images` bucket setup already permits GIF, so no new SQL is needed.
Requests share a 45-second
OpenAI deadline across at most three attempts. Only confirmed temporary limits
are retried, with backoff and `Retry-After` respected; delays over five seconds
are returned to the caller. Quota/billing errors are not retried. The OpenAI response uses `store: false`.
This setting does not change OpenAI's other data-retention policies.

Image moderation is not implemented. The endpoint has an explicit insertion point
after validation and before storage for a future moderation step.

To verify after applying SQL: sign in, upload an image with and without context,
from Generate. Confirm three choices appear and neither the `posts` table nor
`post-images` bucket changes before posting. Request more captions, select an
option from either batch, post it, and check the chosen caption on both feeds.
Using two accounts, confirm each sees both users' generated posts in Home Feed,
only its own posts/context in Your Posts, and cannot change another user's posts
or images. Signed-out uploads return 401. After applying `public-feed.sql`, signed-out visitors can read published posts and their images, but cannot read private context or unpublished uploads.

## Post Author Names

Run `supabase/post-authors.sql` after the profile, post, and shared-feed setup.
It adds `author_name` to `home_feed` and creates an owner-only `user_feed` view.
Both join profiles so names arrive in the same query as posts, without separate
author lookups. Full profiles and profile photos remain owner-only. Both feeds
display the author's current profile name above the caption, with a Your post
badge on the current user's cards. Missing names display Campus contributor.
Apply this migration before running the updated feed code.

Verify with two accounts: each should see the other's name on community posts,
while direct reads of the other's profile remain blocked. After applying `public-feed.sql`, signed-out users can read `home_feed` but cannot
read `user_feed`. Updating a profile name should update attribution on refresh.
The personal view must only return the signed-in user's posts and context.

## Post Hearts

Run `supabase/post-hearts.sql` after `posts.sql` and `shared-feed.sql`. It creates
`post_hearts` with one heart per user/post and ownership-based RLS, plus an RPC
returning aggregate counts and the current user's heart state. Other users' heart
rows remain private. Heart counts/buttons appear on generated posts in both feeds.
Click again to remove your heart. Signed-in users may also heart their own posts.
PUT and DELETE `/api/posts/[id]/heart` are idempotent and validate authentication
and post visibility. If the migration is missing, posts still load and hearts show
as unavailable. Verify persistence across refreshes and counts across two accounts.

## Supabase Auth Setup

In Supabase, go to **Authentication > URL Configuration**.

For local development, set:

```txt
Site URL: http://localhost:3000
Additional Redirect URLs: http://localhost:3000/auth/callback
```

For production, add your Vercel URL:

```txt
Site URL: https://your-vercel-domain.vercel.app
Additional Redirect URLs: https://your-vercel-domain.vercel.app/auth/callback
```

If you use Vercel preview or commit-specific URLs for submission, add that exact callback URL too.

## Google OAuth Setup

In Google Cloud Console:

1. Create or select a project.
2. Configure the OAuth consent screen.
3. Create an OAuth Client ID for a web application.
4. Add Supabase's Google callback URL as an authorized redirect URI.

Find that Supabase callback URL in **Supabase > Authentication > Providers > Google**. It usually looks like:

```txt
https://your-project-ref.supabase.co/auth/v1/callback
```

Then in Supabase:

1. Go to **Authentication > Providers > Google**.
2. Enable Google.
3. Paste the Google OAuth Client ID and Client Secret.
4. Save.

The app itself redirects users to:

```txt
/auth/callback
```

The callback route exchanges the OAuth code for a Supabase session and ensures the user has a default first name, then continues to the requested page or meme preview. Last name is optional.

## Run Locally

```bash
npm install
npm run dev
```

Open:

```txt
http://localhost:3000
```

## Verify

```bash
npm run lint
npm run test:captions
npm run test:public-feed
npm run test:guest-trial
npx next build --webpack
```

## Production Notes

In Vercel:

- Add the same Supabase environment variables.
- Turn off Vercel deployment protection for assignment testing.
- Add the production `/auth/callback` URL to Supabase Auth redirect URLs.
- Submit the commit-specific Vercel URL required by the assignment.

## Public Landing Feed

Run **`supabase/public-feed.sql`** in the Supabase SQL Editor **after**
`shared-feed.sql`, `post-authors.sql`, and `post-hearts.sql`. Apply this migration
before deploying the public landing feed. Re-running the older shared-feed or
post-author migrations afterward restores signed-in-only access; reapply
`public-feed.sql`, then `post-votes.sql` last if needed.

The landing page shows published community posts with Crowd Pick first and the
rest newest first. Infinite scroll loads 12 posts at a time. Guests can read the
restricted `home_feed` view, generate one-hour signed URLs for published post
images, and retrieve aggregate vote scores after `post-votes.sql` is applied.
The image bucket stays private. Base posts, optional context, generation metadata,
full profiles, unpublished images, and individual vote rows retain their access
rules. The author-profile migration separately shares only published authors'
names and current profile photos.

Clicking either vote arrow while signed out opens the “Sign in to vote on this
post” popup without changing the score. Dismiss it with the close button, Escape,
Dismiss, or the backdrop. The visitor can vote after signing in. Only authenticated
users can publish, vote, or delete their own posts, with API and RLS checks.

Verify after applying the migrations:

- Browse signed out and scroll through multiple batches; confirm images,
  captions, names, GIF animation, and scores load.
- Click either guest arrow and confirm the popup opens without writing a vote.
- Confirm signed-out callers cannot read `user_feed`, private context, drafts,
  full profiles, or individual vote rows, and vote/upload APIs return 401.
- With two accounts, confirm upvotes, downvotes, and removals persist, scores
  update, personal feeds remain owner-only, and only owners can delete posts.

## Guest Sample Trial

The landing page’s **Try it out** button opens `/try`. Guests can browse the available
approved samples from the root `memes/` folder, filter still images/GIFs, select
one, and request three real AI captions. Gallery thumbnails are lightweight WebP
first frames; the selected GIF and published post retain the original animation.
Files above the existing 5 MB image limit are excluded.
The supplied originals are unchanged. Keep `memes/` in the deployment checkout;
Next.js output tracing includes it in the sample API routes and preview page bundle.

**Sample-try limits are temporarily disabled** in `app/trial/settings.ts`.
Generation skips the quota RPC and the remaining-tries message is hidden.
Set `SAMPLE_TRY_LIMITS_ENABLED` to `true` to restore the limits below.

Before re-enabling limits, run **`supabase/guest-trial.sql`** once in the Supabase SQL Editor. The gallery needs no storage setup. The migration creates
private budget tables and a reservation RPC; it does not change post/profile
permissions. If the RPC is unavailable, generation fails closed before any LLM
request. Existing `OPENAI_API_KEY` and Supabase environment variables are reused;
no service-role key is needed.

When enabled, the defaults are three generation requests per signed, HTTP-only guest session
per UTC day and 100 across all app instances per UTC day. Reservations are atomic,
including concurrent requests, and failed provider attempts still consume a
reservation. The existing provider can retry a temporary failure up to three
times inside one generation request. Clearing a visitor cookie can reset their
session allowance but cannot bypass the shared daily cap. Direct RPC callers can
consume allowance but cannot reset counters or increase spending limits. The
shared cap limits cost; it does not provide bot detection or prevent denial of
trial availability. Adjust or disable the trial in SQL, for example:

```sql
update public.guest_trial_config
set daily_limit = 100, session_limit = 3
where id = true;
-- daily_limit = 0 disables generation while preserving browsing/review/publishing.
```

Generation accepts only server-allowlisted sample IDs and bounded caption history,
never arbitrary uploads or URLs. GIF descriptions accompany the existing
first-frame vision input. Reviews are signed, expire after 24 hours, and bind the
captions to the original sample bytes and signed guest session. Guests cannot
publish. After selecting a caption, **Sign in to preview** first sends the
selection to `POST /api/trial` with `action: "prepare-share"`. The server validates
the signed review and stores the exact sample, caption, and review in a compressed,
signed, HTTP-only cookie valid for one hour. OAuth only starts after this succeeds.
Session storage retains the gallery and choices as a recovery draft; blocked
session storage stops the handoff with an explanation.

After verified Google authentication, the callback redirects to `/try/preview`.
The preview page restores and validates the original template and selected caption
from the signed pending cookie. It shows the image/GIF, caption, public visibility
notice, and **Post to feed** / **Back to editing** controls. Neither login nor
opening/refreshing the preview publishes anything. Only the final **Post to feed**
click calls the authenticated publish API, clears the pending cookie, and opens
the feed at that post. Signed-in users also go through **Preview meme** before
this final confirmation. No additional LLM call is made when previewing/publishing.
Other sign-in flows retain their existing behavior. An expired preview offers a
return to the saved editor choices; failed publishing keeps the preview for retry.
Reviews expire after 24 hours; the preview handoff expires after one hour.

Signing out clears the saved trial choices/selection from session storage and
client memory, expires the pending preview cookie, and reloads the landing page.
The guest quota cookie and server-side usage counters remain intact, so signing
out does not reset the daily generation allowance. Failed sign-out leaves the
draft intact.

The same signed selection and account derive the same UUID post primary key.
Existing posts are returned on retry; concurrent requests share the deterministic
image path and the database primary key prevents duplicate inserts. Image cleanup
first checks for a committed post so a retry cannot remove a successful post’s image.
No additional database migration is required for this handoff/idempotency behavior.

Verify after applying the migration: open `/try` signed out, filter/paginate,
select a GIF, generate captions, select one, and click **Sign in to preview**.
After sign-in, confirm the correct template/caption appear in preview with no new
post. Refresh and confirm no post appears. Click **Post to feed** and confirm the
feed opens at exactly one new post with the same caption and animated image. Verify ownership in Your Posts. Repeated requests for the same
signed selection must return the same post ID without creating another post.
A fourth generation request in the same
UTC day should be rejected while existing choices remain usable. Test quota reset
and budget changes in a non-production database rather than resetting production
counters.

`npm run test:guest-trial` checks files, previews, signatures, draft restoration,
quotas/API errors, guest restrictions, signed selections, publishing, and cleanup
with mocked provider/database boundaries and no paid calls. On macOS with
PostgreSQL 18 installed, `sh scripts/test-guest-budget.sh` creates an isolated
temporary cluster to test migration replay, permissions, per-session/global caps,
and concurrent reservations. It never connects to the app database. Set
`TRIAL_PG_BIN` to use a different PostgreSQL installation.

## Crowd Pick

Run **`supabase/crowd-pick.sql`** after `public-feed.sql`, `post-authors.sql`, and
`post-hearts.sql`. The home feed (signed in and signed out) then pins the globally
highest-scoring published post to the first position with a **Crowd Pick**
badge. Every other post remains newest first. The winner is not repeated later
in the feed. Ties favor the newer post, then descending post ID. If no published
post has a positive net score, there is no Crowd Pick. Your Posts keeps its existing ordering.

The restricted `ranked_home_feed` view ranks all published posts before the app
loads its initial 12 posts. It exposes the existing public fields and a single
ranking flag; private context, generation metadata, full profiles, and individual
heart rows are not exposed. Until the migration is applied, the app falls back to
the ordinary newest-first public feed and logs the missing setup.

The community feed and Your Posts automatically load another 12 posts near the
bottom, with a **Load more memes** fallback and explicit retry after errors.
`/api/feed` uses a timestamp/ID cursor and excludes the initial Crowd Pick from
later batches. New posts and deletions do not shift the continuation boundary.
Votes update locally and deletions remove the card without resetting the loaded
feed. The Crowd Pick is recalculated when the feed is refreshed. No database
migration is needed for infinite scroll beyond the existing feed setup.

Run `npm run test:infinite-feed` to check cursor ordering, access controls,
automatic loading, retries, duplicate prevention, and end-of-feed behavior.

Run `sh scripts/test-crowd-pick.sh` with a local PostgreSQL 18 installation
(`TRIAL_PG_BIN` overrides its location) to verify ranking, ties, zero hearts,
public/private access, and multi-page ordering in an isolated temporary database.

## Generate: Templates or Your Own Image

Signed-in users can choose **Use a template** or **Upload your own** on `/generate`.
The template picker uses the same curated images/GIFs as the guest gallery,
with filters and eight templates per page. Selection downloads the original
asset into the existing image-review form; GIF animation is preserved. The gallery
collapses after selection and **Change template** opens it again. Switching sources
or changing images clears earlier caption choices, and changing context also
requires fresh captions. Failed template downloads cannot reuse a previous image.

**Add context (optional)** works for templates and uploads. Both use the existing
authenticated `/api/posts` generation/review/publish flow, including original image
validation, signed caption selection, private context, and publication only after
**Post to feed**. A successful post redirects to that post in the community
feed; failed posts keep the editor and selection available for retry.
Template selection does not use the guest quota API and needs
no new SQL or storage setup. Sign-in from Generate returns to Generate (including
after required profile completion).

Run `npm run test:generate` for template selection, GIF bytes, optional context,
source switching, gallery filters/pagination, and failed-download recovery checks.

## Default Name for New Accounts

Run **`supabase/default-profile-name.sql`** once after the existing profile setup.
It updates the new-user trigger so future accounts use the email username (the
part before `@`, for example `sam.student@example.com` → `sam.student`) as their
first name, with an empty optional last name, instead of importing Google names.
Existing names and profile edits are left unchanged. Fresh installations using
the current `profiles.sql` already include this default.

On sign-in, the app also fills an empty first name or missing profile row using
this default without overwriting an existing name, surname, or photo. New users
can continue directly to the feed, Generate, or saved meme preview instead of
completing a profile form. A profile persistence error offers the profile editor
as a recovery path. Names remain editable from **Account → Edit Profile**, and
both client/server validation accept an empty last name while requiring a first
name and enforcing the existing length limits.

Run `npm run test:profiles` for default initialization, preservation of edited
names, optional surname validation, and authenticated editing checks.

### Adding meme templates

Add PNG, JPG, WebP, or GIF files up to 5 MB to `memes/`. Run `npm run sync:memes` to update both galleries while the dev server is running. Sync also runs automatically with `npm run dev` and `npm run build`. Invalid or oversized files are skipped with a console message.

Optional labels and scene descriptions live in `app/trial/sample-metadata.json`; existing template IDs should stay stable so saved drafts continue to work. New files receive a filename-based label until curated metadata is added.

## Author profile popovers

Run `supabase/public-author-profiles.sql` in Supabase after `profiles.sql` and
`posts.sql`. It adds a restricted `author_profiles` view and a read policy for
only each visible author's current profile photo. Base profiles and the `photos`
bucket stay private. Published authors' names and photos are visible to guests;
users without published posts remain visible only to themselves. Removing the
last published post removes that author's public visibility for new requests.
Previously issued photo links expire after one hour.

Hover, focus, or tap a feed author's underlined name to see their name and photo.
The native popover sits above feed cards, stays inside the viewport, and closes
on Escape, outside click, scrolling, or the close button. Initials cover missing
photos, and loading failures have a retry button. Profiles load on demand and
share a five-minute in-browser cache across cards; no email or private context is
returned by `/api/authors/[id]`.

Run `npm run test:authors` for route, caching, and interaction checks. Run
`sh scripts/test-author-profiles.sh` for RLS and storage visibility checks in an
isolated temporary PostgreSQL 18 cluster (`TRIAL_PG_BIN` overrides the binaries).

## Upvotes and downvotes

**Apply `supabase/post-votes.sql` last**, after the existing `post-hearts.sql`,
`public-feed.sql`, and `crowd-pick.sql` setup, before deploying the new app.
It extends the existing `post_hearts` table in place so historical likes become
+1 upvotes. There is still one row per user/post; a vote can only be +1 or -1,
and no row means no vote. Existing owner RLS remains, with an update policy for
switching directions. The migration is safe to rerun without resetting votes.

The feed now shows an up arrow, net score (upvotes minus downvotes), and a down
arrow. From neutral, upvote sets the user’s contribution to +1 and downvote to
-1. The opposite arrow switches directly between +1 and -1. Clicking the selected
arrow again clears the vote to 0. Guests get the sign-in popup for either direction. Failures preserve the
previous score/selection, and in-flight writes disable both arrows. Changes do
not reset infinite scroll. Crowd Pick uses the highest positive net score,
then creation time and post ID for ties, and updates when the feed is refreshed.

`PUT /api/posts/[id]/vote` accepts `{ "vote": 1 }` or `{ "vote": -1 }`;
`DELETE` removes the caller's vote. User identity always comes from the session.
`get_post_votes` exposes only aggregate scores and the caller's own vote for
published posts; individual voter rows remain private. The retired `/heart`
endpoint returns 410 so older clients refresh instead of writing a second state.
If the migration has not been applied, browsing remains available but voting is
disabled. Avoid rerunning the older ranking migrations after `post-votes.sql`;
reapply `post-votes.sql` last if those migrations are replayed.

Run `npm run test:votes` for endpoint and control behavior, and
`sh scripts/test-votes.sh` for migration, RLS, score/ranking, and cascade checks in
an isolated temporary PostgreSQL 18 cluster (`TRIAL_PG_BIN` can override binaries).
