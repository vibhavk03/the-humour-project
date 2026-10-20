// No paid requests or real database writes: exercise files, signatures, and API boundaries.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import ts from "typescript";
import sharp from "sharp";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const dependency = createRequire(import.meta.url);
function load(path, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(name => Object.hasOwn(imports, name) ? imports[name] : dependency(name), mod, mod.exports);
  return mod.exports;
}
const keyBefore = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = "trial-test-key";
try {
  const samples = load("app/trial/samples.ts");
  const validation = load("app/posts/upload-validation.ts");
  const files = load("app/trial/sample-files.ts", { "server-only": {}, "./samples": samples, "@/app/posts/upload-validation": validation });
  assert.ok(samples.SAMPLES.length > 0);
  const eligibleFiles = fs.readdirSync("memes").filter(filename => /\.(png|jpe?g|webp|gif)$/i.test(filename) && fs.statSync(`memes/${filename}`).size > 0 && fs.statSync(`memes/${filename}`).size <= validation.MAX_IMAGE_BYTES);
  assert.deepEqual(samples.SAMPLES.map(sample => sample.filename).sort(), eligibleFiles.sort(), "Every eligible file should be registered in the gallery");
  assert.equal(new Set(samples.SAMPLES.map(sample => sample.id)).size, samples.SAMPLES.length);
  for (const sample of samples.SAMPLES) {
    const asset = await files.readSample(sample.id);
    const metadata = await sharp(asset.bytes, { animated: true }).metadata();
    assert.equal(metadata.format, { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[sample.mimeType]);
    assert.equal(sample.animated, (metadata.pages ?? 1) > 1);
  }
  for (const id of ["../../.env.local", "crying_man.gif", "https://example.com", null]) {
    assert.equal(await files.readSample(id), null);
  }
  const { GET } = load("app/api/samples/[id]/route.ts", { "@/app/trial/sample-files": files });
  const preview = await GET(new Request("http://localhost/api/samples/dancing-cat?preview=1"), { params: Promise.resolve({ id: "dancing-cat" }) });
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("content-type"), "image/webp");
  assert.ok((await preview.arrayBuffer()).byteLength < 30000);
  const original = await GET(new Request("http://localhost/api/samples/dancing-cat"), { params: Promise.resolve({ id: "dancing-cat" }) });
  assert.equal(original.headers.get("content-type"), "image/gif");
  assert.ok((await sharp(Buffer.from(await original.arrayBuffer()), { animated: true }).metadata()).pages > 1);
  assert.equal((await GET(new Request("http://localhost/api/samples/no"), { params: Promise.resolve({ id: "no" }) })).status, 404);

  const sessions = load("app/trial/guest-session.ts", { "server-only": {} });
  const review = load("app/posts/caption-review.ts", { "server-only": {} });
  const session = sessions.createGuestSession();
  assert.equal(sessions.readGuestSession(session.token), session.id);
  assert.equal(sessions.readGuestSession(`${session.token}x`), null);
  assert.equal(sessions.readGuestSession(`${session.token}.extra`), null);
  assert.equal(sessions.readGuestSession(undefined), null);
  assert.match(sessions.guestQuotaKey(session.id), /^[0-9a-f]{64}$/);
  const now = Date.now;
  Date.now = () => now() + 25 * 60 * 60 * 1000;
  assert.equal(sessions.readGuestSession(session.token), null);
  Date.now = now;

  const { parseDraft } = load("app/trial/draft.ts", { "./samples": samples });
  const { getFeedReturnPath } = load("app/auth/return-path.ts");
  assert.equal(getFeedReturnPath("/try"), "/try");
  assert.equal(getFeedReturnPath("/generate"), "/generate");
  assert.equal(getFeedReturnPath("/generate?next=https://example.com"), "/");
  assert.equal(getFeedReturnPath("/try?next=https://example.com"), "/");
  const saved = { sampleId: "success-kid", results: { "success-kid": { choices: [{ caption: "My first joke", reviewToken: "signed-token" }], selected: "My first joke" } }, remaining: 2 };
  assert.deepEqual(parseDraft(JSON.stringify(saved)), saved);
  assert.equal(parseDraft(JSON.stringify({ ...saved, sampleId: "unknown" })), null);
  assert.equal(parseDraft(JSON.stringify({ ...saved, results: { "success-kid": { choices: [], selected: "tampered" } } })), null);
  assert.equal(parseDraft("invalid JSON"), null);

  let cookie;
  let signedIn = false;
  let quotaError = null;
  let quota = { allowed: true, reason: "reserved", remaining: 2 };
  let reserved = 0;
  let generated = 0;
  let uploads = [];
  const storedImages = new Set();
  let inserts = [];
  let removed = [];
  let saveFails = false;
  let uploadFails = false;
  let providerError = null;
  const invalidated = [];
  const savedPosts = new Map();
  let pendingCookie;
  let exchangeFails = false;
  let profileReads = 0;
  const captions = ["My budget has left the chat.", "An academic comeback in three pixels.", "Me after finding a seat in the library."];
  const generatedResult = { captions, generation_prompt: "test-prompt", prompt_version: "test-v1", model: "test-model" };
  class CaptionError extends Error { constructor(message, status, code, retryAfterSeconds) { super(message); Object.assign(this, { status, code, retryAfterSeconds }); } }
  const client = {
    rpc(name, args) {
      assert.equal(name, "reserve_guest_trial");
      assert.match(args.guest_key, /^[0-9a-f]{64}$/);
      reserved++;
      return { single: async () => ({ data: quota, error: quotaError }) };
    },
    auth: {
      getUser: async () => ({ data: { user: signedIn ? { id: "signed-in-user" } : null }, error: null }),
      exchangeCodeForSession: async () => ({ error: exchangeFails ? new Error("bad code") : null }),
    },
    storage: { from: name => {
      assert.equal(name, "post-images");
      return {
        upload: async (path, bytes, options) => {
          uploads.push({ path, bytes, options });
          if (uploadFails) return { error: new Error("upload failed") };
          if (storedImages.has(path)) return { error: { statusCode: "409" } };
          storedImages.add(path);
          return { error: null };
        },
        remove: async paths => { removed.push(...paths); paths.forEach(path => storedImages.delete(path)); return { error: null }; },
      };
    } },
    from: table => {
      if (table === "profiles") {
        profileReads++;
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { first_name: "Test", last_name: "User" }, error: null }) }) }) };
      }
      assert.equal(table, "posts");
      return {
        select() {
          let id;
          return { eq(field, value) { if (field === "id") id = value; return this; }, maybeSingle: async () => ({ data: savedPosts.get(id) ?? null, error: null }) };
        },
        insert: async row => {
          inserts.push(row);
          if (saveFails) return { error: { code: "save_failed" } };
          if (savedPosts.has(row.id)) return { error: { code: "23505" } };
          savedPosts.set(row.id, row);
          return { error: null };
        },
      };
    },
  };
  const pendingShares = load("app/trial/pending-share.ts", { "server-only": {} });
  const publishing = load("app/trial/publish-sample.ts", {
    "server-only": {},
    "next/cache": { revalidatePath: path => invalidated.push(path) },
    "@/app/posts/caption-review": review,
    "@/app/posts/upload-validation": validation,
    "./sample-files": files,
  });
  const cookieStore = {
    get(name) {
      const value = name === sessions.GUEST_COOKIE ? cookie : name === pendingShares.PENDING_SHARE_COOKIE ? pendingCookie : undefined;
      return value ? { value } : undefined;
    },
    delete(name) { if (name === pendingShares.PENDING_SHARE_COOKIE) pendingCookie = undefined; },
  };
  const trialImports = {
    "@/app/trial/settings": { SAMPLE_TRY_LIMITS_ENABLED: true },
    "next/headers": { cookies: async () => cookieStore },
    "next/cache": { revalidatePath: path => invalidated.push(path) },
    "@/app/supabase/server": { createClient: () => client },
    "@/app/posts/caption-review": review,
    "@/app/posts/generate-caption": {
      CaptionError,
      generateCaption: async (bytes, mimeType, context, previous) => {
        generated++;
        if (providerError) throw providerError;
        assert.equal(mimeType, "image/gif");
        assert.ok(bytes.length > 0);
        assert.equal(context, samples.getSample("dancing-cat").description);
        assert.deepEqual(previous, []);
        return generatedResult;
      },
    },
    "@/app/posts/upload-validation": validation,
    "@/app/trial/samples": samples,
    "@/app/trial/sample-files": files,
    "@/app/trial/guest-session": sessions,
    "@/app/trial/publish-sample": publishing,
    "@/app/trial/pending-share": pendingShares,
  };
  const { POST } = load("app/api/trial/route.ts", trialImports);
  function request(body, origin = "http://localhost") {
    return new Request("http://localhost/api/trial", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }
  const generate = { action: "generate", sampleId: "dancing-cat" };
  assert.equal((await POST(request(generate, "https://another-site.example"))).status, 403);
  assert.equal((await POST(request({ ...generate, sampleId: "../../.env.local" }))).status, 400);
  assert.equal((await POST(request({ ...generate, previousCaptions: ["x".repeat(201)] }))).status, 400);
  assert.equal(reserved, 0);
  quotaError = { code: "missing_migration" };
  assert.equal((await POST(request(generate))).status, 503);
  assert.equal(generated, 0, "Fail closed before a paid call when budget storage is missing");
  quotaError = null;
  quota = { allowed: false, reason: "daily_budget", remaining: 0 };
  const limited = await POST(request(generate));
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal(generated, 0);
  quota = { allowed: true, reason: "reserved", remaining: 2 };
  const response = await POST(request(generate));
  assert.equal(response.status, 200);
  const issued = response.cookies.get(sessions.GUEST_COOKIE);
  assert.ok(issued);
  assert.ok(response.headers.get("set-cookie").includes("HttpOnly"));
  cookie = issued.value;
  const result = await response.json();
  assert.deepEqual(result.captions, captions);
  assert.equal(result.remaining, 2);
  assert.equal(uploads.length, 0, "Review must not upload or publish");
  assert.equal(inserts.length, 0);
  const publish = { action: "publish", sampleId: "dancing-cat", caption: captions[0], reviewToken: result.reviewToken };
  assert.equal((await POST(request(publish))).status, 401);
  const prepared = await POST(request({ ...publish, action: "prepare-share" }));
  assert.equal(prepared.status, 200);
  pendingCookie = prepared.cookies.get(pendingShares.PENDING_SHARE_COOKIE).value;
  const handoff = pendingShares.readPendingShare(pendingCookie);
  assert.equal(handoff.sampleId, "dancing-cat");
  assert.equal(handoff.caption, captions[0]);
  assert.equal(handoff.reviewToken, result.reviewToken);
  assert.ok(prepared.headers.get("set-cookie").includes("HttpOnly"));
  assert.equal(uploads.length, 0, "Preparing sign-in must not publish before authentication");
  assert.equal(pendingShares.readPendingShare(`${pendingCookie}x`), null);
  const savedNow = Date.now;
  Date.now = () => savedNow() + 61 * 60 * 1000;
  assert.equal(pendingShares.readPendingShare(pendingCookie), null);
  Date.now = savedNow;
  const realPrompt = load("app/posts/caption-prompt.ts");
  const realAsset = await files.readSample("dancing-cat");
  const fullReview = review.createReview({ ...generatedResult, generation_prompt: realPrompt.CAPTION_PROMPT }, `guest:${sessions.readGuestSession(cookie)}`, realAsset.bytes, realAsset.sample.mimeType, realAsset.sample.description);
  assert.ok(pendingShares.createPendingShare("dancing-cat", captions[0], fullReview).length <= 3800, "The actual production prompt must fit in the handoff cookie");
  signedIn = true;
  assert.equal((await POST(request({ ...publish, caption: "Forged caption" }))).status, 400);
  assert.equal((await POST(request({ ...publish, sampleId: "success-kid" }))).status, 400);
  const correctCookie = cookie;
  cookie = sessions.createGuestSession().token;
  assert.equal((await POST(request(publish))).status, 400, "Review must stay bound to the original guest");
  cookie = undefined;
  assert.equal((await POST(request(publish))).status, 400);
  cookie = correctCookie;
  const reservationsBeforePublish = reserved;
  const published = await POST(request(publish));
  assert.equal(published.status, 201);
  assert.equal(generated, 1, "Publishing must not regenerate captions");
  assert.equal(reserved, reservationsBeforePublish, "Publishing uses no generation budget");
  assert.equal(inserts.at(-1).user_id, "signed-in-user");
  assert.equal(inserts.at(-1).caption, captions[0]);
  assert.equal(inserts.at(-1).context, null);
  assert.equal(uploads.at(-1).options.contentType, "image/gif");
  assert.deepEqual(uploads.at(-1).bytes, (await files.readSample("dancing-cat")).bytes);
  assert.deepEqual(invalidated, ["/", "/your-posts"]);
  const uploadsBeforeRetry = uploads.length;
  const insertsBeforeRetry = inserts.length;
  const retryResponse = await POST(request(publish));
  assert.equal(retryResponse.status, 201);
  assert.equal((await retryResponse.json()).postId, (await published.json()).postId);
  assert.equal(uploads.length, uploadsBeforeRetry);
  assert.equal(inserts.length, insertsBeforeRetry, "Repeated selection must not create another post");
  saveFails = true;
  assert.equal((await POST(request({ ...publish, caption: captions[1] }))).status, 500);
  assert.equal(removed.at(-1), uploads.at(-1).path, "Clean up the image if saving fails");
  saveFails = false;
  uploadFails = true;
  const insertsBeforeFailure = inserts.length;
  assert.equal((await POST(request({ ...publish, caption: captions[2] }))).status, 500);
  assert.equal(inserts.length, insertsBeforeFailure);
  uploadFails = false;
  class Redirect extends Error { constructor(path) { super(path); this.path = path; } }
  const profileDefaults = load("app/auth/default-profile.ts", { "server-only": {} });
  const { GET: callback } = load("app/auth/callback/route.ts", {
    "@/app/auth/default-profile": profileDefaults,
    "@/app/auth/return-path": { getFeedReturnPath },
    "next/headers": { cookies: async () => cookieStore },
    "next/navigation": { redirect: path => { throw new Redirect(path); } },
    "@/app/supabase/server": { createClient: () => client },
    "@/app/trial/guest-session": sessions,
    "@/app/trial/pending-share": pendingShares,
    "@/app/trial/publish-sample": publishing,
  });
  async function callbackPath(next = "/try", origin = "http://localhost") {
    try { await callback(new Request(`${origin}/auth/callback?code=test&next=${encodeURIComponent(next)}`)); }
    catch (error) { if (error instanceof Redirect) return error.path; throw error; }
    assert.fail("Expected OAuth redirect");
  }
  // A regular login must not consume a previously prepared trial share.
  const postsBeforeCallback = savedPosts.size;
  assert.equal(await callbackPath("/"), "/");
  assert.equal(savedPosts.size, postsBeforeCallback);
  assert.ok(pendingCookie);
  assert.equal(profileReads, 1);
  // Authentication restores the saved selection without uploading or publishing.
  pendingCookie = pendingShares.createPendingShare("dancing-cat", captions[1], result.reviewToken);
  const savedHandoff = pendingCookie;
  const uploadsBeforeLogin = uploads.length;
  assert.equal(await callbackPath(), "/try/preview");
  assert.equal(savedPosts.size, postsBeforeCallback);
  assert.equal(uploads.length, uploadsBeforeLogin);
  assert.equal(pendingCookie, savedHandoff, "Preview retains the selected meme until confirmation");
  assert.equal(profileReads, 2, "Trial sign-in initializes a default name before preview");
  assert.equal(await callbackPath("/try", "https://the-humour-project.vercel.app"), "/try/preview", "Production sign-in restores the final preview on the same site");
  assert.equal(savedPosts.size, postsBeforeCallback, "Production authentication must not publish before confirmation");
  assert.equal(pendingCookie, savedHandoff, "Production login retains the exact selected meme");
  assert.equal(await callbackPath(), "/try/preview");
  assert.equal(savedPosts.size, postsBeforeCallback, "Replayed callbacks must not publish");
  saveFails = true;
  assert.equal(await callbackPath(), "/try/preview", "Login never attempts a post even when writes would fail");
  saveFails = false;
  exchangeFails = true;
  assert.equal(await callbackPath(), "/");
  assert.equal(pendingCookie, savedHandoff, "Failed authentication never posts or discards a selection");
  exchangeFails = false;
  pendingCookie = `${savedHandoff}x`;
  assert.equal(await callbackPath(), "/try?share=expired");
  assert.equal(savedPosts.size, postsBeforeCallback);
  pendingCookie = savedHandoff;

  const navigated = [];
  const { TrialPreview } = load("app/trial/trial-preview.tsx", {
    react: { ...React, useState: initial => [initial, () => {}], useRef: initial => ({ current: initial }) },
    "next/link": ({ href, children }) => React.createElement("a", { href }, children),
    "next/navigation": { useRouter: () => ({ replace: path => navigated.push(path), refresh() {} }) },
    "./samples": samples,
  });
  const { default: PreviewPage } = load("app/try/preview/page.tsx", {
    "next/link": ({ href, children }) => React.createElement("a", { href }, children),
    "next/headers": { cookies: async () => cookieStore },
    "next/navigation": { redirect: path => { throw new Redirect(path); } },
    "@/app/supabase/server": { createClient: () => client },
    "@/app/trial/guest-session": sessions,
    "@/app/trial/pending-share": pendingShares,
    "@/app/trial/publish-sample": publishing,
    "@/app/trial/trial-preview": { TrialPreview },
  });
  const previewHtml = renderToStaticMarkup(await PreviewPage());
  assert.match(previewHtml, /aria-label="Your meme preview"/);
  assert.ok(previewHtml.includes(captions[1]));
  assert.match(previewHtml, /\/api\/samples\/dancing-cat/);
  assert.match(previewHtml, /Post to feed/);
  assert.match(previewHtml, /Back to editing/);
  assert.equal(savedPosts.size, postsBeforeCallback, "Rendering a preview must never publish");
  renderToStaticMarkup(await PreviewPage());
  assert.equal(savedPosts.size, postsBeforeCallback, "Refreshing a preview must never publish");
  pendingCookie = "invalid";
  assert.match(renderToStaticMarkup(await PreviewPage()), /This preview expired/);
  pendingCookie = savedHandoff;
  signedIn = false;
  await assert.rejects(PreviewPage(), error => error instanceof Redirect && error.path === "/try");
  signedIn = true;

  const fetchBeforePreview = global.fetch;
  let confirmationCalls = 0;
  global.fetch = async (url, options) => {
    confirmationCalls++;
    assert.equal(url, "/api/trial");
    assert.deepEqual(JSON.parse(options.body), { action: "publish", sampleId: "dancing-cat", caption: captions[1], reviewToken: result.reviewToken });
    return new Response(JSON.stringify({ postId: "confirmed-post" }), { status: 201 });
  };
  try {
    const preview = TrialPreview({ sampleId: "dancing-cat", caption: captions[1], reviewToken: result.reviewToken });
    function findButton(node) {
      if (!node || typeof node !== "object") return undefined;
      if (node.type === "button") return node;
      return React.Children.toArray(node.props?.children).map(findButton).find(Boolean);
    }
    assert.equal(confirmationCalls, 0);
    await findButton(preview).props.onClick();
    assert.equal(confirmationCalls, 1, "Only the final confirmation sends a publish request");
    assert.deepEqual(navigated, ["/#post-confirmed-post"]);
  } finally { global.fetch = fetchBeforePreview; }
  const concurrentSelection = await publishing.getTrialSelection(sessions.readGuestSession(cookie), "dancing-cat", captions[2], result.reviewToken);
  const postsBeforeConcurrent = savedPosts.size;
  const [firstId, secondId] = await Promise.all([
    publishing.publishTrialSelection(client, "signed-in-user", concurrentSelection),
    publishing.publishTrialSelection(client, "signed-in-user", concurrentSelection),
  ]);
  assert.equal(firstId, secondId);
  assert.equal(savedPosts.size, postsBeforeConcurrent + 1, "Concurrent publication creates exactly one post");
  assert.ok(storedImages.has(`signed-in-user/${firstId}.gif`), "Concurrent retries must retain the post image");

  // OAuth must wait until the selected caption has been saved by prepare-share.
  const windowBefore = global.window;
  global.window = { location: { origin: "http://localhost" } };
  const signInEvents = [];
  const { AuthControls } = load("app/auth/auth-controls.tsx", {
    react: { ...React, useState: initial => [initial, () => {}] },
    "@/app/auth/return-path": { getFeedReturnPath },
    "@/app/trial/use-trial-draft": { clearTrialDraft() {} },
    "@/app/supabase/client": { createClient: () => ({ auth: { signInWithOAuth: async options => {
      signInEvents.push("oauth");
      const destination = new URL(options.options.redirectTo);
      assert.equal(destination.origin, global.window.location.origin, "OAuth uses the current site, never a hard-coded localhost origin");
      assert.equal(destination.pathname, "/auth/callback");
      assert.equal(destination.searchParams.get("next"), "/try");
      return { error: null };
    } } }) },
  });
  try {
    let releasePreparation;
    const preparation = new Promise(resolve => { releasePreparation = resolve; });
    const auth = AuthControls({ isSignedIn: false, returnTo: "/try", beforeSignIn: async () => {
      signInEvents.push("prepare");
      await preparation;
      signInEvents.push("saved");
      return true;
    } });
    const signInButton = React.Children.toArray(auth.props.children).find(node => node.type === "button");
    const signingIn = signInButton.props.onClick();
    assert.deepEqual(signInEvents, ["prepare"]);
    releasePreparation();
    await signingIn;
    assert.deepEqual(signInEvents, ["prepare", "saved", "oauth"]);
    const blocked = AuthControls({ isSignedIn: false, beforeSignIn: async () => false });
    await React.Children.toArray(blocked.props.children).find(node => node.type === "button").props.onClick();
    assert.deepEqual(signInEvents, ["prepare", "saved", "oauth"], "Failed preparation prevents OAuth");
    for (const origin of ["https://the-humour-project.vercel.app", "https://humour-preview.vercel.app"]) {
      global.window.location.origin = origin;
      const deployedAuth = AuthControls({ isSignedIn: false, returnTo: "/try", beforeSignIn: async () => true });
      await React.Children.toArray(deployedAuth.props.children).find(node => node.type === "button").props.onClick();
    }
  } finally {
    if (windowBefore === undefined) delete global.window;
    else global.window = windowBefore;
  }
  let logoutError = false;
  let logoutCalls = 0;
  const { POST: signOut } = load("app/api/auth/signout/route.ts", {
    "next/headers": { cookies: async () => ({}) },
    "@/app/supabase/server": { createClient: () => ({ auth: { signOut: async () => {
      logoutCalls++;
      return { error: logoutError ? new Error("sign-out failed") : null };
    } } }) },
    "@/app/trial/pending-share": pendingShares,
  });
  const logoutRequest = origin => new Request("http://localhost/api/auth/signout", { method: "POST", headers: { origin } });
  assert.equal((await signOut(logoutRequest("https://another-site.example"))).status, 403);
  assert.equal(logoutCalls, 0);
  const loggedOut = await signOut(logoutRequest("http://localhost"));
  assert.equal(loggedOut.status, 200);
  assert.equal(loggedOut.cookies.get(pendingShares.PENDING_SHARE_COOKIE)?.value, "", "Sign-out removes the pending preview cookie");
  assert.equal(loggedOut.cookies.has(sessions.GUEST_COOKIE), false, "Sign-out must not reset guest usage limits");
  logoutError = true;
  const logoutFailed = await signOut(logoutRequest("http://localhost"));
  assert.equal(logoutFailed.status, 500);
  assert.equal(logoutFailed.cookies.has(pendingShares.PENDING_SHARE_COOKIE), false, "An unsuccessful sign-out retains the pending preview");

  const logoutWindowBefore = global.window;
  const logoutFetchBefore = global.fetch;
  const browserDrafts = new Map();
  const logoutNavigations = [];
  const draftEvents = [];
  global.window = {
    sessionStorage: {
      getItem: key => browserDrafts.get(key) ?? null,
      setItem: (key, value) => browserDrafts.set(key, value),
      removeItem: key => browserDrafts.delete(key),
    },
    dispatchEvent: event => { draftEvents.push(event.type); },
    location: { replace: path => logoutNavigations.push(path) },
  };
  const draftStore = load("app/trial/use-trial-draft.ts", {
    react: { useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() },
    "./draft": { DRAFT_KEY: "humour-sample-draft-v1", parseDraft },
    "./samples": samples,
  });
  const { AuthControls: LogoutControls } = load("app/auth/auth-controls.tsx", {
    react: { ...React, useState: initial => [initial, () => {}] },
    "@/app/auth/return-path": { getFeedReturnPath },
    "@/app/trial/use-trial-draft": draftStore,
    "@/app/supabase/client": { createClient: () => ({}) },
  });
  global.fetch = async (url, options) => {
    assert.equal(url, "/api/auth/signout");
    assert.equal(options.method, "POST");
    return signOut(logoutRequest("http://localhost"));
  };
  try {
    draftStore.saveTrialDraft(saved);
    assert.deepEqual(draftStore.useTrialDraft(), saved);
    const signOutButton = React.Children.toArray(LogoutControls({ isSignedIn: true }).props.children).find(node => node.type === "button");
    await signOutButton.props.onClick();
    assert.deepEqual(logoutNavigations, []);
    assert.deepEqual(draftStore.useTrialDraft(), saved, "Failed sign-out must keep the draft");
    logoutError = false;
    await signOutButton.props.onClick();
    assert.equal(browserDrafts.has("humour-sample-draft-v1"), false);
    assert.deepEqual(draftStore.useTrialDraft().results, {}, "Sign-out also clears the in-memory draft");
    assert.equal(draftStore.useTrialDraft().remaining, null);
    assert.deepEqual(logoutNavigations, ["/"]);
    assert.ok(draftEvents.includes("humour-trial-draft-change"));
  } finally {
    if (logoutWindowBefore === undefined) delete global.window;
    else global.window = logoutWindowBefore;
    global.fetch = logoutFetchBefore;
  }
  providerError = new CaptionError("Busy", 429, "rate_limited", 7);
  const busyResponse = await POST(request(generate));
  assert.equal(busyResponse.status, 429);
  assert.equal(busyResponse.headers.get("retry-after"), "7");
  const settings = load("app/trial/settings.ts");
  assert.equal(settings.SAMPLE_TRY_LIMITS_ENABLED, false);
  const { POST: unlimitedTrial } = load("app/api/trial/route.ts", { ...trialImports, "@/app/trial/settings": settings });
  providerError = null;
  quotaError = { code: "missing_migration" };
  quota = { allowed: false, reason: "session_limit", remaining: 0 };
  const reservedBeforeBypass = reserved;
  const unlimitedResponse = await unlimitedTrial(request(generate));
  assert.equal(unlimitedResponse.status, 200, "Disabled limits must not block generation even if quota is exhausted or unavailable");
  assert.equal((await unlimitedResponse.json()).remaining, null);
  assert.equal(reserved, reservedBeforeBypass, "Disabled limits must not query or consume the Supabase quota");
  console.log("Passed guest trial checks: all catalog assets valid, animated GIFs, lightweight previews, allowlisted paths, guest signatures/expiry, draft restoration, safe redirects, fail-closed budgets, no guest writes, signed caption/sample binding, authenticated publishing, original GIF storage, cleanup, signed sign-in handoff, preview after login, no publishing on render/refresh, explicit final confirmation, duplicate prevention, auth recovery, sign-out draft/preview cleanup, retained guest limits, temporary quota bypass, and provider failures.");
} finally {
  if (keyBefore === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = keyBefore;
}
