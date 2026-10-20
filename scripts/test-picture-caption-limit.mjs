import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
const dependency=createRequire(import.meta.url);
function load(path,imports={}){const code=ts.transpileModule(fs.readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;const mod={exports:{}};new Function("require","module","exports",code)(name=>Object.hasOwn(imports,name)?imports[name]:dependency(name),mod,mod.exports);return mod.exports;}
const limits=load("app/posts/caption-limits.ts");
const runs=load("app/posts/caption-run.ts",{"server-only":{},"./caption-limits":limits});
let user="account-a",providerCalls=0,providerFails=false;
const client={auth:{getUser:async()=>({data:{user:{id:user}},error:null})},storage:{from:()=>({upload:async()=>({error:null}),remove:async()=>({error:null})})},from:()=>({insert:row=>({select:()=>({single:async()=>({data:{id:row.id},error:null})})})})};
class CaptionError extends Error{}
const {POST}=load("app/api/posts/route.ts",{
 "next/headers":{cookies:async()=>({})},"next/cache":{revalidatePath(){}},"@/app/supabase/server":{createClient:()=>client},
 "@/app/posts/caption-run":runs,"@/app/posts/upload-validation":load("app/posts/upload-validation.ts"),
 "@/app/posts/caption-review":{createReview:()=>"review",verifyReview:()=>({captions:["Saved caption"],generation_prompt:"p",model:"m",prompt_version:"v"})},
 "@/app/posts/generate-caption":{CaptionError,generateCaption:async()=>{providerCalls++;if(providerFails)throw new Error("provider failed");return{captions:["A","B","C"]};}},
});
const bytes=Buffer.from([137,80,78,71,13,10,26,10]);
const other=Buffer.concat([bytes,Buffer.from([1])]);
const keyBefore=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY="test-key";
function request(token,image=bytes,fields={}){const body=new FormData();body.set("image",new File([image],"photo.png",{type:"image/png"}));if(token)body.set("generationToken",token);for(const[key,value]of Object.entries(fields))body.set(key,value);return new Request("http://localhost/api/posts",{method:"POST",body});}
try{
 let token;
 for(let i=1;i<=10;i++){const response=await POST(request(token,bytes,{context:`Context ${i}`}));assert.equal(response.status,200);const result=await response.json();assert.equal(result.captions.length,3);assert.equal(result.remainingCaptions,30-i*3);token=result.generationToken;}
 assert.equal(providerCalls,10);
 const blocked=await POST(request(token));assert.equal(blocked.status,429);assert.equal((await blocked.json()).remainingCaptions,0);assert.equal(providerCalls,10);
 assert.equal((await POST(request(token,bytes,{action:"publish",caption:"Saved caption",reviewToken:"review"}))).status,201,"The limit does not block publication");
 assert.equal((await(await POST(request(undefined,other))).json()).remainingCaptions,27,"Selecting B starts a fresh allowance");
 assert.equal((await(await POST(request(undefined,bytes))).json()).remainingCaptions,27,"Returning to A starts another fresh allowance");
 const beforeInvalid=providerCalls;
 assert.equal((await POST(request(token+"tampered"))).status,400);
 assert.equal((await POST(request(token,other))).status,400);
 user="account-b";assert.equal((await POST(request(token))).status,400);assert.equal(providerCalls,beforeInvalid);
 user="account-a";providerFails=true;const failure=await POST(request());assert.equal(failure.status,502);providerFails=false;
 assert.equal((await(await POST(request())).json()).remainingCaptions,27,"Failed requests do not issue a charged continuation");
 let guestToken;
 for(let i=0;i<10;i++)guestToken=runs.prepareCaptionRun(guestToken,"guest:visitor",bytes,"image/png").finish().generationToken;
 assert.throws(()=>runs.prepareCaptionRun(guestToken,"guest:visitor",bytes,"image/png"),error=>error.status===429);
 assert.equal(runs.prepareCaptionRun(undefined,"guest:visitor",bytes,"image/png").finish().remainingCaptions,27);
 const dateBefore=Date.now;try{Date.now=()=>dateBefore()+25*60*60*1000;assert.throws(()=>runs.prepareCaptionRun(token,"account-a",bytes,"image/png"),error=>error.status===400);}finally{Date.now=dateBefore;}
}finally{if(keyBefore===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=keyBefore;}
// The guest gallery also starts a new run when returning to an earlier sample.
const samples=load("app/trial/samples.ts");
const a=samples.SAMPLES[0].id,b=samples.SAMPLES[1].id;
let draft={sampleId:a,remaining:null,results:{[a]:{choices:Array.from({length:30},(_,i)=>({caption:`A ${i}`,reviewToken:"r"})),selected:"",remainingCaptions:0,generationToken:"old-run"}}};
let state=[],index=0;
const {TrialExperience}=load("app/trial/trial-experience.tsx",{
 "next/link":()=>null,"next/navigation":{useRouter:()=>({})},
 "./settings":{SAMPLE_TRY_LIMITS_ENABLED:false},"@/app/posts/caption-limits":limits,
 "@/app/auth/auth-controls":{AuthControls:()=>null},"./samples":samples,
 "./use-trial-draft":{useTrialDraft:()=>draft,saveTrialDraft:value=>{draft=value;return true;}},
 react:{...React,useState(initial){const i=index++;if(!(i in state))state[i]=initial;return[state[i],value=>{state[i]=value;}];},useRef:initial=>({current:initial})},
});
function elements(node){return !node||typeof node!=="object"?[]:[node,...React.Children.toArray(node.props?.children).flatMap(elements)];}
function render(){index=0;return elements(TrialExperience({isSignedIn:false}));}
function sampleButton(id){return render().find(node=>node.type==="button"&&elements(node).some(child=>child.type==="img"&&child.props.src===`/api/samples/${id}?preview=1`));}
const windowBefore=global.window;global.window={matchMedia:()=>({matches:false})};
try{
 assert.equal(render().find(node=>node.type==="button"&&node.props.children==="Request more captions").props.disabled,true);
 sampleButton(b).props.onClick();assert.equal(draft.sampleId,b);assert.equal(draft.results[b].choices.length,0);
 sampleButton(a).props.onClick();assert.equal(draft.sampleId,a);assert.equal(draft.results[a].choices.length,0);assert.equal(draft.results[a].generationToken,undefined);
 assert.equal(render().find(node=>node.type==="button"&&node.props.children==="Generate captions").props.disabled,false);
}finally{global.window=windowBefore;}
console.log("Passed caption run checks: 30 captions, blocked continuation, publish at limit, A→B→A resets, signed owner/image binding, expiry, failed request retry, and guest limits.");
