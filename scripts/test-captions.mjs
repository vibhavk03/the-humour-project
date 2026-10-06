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
const validation = load("app/posts/upload-validation.ts");
const { getUserFeed } = load("app/posts/feed-data.ts", { "server-only": {} });
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const caption = "This latte and my degree have the same financing plan.";
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
  "@/app/posts/upload-validation": validation,
});
function request(context) {
  const body = new FormData();
  body.set("image", new File([png], "photo.png", { type: "image/png" }));
  if (context !== undefined) body.set("context", context);
  return new Request("http://localhost/api/posts", { method: "POST", body });
}
function completed(text = caption) {
  return { status: "completed", model: "gpt-4.1-mini-test-snapshot", output: [
    { type: "message", content: [{ type: "output_text", text }] },
  ] };
}

async function run() {
  let queriedUser;
  let queriedRange;
  const ordering = [];
  let signedPaths;
  let feedError = null;
  let imageError = null;
  let feedRows = Array.from({ length: 13 }, (_, index) => ({
    id: String(index), image_path: `test-user/${index}.png`, caption: index ? "A caption" : null,
    context: null, created_at: "2026-10-05T12:00:00Z",
  }));
  const query = {
    select: () => query,
    eq: (field, value) => { assert.equal(field, "user_id"); queriedUser = value; return query; },
    order: (field, options) => { ordering.push([field, options.ascending]); return query; },
    range: (start, end) => { queriedRange = [start, end]; return query; },
    returns: async () => ({ data: feedRows, error: feedError }),
  };
  const feedClient = {
    from: table => { assert.equal(table, "posts"); return query; },
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
  assert.deepEqual(queriedRange, [0, 12]);
  assert.deepEqual(ordering, [["created_at", false], ["id", false]]);
  assert.equal(feed.posts.length, 12);
  assert.equal(feed.hasNext, true);
  assert.equal(signedPaths.length, 12);
  assert.equal(feed.posts[0].caption, null, "Keep older uploads without captions");
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
  console.log("Passed feed checks: user filter, newest-first ordering, pagination, private image signing, legacy posts, and error handling.");

  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.OPENAI_CAPTION_MODEL;
  providerBody = completed();
  const generated = await service.generateCaption(png, "image/png", "Coffee after midterms");
  assert.equal(calls, 1);
  assert.equal(generated.caption, caption);
  assert.equal(generated.model, "gpt-4.1-mini-test-snapshot");
  assert.equal(generated.prompt_version, "sam-v1");
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
  assert.equal((await service.generateCaption(png, "image/png", "")).caption, caption);
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
  assert.equal(success.status, 201);
  assert.equal((await success.json()).post.caption, caption);
  assert.equal(calls, callsBeforeSuccess + 1);
  assert.equal(inserted.context, "weekend coffee");
  assert.equal(inserted.user_id, "test-user");
  assert.equal(inserted.generation_prompt, prompt.CAPTION_PROMPT);
  assert.equal(inserted.prompt_version, "sam-v1");
  assert.equal(inserted.caption, caption);
  assert.ok(inserted.image_path.startsWith("test-user/"));
  assert.equal((await POST(request())).status, 201);
  assert.equal(inserted.context, null);

  providerBody = completed("");
  assert.equal((await POST(request())).status, 502);
  assert.equal(removed, 1);
  providerBody = completed();
  saveFails = true;
  assert.equal((await POST(request())).status, 500);
  assert.equal(removed, 2);
  saveFails = false;
  providerStatus = 429;
  providerBody = { error: { code: "rate_limit_exceeded" } };
  providerHeaders = { "retry-after": "30" };
  const rateLimited = await POST(request());
  assert.equal(rateLimited.status, 429);
  assert.equal(rateLimited.headers.get("retry-after"), "30");
  assert.equal((await rateLimited.json()).code, "openai_rate_limited");
  assert.equal(removed, 3);
  providerStatus = 200;
  providerBody = completed();
  providerHeaders = {};
  uploadFails = true;
  const callsBeforeUpload = calls;
  assert.equal((await POST(request())).status, 500);
  assert.equal(calls, callsBeforeUpload);
  assert.ok(validation.validateImage({ type: "image/gif", size: 100 }));
  console.log("Passed caption checks: image/context payload, single call, prompt/model metadata, output validation, refusal, timeout, rate limit, auth, configuration, persistence, and failure cleanup.");
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.OPENAI_CAPTION_MODEL;
  else process.env.OPENAI_CAPTION_MODEL = originalModel;
});
