import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
const requireDependency = createRequire(import.meta.url);
function load(path, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(name => Object.hasOwn(imports, name) ? imports[name] : requireDependency(name), mod, mod.exports);
  return mod.exports;
}
const oldSecret = process.env.AUTH_ACTION_SECRET;
process.env.AUTH_ACTION_SECRET = "test-only-pending-vote-secret";
const pending = load("app/auth/pending-vote.ts", { "server-only": {}, "./return-path": load("app/auth/return-path.ts") });
const id = "12345678-1234-1234-1234-123456789abc";
const returnTo = `/posts/${id}`;
let user = { id: "signed-in-user" }, visible = true, writeFails = false, authFails = false, writes = 0, profilesOkay = true;
const votes = new Map(), jar = new Map(), invalidated = [];
const client = {
  auth: { exchangeCodeForSession: async () => ({ error: authFails ? new Error("Bad code") : null }), getUser: async () => ({ data: { user } }) },
  from(table) {
    if (table === "home_feed") return { select: () => ({ eq: (key, value) => {
      assert.equal(key, "id"); assert.equal(value, id); return { maybeSingle: async () => ({ data: visible ? { id } : null, error: null }) };
    } }) };
    assert.equal(table, "post_hearts");
    return { upsert: async (row, options) => {
      writes++; assert.equal(row.post_id, id); assert.equal(row.user_id, user.id);
      assert.equal(options.onConflict, "post_id,user_id");
      if (!writeFails) votes.set(row.user_id, row.vote);
      return { error: writeFails ? { code: "offline" } : null };
    } };
  },
};
const cookies = { get: name => jar.has(name) ? { value: jar.get(name) } : undefined, delete: name => jar.delete(name) };
const intent = pending.createPendingVote(id, 1, returnTo);
assert.equal(pending.readPendingVote(intent.token).vote, 1);
assert.equal(pending.readPendingVote(intent.token + "x"), null);
const now = Date.now;
Date.now = () => now() + 11 * 60 * 1000;
assert.equal(pending.readPendingVote(intent.token), null);
Date.now = now;
assert.equal(pending.readPendingVote(pending.createPendingVote(id, -1, "https://evil.example").token).returnTo, "/");
assert.throws(() => pending.createPendingVote(id, 0, returnTo), /Invalid/);

const { POST } = load("app/api/auth/pending-vote/route.ts", {
  "next/headers": { cookies: async () => cookies }, "@/app/supabase/server": { createClient: () => client }, "@/app/auth/pending-vote": pending,
});
function prepare(body = { postId: id, vote: 1, returnTo }, origin = "https://app.example") {
  return POST(new Request("https://app.example/api/auth/pending-vote", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}
assert.equal((await prepare(undefined, "https://evil.example")).status, 403);
assert.equal((await prepare({ postId: id, vote: 0, returnTo })).status, 400);
visible = false; assert.equal((await prepare()).status, 404); visible = true;
const prepared = await prepare();
assert.equal(prepared.status, 200); assert.equal(writes, 0, "Preparing sign-in must not write a guest vote");
const cookie = prepared.cookies.get(pending.PENDING_VOTE_COOKIE);
assert.equal(cookie.httpOnly, true); assert.equal(cookie.secure, true); assert.equal(cookie.sameSite, "lax");
assert.equal(cookie.maxAge, 600);
assert.equal((await prepared.json()).intentId, pending.readPendingVote(cookie.value).id);

class Redirect extends Error { constructor(path) { super(path); this.path = path; } }
const { GET } = load("app/auth/callback/route.ts", {
  "@/app/auth/default-profile": { ensureDefaultProfile: async () => profilesOkay },
  "@/app/trial/guest-session": { GUEST_COOKIE: "guest", readGuestSession: () => null },
  "@/app/trial/pending-share": { PENDING_SHARE_COOKIE: "share", readPendingShare: () => null },
  "@/app/auth/return-path": load("app/auth/return-path.ts"),
  "@/app/auth/pending-vote": pending,
  "next/headers": { cookies: async () => cookies },
  "next/navigation": { redirect: path => { throw new Redirect(path); } },
  "next/cache": { revalidatePath: path => invalidated.push(path) },
  "@/app/supabase/server": { createClient: () => client },
});
async function callback(token, intentId, code = "test") {
  if (token) jar.set(pending.PENDING_VOTE_COOKIE, token);
  const url = new URL("https://app.example/auth/callback");
  url.searchParams.set("next", returnTo);
  if (intentId) url.searchParams.set("voteIntent", intentId);
  if (code) url.searchParams.set("code", code);
  try { await GET(new Request(url)); assert.fail("Expected redirect"); }
  catch (error) { if (error instanceof Redirect) return error.path; throw error; }
}
assert.equal(await callback(intent.token, intent.id), returnTo);
assert.equal(votes.get(user.id), 1); assert.equal(jar.has(pending.PENDING_VOTE_COOKIE), false);
assert.ok(invalidated.includes(returnTo));
const afterFirst = writes;
await callback(null, intent.id); assert.equal(writes, afterFirst, "Consumed cookies cannot replay a vote");
await callback(intent.token, intent.id); assert.equal(votes.size, 1); assert.equal(votes.get(user.id), 1, "Retrying the same action cannot add another point");
const down = pending.createPendingVote(id, -1, returnTo);
assert.equal(await callback(down.token, down.id), returnTo); assert.equal(votes.get(user.id), -1);
const beforeInvalid = writes;
await callback(intent.token, "wrong-nonce"); await callback(intent.token, null); await callback(intent.token + "x", intent.id);
assert.equal(writes, beforeInvalid, "Unrelated login and tampered intents must not write");
authFails = true; assert.equal(await callback(intent.token, intent.id), "/"); authFails = false;
assert.equal(writes, beforeInvalid);
assert.equal(await callback(intent.token, intent.id, null), "/"); assert.equal(writes, beforeInvalid);
user = null; assert.equal(await callback(intent.token, intent.id), "/"); user = { id: "signed-in-user" };
assert.equal(writes, beforeInvalid);
visible = false; assert.equal(await callback(intent.token, intent.id), returnTo); visible = true;
assert.equal(writes, beforeInvalid, "Deleted posts are never voted on");
writeFails = true; assert.equal(await callback(intent.token, intent.id), `${returnTo}?voteRetry=1`); writeFails = false;
assert.equal(votes.get(user.id), -1, "Failed writes preserve the old vote");
profilesOkay = false; assert.match(await callback(intent.token, intent.id), /^\/profile\?next=/); profilesOkay = true;

// The UI remembers the clicked direction without making an unauthenticated write.
function elements(node) { return !node || typeof node !== "object" ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(elements)]; }
let state = [], index = 0, refs = [], refIndex = 0;
const hooks = { ...React, useState(initial) { const i = index++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value; }]; }, useRef(initial) { const i = refIndex++; return refs[i] ?? (refs[i] = { current: initial }); } };
function AuthStub() { return null; }
const { VoteButtons } = load("app/posts/vote-buttons.tsx", { react: hooks, "@/app/auth/auth-controls": { AuthControls: AuthStub } });
function renderVotes() { index = refIndex = 0; return elements(VoteButtons({ postId: id, initialScore: 0, initialVote: 0, available: true, isSignedIn: false, returnTo })); }
renderVotes().filter(node => node.type === "button")[1].props.onClick();
assert.equal(renderVotes().find(node => node.type === AuthStub).props.pendingVote.vote, -1);
renderVotes().filter(node => node.type === "button")[0].props.onClick();
assert.equal(renderVotes().find(node => node.type === AuthStub).props.pendingVote.vote, 1);

