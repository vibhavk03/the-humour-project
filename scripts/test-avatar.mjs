import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
const dependency = createRequire(import.meta.url);
function load(path, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(name => Object.hasOwn(imports, name) ? imports[name] : dependency(name), mod, mod.exports);
  return mod.exports;
}
const userId = "12345678-1234-1234-1234-123456789abc";
let user = { id: userId, email: "alex@example.com" };
let row = { first_name: "Alex", last_name: "Smith", photo_url: `${userId}/profile-1.jpg` };
let reads = 0, downloads = 0, storageError = false, profileError = false;
const image = await sharp({ create: { width: 600, height: 400, channels: 3, background: "pink" } }).jpeg().toBuffer();
const client = {
  auth: { getUser: async () => ({ data: { user } }) },
  from(table) { assert.equal(table, "profiles"); return { select: () => ({ eq(key, id) {
    assert.equal(key, "id"); assert.equal(id, user.id);
    return { maybeSingle: async () => { reads++; return { data: row, error: profileError ? { code: "offline" } : null }; } };
  } }) }; },
  storage: { from(bucket) { assert.equal(bucket, "photos"); return { download: async path => {
    downloads++; assert.equal(path, row.photo_url);
    return { data: storageError ? null : new Blob([image]), error: storageError ? { code: "offline" } : null };
  } }; } },
};
// Simulate request-scoped React memoization. Reset between separate requests.
let requestCache = new Map();
const accountData = load("app/profile/account-data.ts", {
  "server-only": {}, react: { cache: fn => (...args) => { const key = JSON.stringify(args); if (!requestCache.has(key)) requestCache.set(key, fn(...args)); return requestCache.get(key); } },
  "next/headers": { cookies: async () => ({}) }, "@/app/supabase/server": { createClient: () => client },
  "@/app/auth/default-profile": { defaultFirstName: email => email?.split("@")[0] || "Campus contributor" },
});
const { avatarUrl, avatarVersion, getCurrentAccount } = accountData;
const originalUrl = avatarUrl(userId, row.photo_url);
assert.equal(originalUrl, avatarUrl(userId, row.photo_url), "The same photo always has the same URL");
assert.equal(avatarUrl(userId, null), null);
assert.equal(avatarUrl(userId, "someone-else/photo.jpg"), null);
assert.notEqual(originalUrl, avatarUrl(userId, `${userId}/profile-2.jpg`));
assert.doesNotMatch(originalUrl, /token|profile-1.jpg/);
const [account, again] = await Promise.all([getCurrentAccount(), getCurrentAccount()]);
assert.deepEqual(account, again); assert.equal(reads, 1);
assert.equal(account.photoUrl, originalUrl);
assert.equal(downloads, 0, "Loading account data does not download or sign full photos");

const provider = load("app/profile/account-provider.tsx");
const avatar = load("app/profile/avatar.tsx");
const { AccountPageHeader } = load("app/posts/feed-header.tsx", {
  "next/link": ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children),
  "@/app/navigation": { Navigation: () => null },
  "@/app/profile/account-provider": provider, "@/app/profile/avatar": avatar,
});
function headerHtml(account) {
  return renderToStaticMarkup(React.createElement(provider.AccountProvider, { account },
    React.createElement(AccountPageHeader, { title: "Home Feed", description: "Hello", firstName: "Fallback", photoUrl: null })));
}
let html = headerHtml(account);
assert.match(html, /Hey, Alex/); assert.match(html, /AS/); assert.match(html, /api\/profile\/avatar/);
requestCache.clear(); row = { ...row, first_name: "Updated", photo_url: `${userId}/profile-2.jpg` };
const updated = await getCurrentAccount();
html = headerHtml(updated);
assert.match(html, /Hey, Updated/); assert.doesNotMatch(html, /Hey, Alex/);
assert.notEqual(updated.photoUrl, account.photoUrl);
requestCache.clear(); row.photo_url = null;
html = headerHtml(await getCurrentAccount());
assert.doesNotMatch(html, /<img/); assert.match(html, /US/);
requestCache.clear(); user = null;
assert.equal(await getCurrentAccount(), null);
user = { id: userId, email: "alex@example.com" }; row.photo_url = `${userId}/profile-3.jpg`;

const { GET } = load("app/api/profile/avatar/route.ts", {
  "next/headers": { cookies: async () => ({}) }, "@/app/supabase/server": { createClient: () => client },
  "@/app/profile/account-data": accountData,
});
const request = (who = userId, version = avatarVersion(row.photo_url)) => new Request(`https://example.com/api/profile/avatar?user=${who}&v=${version}`);
let response = await GET(request());
assert.equal(response.status, 200);
assert.equal(response.headers.get("cache-control"), "private, max-age=3600");
assert.equal(response.headers.get("vary"), "Cookie");
const thumbnail = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
assert.equal(thumbnail.format, "webp"); assert.equal(thumbnail.width, 128); assert.equal(thumbnail.height, 128);
const downloaded = downloads;
assert.equal((await GET(request("another-account"))).status, 404);
assert.equal((await GET(request(userId, "old-version"))).status, 404);
row.photo_url = "other-account/private.jpg";
assert.equal((await GET(request())).status, 404);
assert.equal(downloads, downloaded, "Foreign accounts and old photos must not be downloaded");
row.photo_url = `${userId}/profile-3.jpg`;
user = null; response = await GET(request());
assert.equal(response.status, 401); assert.equal(response.headers.get("cache-control"), "no-store");
user = { id: userId };
profileError = true; assert.equal((await GET(request())).status, 503); profileError = false;
storageError = true; response = await GET(request());
assert.equal(response.status, 503); assert.equal(response.headers.get("cache-control"), "no-store");
console.log("Passed avatar checks: stable versioned URLs, request deduplication, shared profile updates/removal, guest/account isolation, private caching, resized thumbnails, stale-version rejection and failures.");
