import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const requireDependency = createRequire(import.meta.url);
function load(path, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(name => Object.hasOwn(imports, name) ? imports[name] : requireDependency(name), mod, mod.exports);
  return mod.exports;
}

const { getFeedReturnPath } = load("app/auth/return-path.ts");
const id = "12345678-1234-1234-1234-123456789abc";
for (const path of [`/#post-${id}`, `/?page=2#post-${id}`, `/?page=10000#post-${id}`]) {
  assert.equal(getFeedReturnPath(path), path);
}
for (const path of [null, undefined, [], "https://example.com", "//example.com", "/\\example.com", "/%2fexample.com", "/?page=0", "/?page=1&next=evil", `/?page=2#post-${id}\n`, "/profile", "/#post-invalid"]) {
  assert.equal(getFeedReturnPath(path), "/", `Reject unsafe return path: ${path}`);
}

// Exercise guest heart interactions with deterministic hook state and no network.
let state = [];
let cursor = 0;
let refCursor = 0;
const refs = [];
let networkCalls = 0;
const fetchBefore = global.fetch;
global.fetch = async () => { networkCalls++; throw new Error("Guest must not write hearts"); };
const { HeartButton } = load("app/posts/heart-button.tsx", {
  react: {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = value; }];
    },
    useRef: value => refs[refCursor++] ?? (refs[refCursor - 1] = { current: value }),
  },
  "next/navigation": { useRouter: () => ({ refresh() {} }) },
  "@/app/auth/auth-controls": { AuthControls: () => null },
});
function elements(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...React.Children.toArray(node.props?.children).flatMap(elements)];
}
function renderHeart(available = true) {
  cursor = 0;
  refCursor = 0;
  return elements(HeartButton({ postId: id, initialCount: 7, initialHearted: false, available, isSignedIn: false }));
}
try {
  let tree = renderHeart();
  const dialog = tree.find(node => node.type === "dialog");
  let opened = false;
  const modal = {
    showModal() { opened = true; },
    close() { opened = false; dialog.props.onClose(); },
  };
  dialog.props.ref.current = modal;
  let button = tree.find(node => node.type === "button");
  assert.equal(button.props.disabled, false);
  assert.equal(button.props["aria-expanded"], false);
  await button.props.onClick();
  tree = renderHeart();
  assert.equal(opened, true);
  assert.ok(tree.some(node => node.type === "h2" && node.props.children === "Sign in to like this post."));
  assert.equal(tree.find(node => node.type === "button").props["aria-expanded"], true);
  assert.ok(tree.some(node => node.type === "span" && node.props.children === 7), "Count stays unchanged");
  tree.find(node => node.type === "button" && node.props.children === "Dismiss").props.onClick();
  assert.equal(renderHeart().find(node => node.type === "button").props["aria-expanded"], false);
  assert.equal(opened, false);
  await renderHeart().find(node => node.type === "button").props.onClick();
  renderHeart().find(node => node.props?.["aria-label"] === "Close sign-in popup").props.onClick();
  assert.equal(opened, false, "Close button dismisses the popup");
  await renderHeart().find(node => node.type === "button").props.onClick();
  // Native Escape closes the dialog and fires onClose.
  dialog.props.onClose();
  assert.equal(renderHeart().find(node => node.type === "button").props["aria-expanded"], false);
  assert.equal(networkCalls, 0);
  state = [];
  assert.equal(renderHeart(false).find(node => node.type === "button").props.disabled, false, "Guests can sign in even if stats are unavailable");
} finally {
  global.fetch = fetchBefore;
}

const feedCursor = load("app/posts/feed-cursor.ts");
const { InfiniteFeed } = load("app/posts/infinite-feed.tsx", {
  "./author-profile": { AuthorProfilePopover: ({ authorName }) => React.createElement("span", null, `By ${authorName || "Campus contributor"}`) },
  "next/link": ({ href, children }) => React.createElement("a", { href }, children),
  "./heart-button": { HeartButton: ({ isSignedIn, initialCount }) => React.createElement("span", null, `${isSignedIn ? "member" : "guest"} hearts: ${initialCount}`) },
  "./delete-post-button": { DeletePostButton: () => React.createElement("button", null, "Delete post") },
});
const { Feed } = load("app/posts/feed.tsx", {
  "next/link": ({ href, children }) => React.createElement("a", { href }, children),
  "./feed-cursor": feedCursor,
  "./infinite-feed": { InfiniteFeed },
  "./feed-data": {
    getHomeFeed: async () => ({ posts: [{ id, user_id: "owner", caption: "Public punchline", context: "Private backstory", authorName: "Alex", crowdPick: true, signedImageUrl: "https://example.com/image.gif", created_at: "2026-10-19T12:00:00Z", heartCount: 7, hearted: false, heartsAvailable: true }], hasNext: true, error: false }),
    getUserFeed: async () => { throw new Error("Guests must not query private feeds"); },
  },
  "./heart-button": { HeartButton: ({ isSignedIn, initialCount }) => React.createElement("span", null, `${isSignedIn ? "member" : "guest"} hearts: ${initialCount}`) },
  "./delete-post-button": { DeletePostButton: () => React.createElement("button", null, "Delete post") },
});
const html = renderToStaticMarkup(await Feed({ supabase: {}, userId: null, scope: "home" }));
assert.match(html, /Public punchline/);
assert.match(html, /guest hearts: 7/);
assert.match(html, /image.gif/);
assert.match(html, /Load more memes/);
assert.doesNotMatch(html, /Feed pagination|Older posts|Newer posts/);
assert.doesNotMatch(html, /Private backstory|Delete post|Your post/);
assert.equal((html.match(/Crowd Pick/g) ?? []).length, 1);
const firstPageHtml = renderToStaticMarkup(await Feed({ supabase: {}, userId: null, scope: "home" }));
assert.equal((firstPageHtml.match(/Crowd Pick/g) ?? []).length, 1);
assert.equal(await Feed({ supabase: {}, userId: null, scope: "personal" }), null);
console.log("Passed public feed checks: guest rendering, infinite-scroll controls, private context, ownership controls, sign-in popup, dismissal, no guest writes, and safe post return paths.");
