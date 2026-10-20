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
const { defaultFirstName, ensureDefaultProfile } = load("app/auth/default-profile.ts", { "server-only": {} });
assert.equal(defaultFirstName("sam.student@example.com"), "sam.student");
assert.equal(defaultFirstName("sam+campus@example.com"), "sam+campus");
assert.equal(defaultFirstName(undefined), "Campus contributor");
assert.equal(defaultFirstName(""), "Campus contributor");
assert.equal(defaultFirstName("x".repeat(90) + "@example.com").length, 80);
assert.equal(defaultFirstName("\u0000sam\n@example.com"), "sam");
let profile = null;
let readError = null;
let writeError = null;
let writes = 0;
let createRace = false;
const user = { id: "user-id", email: "sam.student@example.com" };
const client = { from(table) {
  assert.equal(table, "profiles");
  return {
    select: () => ({ eq: (key, id) => {
      assert.equal(key, "id"); assert.equal(id, user.id);
      return { maybeSingle: async () => ({ data: profile, error: readError }) };
    } }),
    upsert: async (row, options) => {
      writes++;
      assert.deepEqual(options, { onConflict: "id", ignoreDuplicates: true });
      if (createRace) profile = { first_name: "Edited concurrently", last_name: "User" };
      if (!writeError && !profile) profile = row;
      return { error: writeError };
    },
    update(row) {
      writes++;
      const filters = [];
      const query = {
        eq(field, value) { filters.push([field, value]); return this; },
        is(field, value) { filters.push([field, value]); return this; },
        then(resolve, reject) {
          assert.deepEqual(filters[0], ["id", user.id]);
          assert.deepEqual(filters[1], ["first_name", profile.first_name]);
          if (!writeError) profile = { ...profile, ...row };
          return Promise.resolve({ error: writeError }).then(resolve, reject);
        },
      };
      return query;
    },
  };
} };
assert.equal(await ensureDefaultProfile(client, user), true);
assert.equal(profile.first_name, "sam.student");
assert.equal(profile.last_name, null);
const createdWrites = writes;
profile = { first_name: "My edited name", last_name: "Surname", photo_url: "private/photo.png" };
assert.equal(await ensureDefaultProfile(client, user), true);
assert.equal(writes, createdWrites);
assert.equal(profile.first_name, "My edited name");
profile = { first_name: null, last_name: "Surname", photo_url: "private/photo.png" };
assert.equal(await ensureDefaultProfile(client, user), true);
assert.equal(profile.first_name, "sam.student");
assert.equal(profile.last_name, "Surname");
assert.equal(profile.photo_url, "private/photo.png");
profile = { first_name: "  ", last_name: null };
assert.equal(await ensureDefaultProfile(client, user), true);
assert.equal(profile.first_name, "sam.student");
profile = null;
createRace = true;
assert.equal(await ensureDefaultProfile(client, user), true);
assert.equal(profile.first_name, "Edited concurrently");
createRace = false;
readError = { code: "read_failed" };
assert.equal(await ensureDefaultProfile(client, user), false);
readError = null;
profile = null;
writeError = { code: "write_failed" };
assert.equal(await ensureDefaultProfile(client, user), false);
writeError = null;

let signedIn = true;
let savedProfile;
const { POST } = load("app/api/profile/route.ts", {
  "next/headers": { cookies: async () => ({}) },
  "@/app/supabase/server": { createClient: () => ({
    auth: { getUser: async () => ({ data: { user: signedIn ? user : null } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { photo_url: null }, error: null }) }) }),
      upsert: async row => { savedProfile = row; return { error: null }; },
    }),
  }) },
});
function request(firstName, lastName = "") {
  const body = new FormData(); body.set("first_name", firstName); body.set("last_name", lastName);
  return new Request("http://localhost/api/profile", { method: "POST", body });
}
assert.equal((await POST(request("Edited name"))).status, 200);
assert.equal(savedProfile.first_name, "Edited name");
assert.equal(savedProfile.last_name, null);
assert.equal((await POST(request("Edited name", "Surname"))).status, 200);
assert.equal(savedProfile.last_name, "Surname");
assert.equal((await POST(request("  "))).status, 400);
assert.equal((await POST(request("Edited name", "x".repeat(81)))).status, 400);
signedIn = false;
assert.equal((await POST(request("Edited name"))).status, 401);

const fetchBefore = global.fetch;
let formSaved = false;
global.fetch = async (url, options) => {
  assert.equal(url, "/api/profile");
  assert.equal(options.body.get("first_name"), "sam.student");
  assert.equal(options.body.get("last_name"), "");
  formSaved = true;
  return new Response(JSON.stringify({ message: "Profile saved." }), { status: 200 });
};
try {
  const { ProfileForm } = load("app/profile/profile-form.tsx", {
    react: { ...React, useState: initial => [initial, () => {}], useRef: initial => ({ current: initial }) },
    "next/navigation": { useRouter: () => ({ refresh() {}, push() {} }) },
  });
  const form = ProfileForm({ initialProfile: { firstName: "sam.student", lastName: "", signedPhotoUrl: null } });
  await form.props.onSubmit({ preventDefault() {} });
  assert.equal(formSaved, true, "The editor accepts a default first name with no surname");
} finally { global.fetch = fetchBefore; }
console.log("Passed profile checks: email username defaults, blank/missing profile recovery, preserving edited names/photos, concurrent creation, error recovery, optional surname, authenticated profile editing, and client form validation.");
