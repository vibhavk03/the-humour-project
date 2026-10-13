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
user's name/photo and contains their email, Edit Profile, and Sign Out. Home Feed is available to signed-in users and shows everyone's
generated image-caption posts, including older generated posts, newest first.
Posts are shared only after the user selects a caption and clicks Post to feed. Your Posts shows only the
current user's uploads, including optional context and older uploads without
captions. Both feeds have 12 posts per page and one-hour signed image URLs.
Your own posts show a Delete post option on both feeds, with confirmation before
permanent deletion. `DELETE /api/posts/[id]` requires authentication and explicitly
filters by the signed-in owner in addition to posts RLS. Deletion removes the post,
cascades its hearts, attempts to remove the stored image, and invalidates both feeds.
Storage cleanup failures are logged; the post stays deleted.
New saves invalidate both feeds. Generate explains that images and captions are
shared while optional context stays private.
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
are accepted for caption generation; GIFs are excluded. Requests share a 45-second
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
or images. Signed-out uploads return 401 and cannot read the shared view or images.

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

The callback route exchanges the OAuth code for a Supabase session, checks the profile row, and sends incomplete profiles to `/profile`.

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
npx next build --webpack
```

## Production Notes

In Vercel:

- Add the same Supabase environment variables.
- Turn off Vercel deployment protection for assignment testing.
- Add the production `/auth/callback` URL to Supabase Auth redirect URLs.
- Submit the commit-specific Vercel URL required by the assignment.
