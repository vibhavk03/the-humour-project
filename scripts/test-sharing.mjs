import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";

const requireDependency = createRequire(import.meta.url);
function load(path, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(name => Object.hasOwn(imports, name) ? imports[name] : requireDependency(name), mod, mod.exports);
  return mod.exports;
}
const id = "12345678-1234-1234-1234-123456789abc";
const post = { id, user_id: "author", image_path: "author/meme.gif", caption: "A public punchline", author_name: "Alex", created_at: "2026-10-20T12:00:00Z" };
let visiblePost = post, queryError = null, queries = 0, downloads = 0;
const originalImage = await sharp({ create: { width: 12, height: 10, channels: 3, background: "pink" } }).gif().toBuffer();
const client = {
  from(table) {
    queries++;
    assert.equal(table, "home_feed", "Only the published public projection may be queried");
    return { select(fields) {
      assert.doesNotMatch(fields, /context/);
      return { eq(column, value) { assert.equal(column, "id"); assert.equal(value, id); return { maybeSingle: async () => ({ data: visiblePost, error: queryError }) }; } };
    } };
  },
  auth: { getUser: async () => ({ data: { user: null } }) },
  storage: { from(bucket) {
    assert.equal(bucket, "post-images");
    return {
      createSignedUrl: async path => { assert.equal(path, post.image_path); return { data: { signedUrl: "https://storage.example/meme.gif" } }; },
      download: async path => { downloads++; assert.equal(path, post.image_path); return { data: new Blob([originalImage]) }; },
    };
  } },
};
const publicPost = load("app/posts/public-post.ts", {
  "server-only": {}, react: { cache: fn => fn }, "next/headers": { cookies: async () => ({}) },
  "@/app/supabase/server": { createClient: () => client },
});
assert.equal(await publicPost.findPublicPost(client, "invalid"), null);
assert.equal(queries, 0);
assert.deepEqual(await publicPost.getPublicPost(id), post);
visiblePost = null;
assert.equal(await publicPost.getPublicPost(id), null, "Unpublished and deleted records are unavailable");
queryError = { code: "offline" };
await assert.rejects(publicPost.getPublicPost(id), /could not be loaded/);
queryError = null; visiblePost = post;

const { getFeedReturnPath } = load("app/auth/return-path.ts");
assert.equal(getFeedReturnPath(`/posts/${id}`), `/posts/${id}`);
for (const unsafe of [`//evil.example/posts/${id}`, `/posts/${id}?next=https://evil.example`, "/posts/invalid"]) assert.equal(getFeedReturnPath(unsafe), "/");

function VoteStub(props) { return React.createElement("span", null, props.isSignedIn ? "Member voting" : "Guest voting"); }
const page = load("app/posts/[id]/page.tsx", {
  "next/link": ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children),
  "next/headers": { cookies: async () => ({}) },
  "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
  "@/app/supabase/server": { createClient: () => client },
  "../public-post": publicPost,
  "../pending-vote-retry": { PendingVoteRetry: () => null },
  "../vote-data": { getPostVotes: async () => new Map([[id, { score: 2, user_vote: 0 }]]) },
  "../vote-buttons": { VoteButtons: VoteStub },
  "../share-post-button": { SharePostButton: () => React.createElement("button", null, "Share") },
  "../author-profile": { AuthorProfilePopover: ({ authorName }) => React.createElement("span", null, authorName) },
});
const props = { params: Promise.resolve({ id }) };
const html = renderToStaticMarkup(await page.default(props));
assert.match(html, /A public punchline|Alex/);
assert.match(html, /meme.gif/);
assert.match(html, /Guest voting/);
assert.match(html, /href="\/try"/);
const metadata = await page.generateMetadata(props);
assert.equal(metadata.openGraph.url, `https://the-humour-project.vercel.app/posts/${id}`);
assert.equal(metadata.description, post.caption);
assert.equal(metadata.openGraph.images[0].url, `https://the-humour-project.vercel.app/api/posts/${id}/share-image`);
assert.doesNotMatch(JSON.stringify(metadata), /storage.example/);
visiblePost = null;
await assert.rejects(page.default(props), /NOT_FOUND/);
await assert.rejects(page.generateMetadata(props), /NOT_FOUND/);

const preview = load("app/api/posts/[id]/share-image/route.ts", {
  "next/headers": { cookies: async () => ({}) },
  "@/app/supabase/server": { createClient: () => client },
  "@/app/posts/public-post": publicPost,
});
let response = await preview.GET(new Request("https://example.com"), props);
assert.equal(response.status, 404);
assert.equal(downloads, 0, "Missing/private posts must not trigger storage downloads");
visiblePost = post;
response = await preview.GET(new Request("https://example.com"), props);
assert.equal(response.status, 200);
assert.equal(response.headers.get("content-type"), "image/jpeg");
assert.equal(response.headers.get("cache-control"), "no-store");
assert.equal((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).format, "jpeg");
queryError = { code: "offline" };
assert.equal((await preview.GET(new Request("https://example.com"), props)).status, 503);
queryError = null;

// Exercise native sharing, copying, cancellation, and manual-copy fallback.
let states = [], index = 0, refs = [], refIndex = 0, coarse = false, copied = "", shareCalls = 0;
const browserBefore = { window: globalThis.window, navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator") };
const navigatorMock = { clipboard: { writeText: async url => { copied = url; } }, share: async data => { shareCalls++; assert.equal(data.url, `https://deployed.example/posts/${id}`); } };
globalThis.window = { location: { origin: "https://deployed.example" }, matchMedia: () => ({ matches: coarse }) };
Object.defineProperty(globalThis, "navigator", { configurable: true, value: navigatorMock });
const { SharePostButton } = load("app/posts/share-post-button.tsx", {
  react: { ...React,
    useState(initial) { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; },
    useRef(initial) { const i = refIndex++; return refs[i] ?? (refs[i] = { current: initial }); },
  },
});
function elements(node) { return !node || typeof node !== "object" ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(elements)]; }
function render() { index = 0; refIndex = 0; return elements(SharePostButton({ postId: id })); }
async function click() { await render().find(node => node.type === "button").props.onClick(); }
try {
  await click();
  assert.equal(copied, `https://deployed.example/posts/${id}`);
  assert.equal(shareCalls, 0, "Desktop copies the link");
  assert.ok(render().some(node => node.props?.children === "Link copied!"));
  coarse = true; copied = "";
  await click(); assert.equal(shareCalls, 1); assert.equal(copied, "");
  navigatorMock.share = async () => { throw Object.assign(new Error("Cancelled"), { name: "AbortError" }); };
  await click(); assert.equal(copied, "");
  navigatorMock.share = async () => { throw new Error("Unavailable"); };
  await click(); assert.equal(copied, `https://deployed.example/posts/${id}`);
  navigatorMock.clipboard.writeText = async () => { throw new Error("Denied"); };
  await click();
  assert.equal(render().find(node => node.type === "input").props.value, `https://deployed.example/posts/${id}`);
} finally {
  if (browserBefore.window === undefined) delete globalThis.window; else globalThis.window = browserBefore.window;
  if (browserBefore.navigator) Object.defineProperty(globalThis, "navigator", browserBefore.navigator); else delete globalThis.navigator;
}
console.log("Passed sharing checks: public-only lookup, guest view, missing posts, metadata, preview images, safe sign-in return, mobile share, clipboard and fallback.");
