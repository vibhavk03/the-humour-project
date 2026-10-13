// Run the server modules with mocked network/storage boundaries; no API key or paid calls needed.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import ts from "typescript";

const loadDependency = createRequire(import.meta.url);

function load(path, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", code)(
    name => Object.hasOwn(imports, name) ? imports[name] : loadDependency(name), compiledModule, compiledModule.exports,
  );
  return compiledModule.exports;
}

const prompt = load("app/posts/caption-prompt.ts");
const service = load("app/posts/generate-caption.ts", {
  "server-only": {}, "./caption-prompt": prompt,
});
const review = load("app/posts/caption-review.ts", { "server-only": {} });
const validation = load("app/posts/upload-validation.ts");
const heartData = load("app/posts/heart-data.ts", { "server-only": {} });
const { getUserFeed, getHomeFeed } = load("app/posts/feed-data.ts", { "server-only": {}, "./heart-data": heartData });
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const caption = "This latte and my degree have the same financing plan.";
const captions = [caption, "My coffee has a better financial aid package than I do.", "Studying the receipt counts as economics homework."];
const originalFetch = global.fetch;
const originalKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.OPENAI_CAPTION_MODEL;
let calls = 0;
let payload;
let providerStatus = 200;
let providerBody;
let providerHeaders = {};
let recoverAfterCall = null;
let fetchError;
global.fetch = async (url, options) => {
  calls++;
  assert.equal(url, "https://api.openai.com/v1/responses");
  assert.equal(options.headers.Authorization, "Bearer test-key");
  payload = JSON.parse(options.body);
  if (fetchError) throw fetchError;
  if (recoverAfterCall !== null && calls > recoverAfterCall) {
    return new Response(JSON.stringify(completed()), { status: 200 });
  }
  return new Response(JSON.stringify(providerBody), { status: providerStatus, headers: providerHeaders });
};

let signedIn = true;
let uploadFails = false;
let saveFails = false;
let uploaded = 0;
let removed = 0;
let inserted;
const client = {
  auth: { getUser: async () => ({ data: { user: signedIn ? { id: "test-user" } : null }, error: null }) },
  storage: { from: () => ({
    upload: async () => { uploaded++; return { error: uploadFails ? new Error("test upload failure") : null }; },
    remove: async () => { removed++; return { error: null }; },
  }) },
  from: () => ({ insert: row => {
    inserted = row;
    return { select: () => ({ single: async () => ({
      data: saveFails ? null : { id: row.id, caption: row.caption, context: row.context },
      error: saveFails ? new Error("test save failure") : null,
    }) }) };
  } }),
};
const { POST } = load("app/api/posts/route.ts", {
  "next/headers": { cookies: async () => ({}) },
  "next/cache": { revalidatePath: () => {} },
  "@/app/supabase/server": { createClient: () => client },
  "@/app/posts/generate-caption": service,
  "@/app/posts/caption-review": review,
  "@/app/posts/upload-validation": validation,
});
function request(context, fields = {}) {
  const body = new FormData();
  body.set("image", new File([png], "photo.png", { type: "image/png" }));
  if (context !== undefined) body.set("context", context);
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return new Request("http://localhost/api/posts", { method: "POST", body });
}
function completed(text = JSON.stringify({ captions })) {
  return { status: "completed", model: "gpt-4.1-mini-test-snapshot", output: [
    { type: "message", content: [{ type: "output_text", text }] },
  ] };
}

