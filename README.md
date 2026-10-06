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

Signed-in users can upload an image and optional context from the home page.
`POST /api/posts` validates the session, file type/signature, 5 MB size limit, and
1,000-character context limit, then uploads the image, generates a caption, and
saves the post with the caption, full persona prompt, prompt version, and model.
Generation uses one server-side OpenAI Responses API call containing the actual
image (base64 input) and optional context. The bucket remains private. If caption
generation or saving the post fails, the endpoint attempts to remove the upload.

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
and check the `posts` table and `post-images` bucket. Confirm signed-out requests
receive 401 and another user cannot read the saved row or stored image.

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
