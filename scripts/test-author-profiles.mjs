import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
const dependency = createRequire(import.meta.url);
function load(path, imports = {}) {
 const code = ts.transpileModule(fs.readFileSync(path,"utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
 const mod = { exports: {} };
 new Function("require","module","exports",code)(name => Object.hasOwn(imports,name) ? imports[name] : dependency(name),mod,mod.exports);
 return mod.exports;
}
const id = "00000000-0000-0000-0000-000000000001";
const sharp = dependency("sharp");
const { createHash } = dependency("node:crypto");
const avatarVersion = path => createHash("sha256").update(path).digest("hex").slice(0, 24);
let row = { first_name: " Sam ", last_name: " Student ", photo_url: `${id}/profile.png` }, dbError = null, dbCalls = 0, downloads = 0, downloadFails = false;
const query = {
 select(fields) { assert.ok(["first_name, last_name, photo_url", "photo_url"].includes(fields)); return query; },
 eq(field,value) { assert.equal(field,"id"); assert.equal(value,id); return query; },
 maybeSingle: async () => ({ data: row, error: dbError }),
};
const originalImage = await sharp({ create: { width: 800, height: 600, channels: 3, background: "pink" } }).png().toBuffer();
const client = {
 from(table) { dbCalls++; assert.equal(table,"author_profiles"); return query; },
 storage: { from(bucket) { assert.equal(bucket,"photos"); return { download: async path => {
  downloads++; assert.equal(path, row.photo_url); return { data: downloadFails ? null : new Blob([originalImage]), error: downloadFails ? new Error("offline") : null };
 } }; } },
};
const serverImports = {
 "next/headers": { cookies: async () => ({}) },
 "@/app/supabase/server": { createClient: () => client },
 "@/app/profile/account-data": { avatarVersion },
};
const { GET } = load("app/api/authors/[id]/route.ts", serverImports);
const { GET: getPhoto } = load("app/api/authors/[id]/photo/route.ts", serverImports);
const request = value => GET(new Request("http://localhost"),{ params:Promise.resolve({id:value}) });
const photoRequest = version => getPhoto(new Request(`http://localhost/api/authors/${id}/photo?v=${version ?? avatarVersion(row?.photo_url ?? "missing")}`), { params: Promise.resolve({ id }) });
assert.equal((await request("../../secret")).status,400);
assert.equal(dbCalls,0);
let response = await request(id);
assert.equal(response.headers.get("Cache-Control"),"private, no-store");
const profile = await response.json();
assert.deepEqual(profile,{name:"Sam Student",photoUrl:`/api/authors/${id}/photo?v=${avatarVersion(row.photo_url)}`});
assert.deepEqual(await (await request(id)).json(), profile, "Repeated profile loads reuse a stable thumbnail URL");
assert.equal(downloads, 0, "Profile lookup no longer signs or downloads a full photo");
response = await photoRequest();
assert.equal(response.status,200);
assert.equal(response.headers.get("Cache-Control"),"private, max-age=300");
assert.equal(response.headers.get("Vary"),"Cookie");
const thumbnail = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
assert.equal(thumbnail.format,"webp"); assert.equal(thumbnail.width,192); assert.equal(thumbnail.height,192);
const downloadsBefore = downloads;
assert.equal((await photoRequest("expired-version")).status,404);
for (const path of [null,"another-user/photo.png",`${id}/../secret.png`,"https://example.com/photo.png"]) {
 row.photo_url=path;
 assert.equal((await (await request(id)).json()).photoUrl,null);
 assert.equal((await photoRequest()).status,404);
 assert.equal(downloads,downloadsBefore,"Never fetch arbitrary or outdated photo paths");
}
row={ first_name:null,last_name:null,photo_url:null };
assert.equal((await (await request(id)).json()).name,"Campus contributor");
row.photo_url=`${id}/new-photo.png`;
assert.notEqual((await (await request(id)).json()).photoUrl,profile.photoUrl,"Changed photos get a fresh URL");
downloadFails=true;
response=await photoRequest(); assert.equal(response.status,503); assert.equal(response.headers.get("Cache-Control"),"no-store"); downloadFails=false;
row=null;
assert.equal((await request(id)).status,404); assert.equal((await photoRequest()).status,404);
dbError={code:"PGRST205"};
assert.equal((await request(id)).status,503); assert.equal((await photoRequest()).status,503);

const originalFetch = global.fetch;
const originalImageConstructor = global.Image;
const preloadedImages = [];
global.Image = class { set src(value) { preloadedImages.push(value); } };
try {
 let calls = 0;
 global.fetch=async () => { calls++; return Response.json({name:"Sam Student",photoUrl:"/thumbnail.webp"}); };
 const { loadAuthorProfile } = load("app/posts/author-profile-data.ts");
 const requests = await Promise.all([loadAuthorProfile(id),loadAuthorProfile(id)]);
 assert.equal(calls,1,"Authors shared by multiple cards share a request");
 assert.equal(requests[0].name,"Sam Student");
 await loadAuthorProfile(id);
 assert.equal(calls,1,"Successful profiles are cached briefly");
 assert.deepEqual(preloadedImages,["/thumbnail.webp"],"Loading a profile also preloads its image, once per shared request");
 global.fetch=async () => { calls++; return Response.json({error:"Try later"},{status:503}); };
 await assert.rejects(loadAuthorProfile("other"),/Try later/);
 global.fetch=async () => { calls++; return Response.json({name:"Recovered",photoUrl:null}); };
 assert.equal((await loadAuthorProfile("other")).name,"Recovered","Failures are retryable");
} finally { global.fetch=originalFetch; if (originalImageConstructor === undefined) delete global.Image; else global.Image=originalImageConstructor; }

// Exercise focus, tap, dismissal, fallback images, and asynchronous results.
let state=[],refs=[],stateIndex=0,refIndex=0,cleanup=[],fetches=0;
let resolveProfile;
const { AuthorProfilePopover } = load("app/posts/author-profile.tsx", {
 react:{ ...React,
  useId:()=>"test-profile",
  useState(initial) { const i=stateIndex++; if(!(i in state)) state[i]=initial; return [state[i],value=>{state[i]=value;}]; },
  useRef(initial) { const i=refIndex++; return refs[i]??(refs[i]={current:initial}); },
  useEffect(callback) { const result=callback(); if(result)cleanup.push(result); },
 },
 "./author-profile-data":{loadAuthorProfile:()=>{fetches++;return new Promise(resolve=>{resolveProfile=resolve;});}},
});
function elements(node) { return !node || typeof node!=="object" ? [] : [node,...React.Children.toArray(node.props?.children).flatMap(elements)]; }
function render() { stateIndex=refIndex=0; return elements(AuthorProfilePopover({authorId:id,authorName:"Sam"})); }
const beforeWindow = global.window;
global.window={innerWidth:400,innerHeight:800,addEventListener(){},removeEventListener(){}};
let shown=false,focused=false,triggerFocusHandler;
const panel={showPopover(){shown=true;},hidePopover(){shown=false;},contains:target=>target==="inside"};
const trigger={getBoundingClientRect:()=>({left:350,bottom:730}),focus(){focused=true;triggerFocusHandler?.({relatedTarget:null});}};
try {
 let tree=render();
 const button=tree.find(node=>node.type==="button"&&node.props["aria-haspopup"]==="dialog");
 const popover=tree.find(node=>node.props?.popover==="auto");
 triggerFocusHandler=button.props.onFocus;
 button.props.ref.current=trigger;
 popover.props.ref.current=panel;
 button.props.onFocus({relatedTarget:null});
 assert.equal(shown,true,"Keyboard focus opens the card");
 assert.equal(fetches,1);
 button.props.onClick();
 assert.equal(fetches,1,"Tap while loading cannot start another request");
 tree=render();
 const position=tree.find(node=>node.props?.popover==="auto").props.style;
 assert.ok(position.left>=12 && position.left+288<=388,"Popover fits a narrow viewport");
 assert.ok(tree.some(node=>node.props?.role==="status"));
 resolveProfile({name:"Sam Student",photoUrl:"/profile.png"});
 await new Promise(resolve=>setImmediate(resolve));
 tree=render();
 assert.ok(tree.some(node=>node.type==="h3"&&node.props.children==="Sam Student"));
 const photo=tree.find(node=>node.type==="img");
 assert.equal(photo.props.src,"/profile.png");
 photo.props.onError();
 assert.equal(render().some(node=>node.type==="img"),false,"Broken photos fall back to initials");
 tree.find(node=>node.props?.["aria-label"]==="Close profile").props.onClick();
 assert.equal(shown,false);
 assert.equal(focused,true,"Closing restores keyboard focus");
 button.props.onFocus({relatedTarget:"inside"});
 assert.equal(shown,false,"Restoring focus must not reopen the popover");
 button.props.onFocus({relatedTarget:null});
 assert.equal(shown,false,"Mobile focus restoration without relatedTarget must stay dismissed");
 button.props.onPointerEnter({pointerType:"touch"});
 assert.equal(shown,false,"Touch pointer entry must not reopen the popup");
 button.props.onClick();
 assert.equal(shown,true,"A fresh tap on the author must still reopen the popup");
 popover.props.onBeforeToggle({newState:"closed"});
 panel.hidePopover();
 button.props.onFocus({relatedTarget:null});
 assert.equal(shown,false,"Outside/Escape dismissal also blocks automatic focus reopening");
 button.props.onBlur({relatedTarget:null});
 button.props.onFocus({relatedTarget:null});
 assert.equal(shown,true,"Returning with keyboard focus after leaving the trigger still works");
} finally {
 cleanup.forEach(fn=>fn());
 global.window=beforeWindow;
}
// Only visible/nearby author names preload; hover starts loading before opening.
const previousObserver = global.IntersectionObserver;
let observer, backgroundRequests=0, popupOpens=0;
const effects=[];
const cleanupPreload=[];
global.window={innerWidth:400,innerHeight:800,addEventListener(){},removeEventListener(){}};
global.IntersectionObserver=class {
 constructor(callback) { this.callback=callback; observer=this; }
 observe(target) { assert.ok(target); }
 disconnect() { this.disconnected=true; }
};
try {
 const {AuthorProfilePopover:PreloadPopover}=load("app/posts/author-profile.tsx",{
  react:{...React,useId:()=>"preload",useState:initial=>[initial,()=>{}],useRef:initial=>({current:initial}),useEffect:fn=>effects.push(fn)},
  "./author-profile-data":{loadAuthorProfile:()=>{backgroundRequests++;return Promise.resolve({name:"Sam",photoUrl:"/thumbnail.webp"});}},
 });
 const tree=elements(PreloadPopover({authorId:id,authorName:"Sam"}));
 const trigger=tree.find(node=>node.type==="button"&&node.props["aria-haspopup"]==="dialog");
 const popover=tree.find(node=>node.props?.popover==="auto");
 trigger.props.ref.current={getBoundingClientRect:()=>({left:20,bottom:100})};
 popover.props.ref.current={showPopover(){popupOpens++;}};
 effects.forEach(fn=>{const cleanup=fn();if(cleanup)cleanupPreload.push(cleanup);});
 assert.equal(backgroundRequests,0,"Offscreen cards do not preload authors");
 observer.callback([{isIntersecting:false}]);assert.equal(backgroundRequests,0);
 observer.callback([{isIntersecting:true}]);assert.equal(backgroundRequests,1);assert.equal(observer.disconnected,true);
 trigger.props.onPointerEnter({pointerType:"mouse"});
 assert.equal(backgroundRequests,2,"Pointer entry begins loading during the hover delay");
 assert.equal(popupOpens,0,"Keep the short delay to prevent accidental popup opening");
}finally{
 cleanupPreload.forEach(fn=>fn());
 global.window=beforeWindow;
 if(previousObserver===undefined)delete global.IntersectionObserver;else global.IntersectionObserver=previousObserver;
}
console.log("Passed author profile checks: restricted lookup, stable thumbnail URLs, small WebP photos, missing profiles/photos, cache/deduplication, visible-card/image preloading, immediate hover loading, retry, focus/tap opening, responsive positioning, image fallback, mobile null-target focus restoration, touch reopening, native dismissal, and keyboard re-entry.");