async function run() {
  const deletePostId = "12345678-1234-1234-1234-123456789012";
  let deleteUser = "owner";
  let existingPost = { id: deletePostId, user_id: "owner", image_path: "owner/photo.png" };
  let deleteFails = false;
  let cleanupFails = false;
  let deletedImages = [];
  const invalidated = [];
  const deleteClient = {
    auth: { getUser: async () => ({ data: { user: deleteUser ? { id: deleteUser } : null }, error: null }) },
    from: table => {
      assert.equal(table, "posts", "Deletion must use the owner-protected table");
      const filters = {};
      return { delete: () => ({
        eq(field, value) { filters[field] = value; return this; },
        select(fields) {
          assert.equal(fields, "id, image_path");
          return { maybeSingle: async () => {
            if (deleteFails) return { data: null, error: { code: "test_delete_failure" } };
            if (!existingPost || filters.id !== existingPost.id || filters.user_id !== existingPost.user_id) return { data: null, error: null };
            const data = existingPost;
            existingPost = null;
            return { data, error: null };
          } };
        },
      }) };
    },
    storage: { from: bucket => {
      assert.equal(bucket, "post-images");
      return { remove: async paths => {
        assert.equal(existingPost, null, "Delete the post before its image");
        deletedImages.push(...paths);
        return { error: cleanupFails ? { name: "test_cleanup_failure" } : null };
      } };
    } },
  };
  const { DELETE: deletePost } = load("app/api/posts/[id]/route.ts", {
    "next/headers": { cookies: async () => ({}) },
    "next/cache": { revalidatePath: path => invalidated.push(path) },
    "@/app/supabase/server": { createClient: () => deleteClient },
  });
  const deleteRequest = id => deletePost(new Request(`http://localhost/api/posts/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id }) });
  deleteUser = null;
  assert.equal((await deleteRequest(deletePostId)).status, 401);
  deleteUser = "owner";
  assert.equal((await deleteRequest("invalid-id")).status, 400);
  deleteUser = "another-user";
  assert.equal((await deleteRequest(deletePostId)).status, 404);
  assert.ok(existingPost, "Another user cannot delete the post");
  assert.deepEqual(deletedImages, []);
  deleteUser = "owner";
  deleteFails = true;
  assert.equal((await deleteRequest(deletePostId)).status, 500);
  assert.ok(existingPost);
  assert.deepEqual(deletedImages, [], "Failed deletion must leave the image intact");
  deleteFails = false;
  assert.equal((await deleteRequest(deletePostId)).status, 200);
  assert.equal(existingPost, null);
  assert.deepEqual(deletedImages, ["owner/photo.png"]);
  assert.deepEqual(invalidated, ["/", "/your-posts"]);
  assert.equal((await deleteRequest(deletePostId)).status, 404);
  assert.equal(deletedImages.length, 1);
  existingPost = { id: deletePostId, user_id: "owner", image_path: "owner/second.png" };
  cleanupFails = true;
  assert.equal((await deleteRequest(deletePostId)).status, 200, "Storage cleanup failure must not resurrect a deleted post");
  assert.equal(existingPost, null);
  console.log("Passed deletion checks: sign-in, valid IDs, ownership, missing posts, database failure, image cleanup, cleanup failure, and feed invalidation.");

  const heartPostId = "12345678-1234-1234-1234-123456789012";
  let heartUser = "user-a";
  let heartVisible = true;
  let heartWriteFails = false;
  const voters = new Set();
  const heartClient = {
    auth: { getUser: async () => ({ data: { user: heartUser ? { id: heartUser } : null }, error: null }) },
    from: table => {
      if (table === "home_feed") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: heartVisible ? { id: heartPostId } : null, error: null }) }) }) };
      }
      assert.equal(table, "post_hearts");
      return {
        upsert: async (row, options) => {
          assert.equal(row.post_id, heartPostId);
          assert.equal(row.user_id, heartUser);
          assert.equal(options.ignoreDuplicates, true);
          if (!heartWriteFails) voters.add(row.user_id);
          return { error: heartWriteFails ? { code: "test_write_failure" } : null };
        },
        delete: () => ({ eq(field, value) {
          if (field === "post_id") { assert.equal(value, heartPostId); return this; }
          assert.equal(field, "user_id");
          assert.equal(value, heartUser);
          voters.delete(value);
          return Promise.resolve({ error: null });
        } }),
      };
    },
    rpc: (name, args) => {
      assert.equal(name, "get_post_hearts");
      assert.deepEqual(args.post_ids, [heartPostId]);
      return { single: async () => ({ data: { heart_count: voters.size, hearted: voters.has(heartUser) }, error: null }) };
    },
  };
  const heartRoute = load("app/api/posts/[id]/heart/route.ts", {
    "next/headers": { cookies: async () => ({}) },
    "next/cache": { revalidatePath: () => {} },
    "@/app/supabase/server": { createClient: () => heartClient },
  });
  const heartContext = { params: Promise.resolve({ id: heartPostId }) };
  const heartRequest = new Request("http://localhost/api/posts/heart", { method: "PUT", body: JSON.stringify({ user_id: "spoofed-user" }) });
  assert.deepEqual(await (await heartRoute.PUT(heartRequest, heartContext)).json(), { hearted: true, count: 1 });
  assert.deepEqual(await (await heartRoute.PUT(heartRequest, heartContext)).json(), { hearted: true, count: 1 });
  heartUser = "user-b";
  assert.deepEqual(await (await heartRoute.PUT(heartRequest, heartContext)).json(), { hearted: true, count: 2 });
  assert.deepEqual(await (await heartRoute.DELETE(heartRequest, heartContext)).json(), { hearted: false, count: 1 });
  assert.deepEqual(await (await heartRoute.DELETE(heartRequest, heartContext)).json(), { hearted: false, count: 1 });
  assert.ok(voters.has("user-a"), "Removing a heart must not affect another user");
  heartUser = null;
  assert.equal((await heartRoute.PUT(heartRequest, heartContext)).status, 401);
  heartUser = "user-a";
  assert.equal((await heartRoute.PUT(heartRequest, { params: Promise.resolve({ id: "invalid" }) })).status, 400);
  heartVisible = false;
  assert.equal((await heartRoute.PUT(heartRequest, heartContext)).status, 404);
  heartVisible = true;
  heartWriteFails = true;
  assert.equal((await heartRoute.PUT(heartRequest, heartContext)).status, 500);
  console.log("Passed heart checks: authentication, visibility, idempotent add/remove, one heart per user, counts, ownership, and write failures.");

  let queriedUser;
  let queriedTable;
  let selectedFields;
  let queriedRange;
  const ordering = [];
  let signedPaths;
  let feedError = null;
  let imageError = null;
  let heartsError = null;
  let feedRows = Array.from({ length: 13 }, (_, index) => ({
    id: String(index), user_id: "test-user", image_path: `test-user/${index}.png`, caption: index ? "A caption" : null,
    context: null, created_at: "2026-10-05T12:00:00Z",
  }));
  const query = {
    select: fields => { selectedFields = fields; return query; },
    eq: (field, value) => { assert.equal(field, "user_id"); queriedUser = value; return query; },
    order: (field, options) => { ordering.push([field, options.ascending]); return query; },
    range: (start, end) => { queriedRange = [start, end]; return query; },
    returns: async () => ({ data: feedRows, error: feedError }),
  };
  const feedClient = {
    rpc: async (name, args) => {
      assert.equal(name, "get_post_hearts");
      return { data: args.post_ids.map(post_id => ({ post_id, heart_count: 2, hearted: true })), error: heartsError };
    },
    from: table => { queriedTable = table; return query; },
    storage: { from: bucket => {
      assert.equal(bucket, "post-images");
      return { createSignedUrls: async (paths, lifetime) => {
        signedPaths = paths;
        assert.equal(lifetime, 3600);
        return { data: imageError ? null : paths.map(path => ({ path, signedUrl: `https://test.invalid/${path}` })), error: imageError };
      } };
    } },
  };
  let feed = await getUserFeed(feedClient, "test-user", 1);
  assert.equal(queriedUser, "test-user");
  assert.equal(queriedTable, "posts");
  assert.ok(selectedFields.includes("context"));
  assert.deepEqual(queriedRange, [0, 12]);
  assert.deepEqual(ordering, [["created_at", false], ["id", false]]);
  assert.equal(feed.posts.length, 12);
  assert.equal(feed.hasNext, true);
  assert.equal(signedPaths.length, 12);
  assert.equal(feed.posts[0].caption, null, "Keep older uploads without captions");
  assert.equal(feed.posts[0].heartsAvailable, false);
  assert.equal(feed.posts[1].heartCount, 2);
  assert.equal(feed.posts[1].hearted, true);
  assert.equal(feed.posts[0].signedImageUrl, "https://test.invalid/test-user/0.png");
  feedRows = [];
  feed = await getUserFeed(feedClient, "test-user", 2);
  assert.deepEqual(queriedRange, [12, 24]);
  assert.equal(feed.hasNext, false);
  assert.equal(feed.posts.length, 0);
  feedError = { code: "test_feed_failure" };
  assert.equal((await getUserFeed(feedClient, "test-user", 1)).error, true);
  feedError = null;
  feedRows = [{ id: "1", image_path: "test-user/1.png", caption: "Saved caption", context: null, created_at: "2026-10-05T12:00:00Z" }];
  imageError = { name: "test_image_failure" };
  feed = await getUserFeed(feedClient, "test-user", 1);
  assert.equal(feed.posts[0].signedImageUrl, null);
  assert.equal(feed.posts[0].caption, "Saved caption", "Image failure should preserve the caption");
  imageError = null;
  queriedUser = undefined;
  feedRows = [
    { id: "own", user_id: "test-user", image_path: "test-user/own.png", caption: "Own caption", context: "Private context", created_at: "2026-10-05T12:00:00Z" },
    { id: "other", user_id: "another-user", image_path: "another-user/other.png", caption: "Another caption", created_at: "2026-10-05T11:00:00Z" },
  ];
  feed = await getHomeFeed(feedClient, 1);
  assert.equal(queriedTable, "home_feed", "Community reads must use the restricted view");
  assert.equal(queriedUser, undefined, "Home Feed must not filter to the current user");
  assert.equal(selectedFields.includes("context"), false);
  assert.equal(selectedFields.includes("generation_prompt"), false);
  assert.equal(feed.posts.length, 2);
  assert.equal(feed.posts[0].context, null, "Never expose private context in the community result");
  assert.equal(feed.posts[1].context, null);
  assert.equal(feed.posts[1].signedImageUrl, "https://test.invalid/another-user/other.png");
  feed = await getUserFeed(feedClient, "test-user", 1);
  assert.equal(queriedTable, "posts");
  assert.equal(queriedUser, "test-user");
  assert.equal(feed.posts[0].context, "Private context");
  heartsError = { code: "missing_migration" };
  feed = await getUserFeed(feedClient, "test-user", 1);
  assert.equal(feed.error, false, "A missing hearts migration must not break the feed");
  assert.equal(feed.posts[0].heartsAvailable, false);
  console.log("Passed feed checks: personal user filter, community view, context privacy, newest-first ordering, pagination, signed images, legacy posts, and errors.");

  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.OPENAI_CAPTION_MODEL;
  providerBody = completed();
  const generated = await service.generateCaption(png, "image/png", "Coffee after midterms");
  assert.equal(calls, 1);
  assert.deepEqual(generated.captions, captions);
  assert.equal(generated.model, "gpt-4.1-mini-test-snapshot");
  assert.equal(generated.prompt_version, "sam-v2");
  assert.equal(payload.instructions, prompt.CAPTION_PROMPT);
  assert.equal(payload.store, false);
  assert.equal(payload.model, "gpt-4.1-mini");
  assert.ok(payload.input[0].content[0].text.includes("Coffee after midterms"));
  assert.equal(payload.input[0].content[1].image_url, `data:image/png;base64,${Buffer.from(png).toString("base64")}`);
  process.env.OPENAI_CAPTION_MODEL = "configured-vision-model";
  await service.generateCaption(png, "image/png", "");
  assert.equal(payload.model, "configured-vision-model");
  delete process.env.OPENAI_CAPTION_MODEL;

  for (const badBody of [completed(""), completed("word ".repeat(26)), completed("x".repeat(201)), completed("line one\nline two"), { ...completed(), status: "incomplete" }]) {
    providerBody = badBody;
    await assert.rejects(service.generateCaption(png, "image/png", ""), error => error.status === 502);
  }
  for (const invalid of [[caption], [caption, caption, captions[2]], [caption, 42, captions[2]], [caption, "word ".repeat(26), captions[2]], [caption, "x".repeat(201), captions[2]], [caption, "line one\nline two", captions[2]]]) {
    providerBody = completed(JSON.stringify({ captions: invalid }));
    await assert.rejects(service.generateCaption(png, "image/png", ""), error => error.status === 502);
  }
  providerBody = completed();
  await assert.rejects(service.generateCaption(png, "image/png", "", [caption]), error => error.status === 502);
  assert.ok(payload.input[0].content.some(item => item.text?.includes("Previously offered captions")));
  providerBody = { status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] };
  await assert.rejects(service.generateCaption(png, "image/png", ""), error => error.status === 422);
  providerStatus = 429;
  for (const code of ["insufficient_quota", "credit_balance_exhausted", "project_spend_limit_exceeded"]) {
    providerBody = { error: { code, type: "insufficient_quota" } };
    const before = calls;
    await assert.rejects(service.generateCaption(png, "image/png", ""), error =>
      error.status === 503 && error.code === "openai_quota_exceeded" && error.message.includes("billing"));
    assert.equal(calls, before + 1, "Quota errors must never retry");
  }
  providerBody = { error: { code: "rate_limit_exceeded", type: "rate_limit_error" } };
  providerHeaders = { "retry-after": "60" };
  const beforeLongDelay = calls;
  await assert.rejects(service.generateCaption(png, "image/png", ""), error =>
    error.status === 429 && error.retryAfterSeconds === 60);
  assert.equal(calls, beforeLongDelay + 1, "Do not retry before a long Retry-After delay");
  providerHeaders = { "retry-after": "0" };
  recoverAfterCall = calls + 1;
  const beforeRecovery = calls;
  assert.deepEqual((await service.generateCaption(png, "image/png", "")).captions, captions);
  assert.equal(calls, beforeRecovery + 2, "A temporary limit should recover on retry");
  recoverAfterCall = null;
  const beforeExhaustion = calls;
  await assert.rejects(service.generateCaption(png, "image/png", ""), error => error.status === 429);
  assert.equal(calls, beforeExhaustion + 3, "Bound retries to three attempts");
  providerHeaders = {};
  providerStatus = 200;
  fetchError = new DOMException("Timed out", "TimeoutError");
  await assert.rejects(service.generateCaption(png, "image/png", ""), error => error.status === 504);
  fetchError = null;
  providerBody = completed();

  signedIn = false;
  const callsBeforeAuth = calls;
  assert.equal((await POST(request())).status, 401);
  assert.equal(calls, callsBeforeAuth);
  assert.equal(uploaded, 0);
  signedIn = true;
  delete process.env.OPENAI_API_KEY;
  assert.equal((await POST(request())).status, 503);
  assert.equal(uploaded, 0);
  process.env.OPENAI_API_KEY = "test-key";
  const callsBeforeSuccess = calls;
  const success = await POST(request("  weekend coffee  "));
  assert.equal(success.status, 200);
  const options = await success.json();
  assert.deepEqual(options.captions, captions);
  assert.equal(calls, callsBeforeSuccess + 1);
  assert.equal(uploaded, 0, "Review must never upload or publish");
  assert.equal(inserted, undefined);
  const publishFields = { action: "publish", reviewToken: options.reviewToken, caption: captions[1] };
  const published = await POST(request("weekend coffee", publishFields));
  assert.equal(published.status, 201);
  assert.equal((await published.json()).post.caption, captions[1]);
  assert.equal(calls, callsBeforeSuccess + 1, "Publishing must not regenerate captions");
  assert.equal(inserted.context, "weekend coffee");
  assert.equal(inserted.user_id, "test-user");
  assert.equal(inserted.generation_prompt, prompt.CAPTION_PROMPT);
  assert.equal(inserted.prompt_version, "sam-v2");
  assert.ok(inserted.image_path.startsWith("test-user/"));
  const uploadsBeforeInvalid = uploaded;
  for (const invalid of [
    { ...publishFields, caption: "Not a generated choice" },
    { ...publishFields, reviewToken: options.reviewToken + "tampered" },
    { action: "publish", caption },
  ]) assert.equal((await POST(request("weekend coffee", invalid))).status, 400);
  assert.equal((await POST(request("changed context", publishFields))).status, 400);
  assert.equal(uploaded, uploadsBeforeInvalid);
  assert.equal(review.verifyReview(options.reviewToken, "other-user", png, "image/png", "weekend coffee"), null);
  assert.equal(review.verifyReview(options.reviewToken, "test-user", new Uint8Array([...png, 1]), "image/png", "weekend coffee"), null);
  const now = Date.now;
  try {
    Date.now = () => now() + 25 * 60 * 60 * 1000;
    assert.equal(review.verifyReview(options.reviewToken, "test-user", png, "image/png", "weekend coffee"), null);
  } finally { Date.now = now; }

  const noContext = await (await POST(request())).json();
  assert.equal((await POST(request(undefined, { action: "publish", reviewToken: noContext.reviewToken, caption }))).status, 201);
  assert.equal(inserted.context, null);
  const freshCaptions = ["Tuition now includes emotional support espresso.", "My study budget is mostly foam.", "The syllabus said nothing about latte debt."];
  providerBody = completed(JSON.stringify({ captions: freshCaptions }));
  const more = await POST(request("weekend coffee", { previousCaptions: JSON.stringify(captions) }));
  assert.equal(more.status, 200);
  assert.deepEqual((await more.json()).captions, freshCaptions);
  assert.ok(payload.input[0].content.some(item => item.text?.includes(caption)));
  assert.equal(uploaded, uploadsBeforeInvalid + 1, "More captions must not publish");
  assert.equal((await POST(request("", { previousCaptions: "invalid json" }))).status, 400);
  providerBody = completed("");
  assert.equal((await POST(request())).status, 502);
  assert.equal(removed, 0, "Generation has no stored files to clean up");
  providerBody = completed();
  saveFails = true;
  assert.equal((await POST(request("weekend coffee", publishFields))).status, 500);
  assert.equal(removed, 1);
  saveFails = false;
  providerStatus = 429;
  providerBody = { error: { code: "rate_limit_exceeded" } };
  providerHeaders = { "retry-after": "30" };
  const rateLimited = await POST(request());
  assert.equal(rateLimited.status, 429);
  assert.equal(rateLimited.headers.get("retry-after"), "30");
  assert.equal((await rateLimited.json()).code, "openai_rate_limited");
  assert.equal(removed, 1);
  providerStatus = 200;
  providerBody = completed();
  providerHeaders = {};
  uploadFails = true;
  const callsBeforeUpload = calls;
  assert.equal((await POST(request("weekend coffee", publishFields))).status, 500);
  assert.equal(calls, callsBeforeUpload);
  assert.ok(validation.validateImage({ type: "image/gif", size: 100 }));
  console.log("Passed caption checks: image/context payload, three choices, review without publication, more captions, signed selection, prompt/model metadata, output validation, refusal, timeout, rate limit, auth, configuration, persistence, and failure cleanup.");
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.OPENAI_CAPTION_MODEL;
  else process.env.OPENAI_CAPTION_MODEL = originalModel;
});
