import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";

const dependency = createRequire(import.meta.url);
function load(path, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(name => Object.hasOwn(imports, name) ? imports[name] : dependency(name), mod, mod.exports);
  return mod.exports;
}
const feedSort = load("app/posts/feed-sort.ts");
const cursorTools = load("app/posts/feed-cursor.ts", { "./feed-sort": feedSort });
const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const post = n => ({ id: uuid(n), user_id: "owner", image_path: `owner/${n}.gif`, caption: `Caption ${n}`, context: "private context", created_at: "2026-10-20T10:00:00.123456+00:00", score: 2, userVote: 0, votesAvailable: true, signedImageUrl: "/image.gif" });
const boundary = { ...post(20), crowdPick: false };
const pinned = { ...post(1), crowdPick: true };
const encoded = cursorTools.makeFeedCursor([pinned, boundary]);
const cursor = cursorTools.parseFeedCursor(encoded);
assert.deepEqual(cursor, { id: boundary.id, createdAt: boundary.created_at, pinnedId: pinned.id });
for (const value of [null, "?", "a".repeat(513), Buffer.from(JSON.stringify({ ...cursor, id: "x),id.gt.0" })).toString("base64url"), Buffer.from(JSON.stringify({ ...cursor, createdAt: "2026-10-20),id.gt.0" })).toString("base64url"), Buffer.from(JSON.stringify({ ...cursor, pinnedId: "bad" })).toString("base64url")]) assert.equal(cursorTools.parseFeedCursor(value), null);