const originalFetch = global.fetch, originalWindow = global.window;
let oauthCalls = 0, preparationFails = false;
global.window = { location: { origin: "https://app.example", pathname: "/", search: "" } };
global.fetch = async (url, options) => {
  assert.equal(url, "/api/auth/pending-vote"); assert.deepEqual(JSON.parse(options.body), { postId: id, vote: -1, returnTo });
  return Response.json(preparationFails ? { error: "Try later" } : { intentId: down.id }, { status: preparationFails ? 503 : 200 });
};
const { AuthControls } = load("app/auth/auth-controls.tsx", {
  react: { ...React, useState: initial => [initial, () => {}] },
  "@/app/trial/use-trial-draft": { clearTrialDraft() {} },
  "@/app/auth/return-path": load("app/auth/return-path.ts"),
  "@/app/supabase/client": { createClient: () => ({ auth: { signInWithOAuth: async ({ options }) => {
    oauthCalls++; const url = new URL(options.redirectTo);
    assert.equal(url.origin, "https://app.example"); assert.equal(url.searchParams.get("voteIntent"), down.id); assert.equal(url.searchParams.get("next"), returnTo);
    return { error: null };
  } } }) },
});
try {
  const auth = () => elements(AuthControls({ isSignedIn: false, returnTo, pendingVote: { postId: id, vote: -1 } }));
  await auth().find(node => node.type === "button").props.onClick(); assert.equal(oauthCalls, 1);
  preparationFails = true; await auth().find(node => node.type === "button").props.onClick(); assert.equal(oauthCalls, 1, "Do not start OAuth if preserving the vote fails");
} finally {
  global.fetch = originalFetch; if (originalWindow === undefined) delete global.window; else global.window = originalWindow;
  if (oldSecret === undefined) delete process.env.AUTH_ACTION_SECRET; else process.env.AUTH_ACTION_SECRET = oldSecret;
}
// A failed post-login vote is retried only on an explicit click.
state = []; refs = []; index = refIndex = 0;
let retryCalls = 0, refreshes = 0, retryFails = true;
const { PendingVoteRetry } = load("app/posts/pending-vote-retry.tsx", {
  react: hooks, "next/navigation": { useRouter: () => ({ refresh() { refreshes++; } }) },
});
function retryTree() { index = refIndex = 0; return elements(PendingVoteRetry({ postId: id, vote: -1 })); }
try {
  global.fetch = async (url, options) => {
    retryCalls++; assert.equal(url, `/api/posts/${id}/vote`); assert.deepEqual(JSON.parse(options.body), { vote: -1 });
    return Response.json(retryFails ? { error: "Temporarily unavailable" } : { vote: -1, score: -1 }, { status: retryFails ? 503 : 200 });
  };
  assert.equal(retryCalls, 0);
  retryTree().find(node => node.type === "button").props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(refreshes, 0); assert.ok(retryTree().some(node => node.props?.role === "alert"));
  retryFails = false;
  retryTree().find(node => node.type === "button").props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(refreshes, 1); assert.equal(retryCalls, 2);
  assert.ok(retryTree().some(node => node.props?.children === "Your vote has been saved."));
  assert.equal(retryTree().some(node => node.type === "button"), false);
} finally { global.fetch = originalFetch; }
console.log("Passed pending vote checks: signed/expiring handoff, guest preparation, OAuth binding, up/down restoration, duplicate prevention, cancellation, unrelated login, missing posts, write failure, profile setup, and client direction preservation.");
