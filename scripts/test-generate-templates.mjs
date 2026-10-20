// Exercise the Generate image-source flow with real sample bytes and mocked API calls.
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
const samples = load("app/trial/samples.ts");
const validation = load("app/posts/upload-validation.ts");
let state = [];
let refs = [];
let cursor = 0;
let refCursor = 0;
const mockReact = {
  ...React,
  useState(initial) {
    const index = cursor++;
    if (!(index in state)) state[index] = initial;
    return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
  },
  useRef(initial) { const index = refCursor++; return refs[index] ?? (refs[index] = { current: initial }); },
  useEffect() {},
};
function elements(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...React.Children.toArray(node.props?.children).flatMap(elements)];
}
function Picker() { return null; }
const navigated = [];
let refreshed = 0;
const { UploadForm } = load("app/posts/upload-form.tsx", {
  react: mockReact,
  "next/navigation": { useRouter: () => ({ replace: path => navigated.push(path), refresh: () => refreshed++ }) },
  "next/link": ({ href, children }) => React.createElement("a", { href }, children),
  "./sample-picker": { SamplePicker: Picker },
  "@/app/trial/samples": samples,
  "./upload-validation": validation,
});
function render() { cursor = 0; refCursor = 0; return elements(UploadForm()); }
function button(label) { return render().find(node => node.type === "button" && node.props.children === label); }
const originalFetch = global.fetch;
const gif = fs.readFileSync("memes/cat_giphy.gif");
let failSample = false;
let postCalls = 0;
let expectedContext = "";
let expectedBytes = gif;
let expectedType = "image/gif";
let sampleCalls = 0;
let publishFails = false;
global.fetch = async (url, options) => {
  if (url === "/api/samples/dancing-cat") {
    sampleCalls++;
    return failSample ? new Response("Unavailable", { status: 500 }) : new Response(gif, { headers: { "Content-Type": "image/gif" } });
  }
  assert.equal(url, "/api/posts");
  assert.equal(options.method, "POST");
  const body = options.body;
  assert.ok(body instanceof FormData);
  assert.equal(body.get("context"), expectedContext);
  assert.equal(body.get("image").type, expectedType);
  assert.deepEqual(Buffer.from(await body.get("image").arrayBuffer()), expectedBytes);
  if (body.get("action") === "publish") {
    assert.equal(body.get("caption"), "One joke.");
    assert.equal(body.get("reviewToken"), "review-token");
    return publishFails
      ? new Response(JSON.stringify({ error: "Could not post." }), { status: 500 })
      : new Response(JSON.stringify({ post: { id: "published-post" } }), { status: 201 });
  }
  postCalls++;
  return new Response(JSON.stringify({ captions: ["One joke.", "Another joke.", "A third joke."], reviewToken: "review-token" }), { status: 200 });
};
async function generate() {
  await render().find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
}
try {
  assert.ok(render().some(node => node.type === Picker));
  assert.equal(render().some(node => node.type === "input" && node.props.type === "file"), false);
  assert.equal(button("Generate captions").props.disabled, true);
  await render().find(node => node.type === Picker).props.onSelect("dancing-cat");
  assert.equal(sampleCalls, 1);
  assert.equal(button("Generate captions").props.disabled, false);
  assert.ok(button("Change template"));
  assert.equal(render().some(node => node.type === Picker), false, "Collapse the gallery after a successful selection");
  await generate();
  assert.equal(postCalls, 1, "A template generates with empty optional context");
  assert.equal(render().filter(node => node.type === "input" && node.props.type === "radio").length, 3);
  render().find(node => node.type === "input" && node.props.type === "radio").props.onChange();
  assert.equal(button("Post to feed").props.disabled, false);
  expectedContext = "Celebrating the end of midterms.";
  render().find(node => node.type === "textarea").props.onChange({ target: { value: expectedContext } });
  assert.equal(render().some(node => node.type === "input" && node.props.type === "radio"), false, "Changing context invalidates earlier choices");
  await generate();
  assert.equal(postCalls, 2, "A template accepts optional context too");

  button("Change template").props.onClick();
  failSample = true;
  await render().find(node => node.type === Picker).props.onSelect("dancing-cat");
  assert.ok(render().some(node => node.props?.role === "alert" && node.props.children.includes("template could not be loaded")));
  assert.equal(button("Generate captions").props.disabled, true, "A failed download must not reuse the previous template");
  button("Upload your own").props.onClick();
  const upload = render().find(node => node.type === "input" && node.props.type === "file");
  assert.equal(upload.props.required, true);
  expectedBytes = Buffer.from([0xff, 0xd8, 0xff, 0x01]);
  expectedType = "image/jpeg";
  upload.props.onChange({ target: { files: [new File([expectedBytes], "my-photo.jpg", { type: expectedType })] } });
  assert.equal(button("Generate captions").props.disabled, false);
  await generate();
  assert.equal(postCalls, 3);
  render().find(node => node.type === "input" && node.props.type === "radio").props.onChange();
  publishFails = true;
  await button("Post to feed").props.onClick();
  assert.deepEqual(navigated, [], "A failed post must keep the user in the editor");
  publishFails = false;
  await button("Post to feed").props.onClick();
  assert.deepEqual(navigated, ["/#post-published-post"]);
  assert.equal(refreshed, 1, "A successful post refreshes the community feed");
  button("Use a template").props.onClick();
  assert.equal(button("Generate captions").props.disabled, true);
  assert.equal(render().some(node => node.type === "input" && node.props.type === "radio"), false);
  assert.ok(render().some(node => node.type === Picker));

  // Verify the real gallery filters and paginates the same catalog used by guests.
  state = []; refs = [];
  const { SamplePicker } = load("app/posts/sample-picker.tsx", { react: mockReact, "@/app/trial/samples": samples });
  function renderPicker() { cursor = 0; refCursor = 0; return elements(SamplePicker({ selectedId: null, onSelect() {} })); }
  assert.equal(renderPicker().filter(node => node.type === "img").length, 8);
  renderPicker().find(node => node.type === "button" && node.props.children === "GIFs").props.onClick();
  for (const node of renderPicker().filter(node => node.type === "img")) {
    const id = node.props.src.split("/").at(-1).split("?")[0];
    assert.equal(samples.getSample(id).mimeType, "image/gif");
    assert.ok(node.props.src.endsWith("?preview=1"));
  }
  renderPicker().find(node => node.type === "button" && node.props.children === "Next").props.onClick();
  assert.equal(renderPicker().filter(node => node.type === "img").length, Math.min(8, samples.SAMPLES.filter(sample => sample.mimeType === "image/gif").length - 8));
  console.log("Passed Generate checks: template gallery/filter/pagination, original GIF download, templates with and without context, caption invalidation, upload switching, and failed template recovery.");
} finally { global.fetch = originalFetch; }