// Model database ordering with tied timestamps, and mutations between requests.
let rows = Array.from({ length: 32 }, (_, i) => post(i + 1));
let table, filters, selected, range;
let failQuery = false;
const client = {
  from(name) {
    table = name; filters = {}; selected = "";
    const query = {
      select(value) { selected = value; return query; },
      eq(key, value) { filters[key] = value; return query; },
      neq(key, value) { filters.excluded = value; return query; },
      or(value) { filters.cursor = value; return query; },
      order() { return query; },
      range(start, end) { range = [start, end]; return query; },
      async returns() {
        assert.equal(filters.cursor, `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
        const visible = rows.filter(row => (!filters.user_id || row.user_id === filters.user_id) && row.id !== filters.excluded && (row.created_at < cursor.createdAt || row.created_at === cursor.createdAt && row.id < cursor.id)).sort((a,b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
        return { data: visible.slice(range[0], range[1] + 1), error: failQuery ? { code: "test_failure" } : null };
      },
    };
    return query;
  },
  rpc: async (_name, args) => ({ data: args.post_ids.map(post_id => ({ post_id, score: 2, user_vote: 0 })), error: null }),
  storage: { from: () => ({ createSignedUrls: async paths => ({ data: paths.map(path => ({ path, signedUrl: `/signed/${path}` })), error: null }) }) },
};
const { getNextFeed } = load("app/posts/feed-data.ts", { "server-only": {}, "./vote-data": load("app/posts/vote-data.ts", { "server-only": {} }) });
const first = await getNextFeed(client, cursor);
assert.equal(table, "home_feed");
assert.equal(selected.includes("context"), false);
assert.equal(filters.excluded, pinned.id);
assert.deepEqual(range, [0,12]);
assert.deepEqual(first.posts.map(p => p.id), Array.from({ length: 12 }, (_, i) => uuid(19-i)));
assert.equal(first.hasNext, true);
assert.ok(first.posts.every(p => p.context === null && !p.crowdPick));
rows = rows.filter(p => p.id !== uuid(30)); // Deleting above the boundary cannot skip an older post.
rows.push({ ...post(50), created_at: "2026-10-21T10:00:00Z" });
assert.deepEqual((await getNextFeed(client, cursor)).posts.map(p => p.id), first.posts.map(p => p.id));
await getNextFeed(client, cursor, "owner");
assert.equal(table, "user_feed");
assert.equal(filters.user_id, "owner");
assert.equal(filters.excluded, undefined);
assert.equal(selected.includes("context"), true);
assert.equal((await getNextFeed(client, cursor, "owner")).posts[0].context, "private context");
failQuery = true;
assert.equal((await getNextFeed(client, cursor)).error, true);

// The endpoint never takes a personal-feed user ID from the browser.
let user = null, queryCalls = 0, queriedOwner;
let result = { posts: first.posts, hasNext: true, error: false };
const { GET } = load("app/api/feed/route.ts", {
  "next/headers": { cookies: async () => ({}) },
  "@/app/supabase/server": { createClient: () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) } }) },
  "@/app/posts/feed-cursor": cursorTools,
  "@/app/posts/feed-sort": feedSort,
  "@/app/posts/feed-data": { getNextFeed: async (_client, _cursor, owner) => { queryCalls++; queriedOwner = owner; return result; } },
});
const request = (scope, value = encoded) => new Request(`http://localhost/api/feed?${new URLSearchParams({ scope, cursor: value, userId: "victim" })}`);
assert.equal((await GET(request("home", "invalid"))).status, 400);
assert.equal((await GET(request("unknown"))).status, 400);
assert.equal((await GET(request("personal"))).status, 401);
assert.equal(queryCalls, 0);
let response = await GET(request("home"));
assert.equal(response.status, 200);
assert.equal(response.headers.get("Cache-Control"), "private, no-store");
assert.equal(queriedOwner, undefined);
assert.equal(cursorTools.parseFeedCursor((await response.json()).nextCursor).pinnedId, pinned.id);
user = { id: "signed-in-owner" };
await GET(request("personal"));
assert.equal(queriedOwner, user.id);
result = { posts: [], hasNext: false, error: false };
assert.equal((await (await GET(request("home"))).json()).nextCursor, null);
result.error = true;
assert.equal((await GET(request("home"))).status, 503);

// Drive observer loading and retry without real requests or a database.
const originalFetch = global.fetch;
const originalObserver = global.IntersectionObserver;
let state = [], refs = [], stateIndex = 0, refIndex = 0, effectIndex = 0;
const effects = [];
let observer;
const observers = [];
let calls = 0;
let resolveRequest;
global.IntersectionObserver = class {
  constructor(callback) { this.callback = callback; observers.push(this); observer = observers.at(-1); }
  observe() { this.observing = true; }
  disconnect() { this.observing = false; }
};
const { InfiniteFeed } = load("app/posts/infinite-feed.tsx", {
  "./author-profile": { AuthorProfilePopover: ({ authorName }) => React.createElement("span", null, `By ${authorName || "Campus contributor"}`) },
  "next/link": () => null,
  "./vote-buttons": { VoteButtons: () => null },
  "./delete-post-button": { DeletePostButton: () => null },
  react: {
    ...React,
    useState(initial) { const index = stateIndex++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; },
    useRef(initial) { const index = refIndex++; return refs[index] ?? (refs[index] = { current: initial }); },
    useCallback: callback => callback,
    useEffect(callback, deps) { const index = effectIndex++; const prior = effects[index]; if (!prior || deps.some((dep,i) => dep !== prior.deps[i])) effects[index] = { callback, deps, cleanup: prior?.cleanup, pending: true }; },
  },
});
function elements(node) { return !node || typeof node !== "object" ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(elements)]; }
function render() {
  stateIndex = refIndex = effectIndex = 0;
  const tree = elements(InfiniteFeed({ initialPosts: [pinned, boundary], initialCursor: encoded, userId: null, scope: "home" }));
  tree.find(node => node.props?.ref && node.type === "div").props.ref.current = {};
  for (const effect of effects) if (effect.pending) { effect.cleanup?.(); effect.cleanup = effect.callback(); effect.pending = false; }
  return tree;
}
function button(tree) { return tree.find(node => node.type === "button" && ["Load more memes", "Try again"].includes(node.props.children)); }
try {
  global.fetch = async () => { calls++; return await new Promise(resolve => { resolveRequest = resolve; }); };
  let tree = render();
  observer.callback([{ isIntersecting: true }]);
  observer.callback([{ isIntersecting: true }]);
  assert.equal(calls, 1, "Observer events cannot overlap requests");
  resolveRequest(Response.json({ posts: [boundary, post(19), post(19)], nextCursor: "next-cursor" }));
  await new Promise(resolve => setImmediate(resolve));
  tree = render();
  assert.equal(tree.filter(node => node.type === "article").length, 3, "Append once without duplicate IDs");
  global.fetch = async () => { calls++; return Response.json({ error: "Temporary failure" }, { status: 503 }); };
  await button(tree).props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  tree = render();
  assert.ok(tree.some(node => node.props?.role === "alert" && node.props.children === "Temporary failure"));
  assert.equal(observer.observing, false, "Pause automatic retries after an error");
  assert.equal(tree.filter(node => node.type === "article").length, 3, "Failures preserve loaded posts");
  global.fetch = async () => Response.json({ posts: [post(18)], nextCursor: null });
  button(tree).props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  tree = render();
  assert.equal(tree.filter(node => node.type === "article").length, 4);
  assert.equal(button(tree), undefined, "Stop loading at the end");
  assert.ok(tree.some(node => node.props?.role === "status" && node.props.children === "You’re all caught up."));
} finally {
  for (const effect of effects) effect.cleanup?.();
  global.fetch = originalFetch;
  global.IntersectionObserver = originalObserver;
}
console.log("Passed infinite feed checks: stable cursor boundaries, tied timestamps, insert/delete resilience, pinned exclusion, context privacy, authenticated ownership, validation, cache isolation, observer loading, duplicate prevention, retries, and end-of-feed stopping.");
