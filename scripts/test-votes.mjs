import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
const dependency = createRequire(import.meta.url);
function load(path, imports = {}) {
 const code=ts.transpileModule(fs.readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const mod={exports:{}};
 new Function("require","module","exports",code)(name=>Object.hasOwn(imports,name)?imports[name]:dependency(name),mod,mod.exports);
 return mod.exports;
}
const id="12345678-1234-1234-1234-123456789012";
let user="user-a",authError=null,visible=true,postError=null,writeError=null,statsError=null;
let writes=0;
const votes=new Map();
const invalidated=[];
const client={
 auth:{getUser:async()=>({data:{user:user?{id:user}:null},error:authError})},
 from(table){
  if(table==="home_feed") return {select:()=>({eq:()=>({maybeSingle:async()=>({data:visible?{id}:null,error:postError})})})};
  assert.equal(table,"post_hearts");
  return {
   upsert:async(row,options)=>{writes++;assert.equal(row.post_id,id);assert.equal(row.user_id,user);assert.deepEqual(options,{onConflict:"post_id,user_id"});if(!writeError)votes.set(user,row.vote);return {error:writeError};},
   delete(){const query={eq(field,value){if(field==="post_id"){assert.equal(value,id);return query;}assert.equal(field,"user_id");assert.equal(value,user);writes++;if(!writeError)votes.delete(user);return Promise.resolve({error:writeError});}};return query;},
  };
 },
 rpc(name,args){assert.equal(name,"get_post_votes");assert.deepEqual(args,{post_ids:[id]});return {single:async()=>({data:{score:[...votes.values()].reduce((a,b)=>a+b,0),user_vote:votes.get(user)??0},error:statsError})};},
};
const api=load("app/api/posts/[id]/vote/route.ts",{
 "next/headers":{cookies:async()=>({})},"next/cache":{revalidatePath:path=>invalidated.push(path)},"@/app/supabase/server":{createClient:()=>client},
});
function request(vote,method="PUT",postId=id){return api[method](new Request("http://localhost",{method,...(method==="PUT"?{body:JSON.stringify({vote,user_id:"spoofed"})}:{})}),{params:Promise.resolve({id:postId})});}
assert.deepEqual(await(await request(1)).json(),{vote:1,score:1});
assert.deepEqual(await(await request(1)).json(),{vote:1,score:1},"Upvotes are idempotent");
assert.deepEqual(await(await request(-1)).json(),{vote:-1,score:-1},"Switching updates one row");
assert.equal(votes.size,1);
user="user-b";
assert.deepEqual(await(await request(-1)).json(),{vote:-1,score:-2});
assert.deepEqual(await(await request(null,"DELETE")).json(),{vote:0,score:-1});
assert.deepEqual(await(await request(null,"DELETE")).json(),{vote:0,score:-1},"Removal is idempotent");
assert.equal(votes.get("user-a"),-1,"Removing one user's vote preserves another's");
for(const value of [0,2,"1",null,{},[]]) assert.equal((await request(value)).status,400);
assert.equal((await api.PUT(new Request("http://localhost",{method:"PUT",body:"broken"}),{params:Promise.resolve({id})})).status,400);
assert.equal((await request(1,"PUT","bad")).status,400);
visible=false; assert.equal((await request(1)).status,404); visible=true;
postError={code:"load_failure"};assert.equal((await request(1)).status,500);postError=null;
const priorWrites=writes;user=null;
assert.equal((await request(1)).status,401);assert.equal((await request(null,"DELETE")).status,401);assert.equal(writes,priorWrites);
user="user-b";authError={message:"Invalid session"};assert.equal((await request(1)).status,401);authError=null;
writeError={code:"test_write_failure"};assert.equal((await request(1)).status,500);assert.equal(votes.has(user),false);writeError=null;
statsError={code:"test_stats_failure"};assert.equal((await request(1)).status,500);assert.equal(votes.get(user),1);statsError=null;
assert.ok(invalidated.includes("/")&&invalidated.includes("/your-posts"));
const retired=load("app/api/posts/[id]/heart/route.ts");assert.equal(retired.PUT().status,410);

// Signed-in controls preserve score/selection on errors and serialize requests.
let state=[],refs=[],index=0,refIndex=0;
const {VoteButtons}=load("app/posts/vote-buttons.tsx",{
 react:{...React,useState(initial){const i=index++;if(!(i in state))state[i]=initial;return[state[i],value=>{state[i]=value;}];},useRef(initial){const i=refIndex++;return refs[i]??(refs[i]={current:initial});}},
 "@/app/auth/auth-controls":{AuthControls:()=>null},
});
function elements(node){return !node||typeof node!=="object"?[]:[node,...React.Children.toArray(node.props?.children).flatMap(elements)];}
function render(){index=refIndex=0;return elements(VoteButtons({postId:id,initialScore:0,initialVote:0,available:true,isSignedIn:true}));}
const up=tree=>tree.filter(node=>node.type==="button")[0];
const down=tree=>tree.filter(node=>node.type==="button")[1];
const score=tree=>tree.find(node=>node.type==="span"&&node.props["aria-live"]==="polite").props.children;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const originalFetch=global.fetch;
let vote=0,calls=0,method,body;
try{
 global.fetch=async(url,options)=>{calls++;assert.equal(url,`/api/posts/${id}/vote`);method=options.method;body=options.body;vote=method==="DELETE"?0:JSON.parse(body).vote;return Response.json({vote,score:vote});};
 assert.equal(score(render()),0);
 up(render()).props.onClick();await flush();assert.equal(score(render()),1);assert.equal(up(render()).props["aria-pressed"],true);assert.equal(method,"PUT");assert.equal(JSON.parse(body).vote,1);
 assert.equal(up(render()).props.disabled,false);
 down(render()).props.onClick();await flush();assert.equal(score(render()),-1,"Downvoting an upvote switches directly from +1 to -1");assert.equal(method,"PUT");assert.equal(JSON.parse(body).vote,-1);
 down(render()).props.onClick();await flush();assert.equal(score(render()),0,"Clicking the selected downvote clears it");assert.equal(method,"DELETE");
 down(render()).props.onClick();await flush();assert.equal(score(render()),-1,"Downvoting neutral changes 0 to -1");assert.equal(down(render()).props["aria-pressed"],true);
 up(render()).props.onClick();await flush();assert.equal(score(render()),1,"Upvoting a downvote switches directly from -1 to +1");assert.equal(method,"PUT");
 up(render()).props.onClick();await flush();assert.equal(score(render()),0,"Clicking the selected upvote clears it");assert.equal(method,"DELETE");
 up(render()).props.onClick();await flush();assert.equal(score(render()),1);assert.equal(down(render()).props["aria-pressed"],false);
 global.fetch=async()=>Response.json({error:"Try later"},{status:503});
 down(render()).props.onClick();await flush();assert.equal(score(render()),1);assert.equal(up(render()).props["aria-pressed"],true);assert.ok(render().some(node=>node.props?.role==="alert"&&node.props.children==="Try later"));
 let resolve;
 global.fetch=async()=>{calls++;return new Promise(done=>{resolve=done;});};
 const before=calls;
 down(render()).props.onClick();down(render()).props.onClick();assert.equal(calls,before+1);assert.equal(up(render()).props.disabled,true);assert.equal(down(render()).props.disabled,true);
 resolve(Response.json({vote:-1,score:-1}));await flush();assert.equal(score(render()),-1);
 global.fetch=async()=>{throw new Error("offline");};up(render()).props.onClick();await flush();assert.equal(score(render()),-1);assert.equal(down(render()).props["aria-pressed"],true);

}finally{global.fetch=originalFetch;}
console.log("Passed voting checks: authentication, input validation, ownership, idempotent up/down/remove, switching, score persistence, failure handling, retired likes, direct +1/-1 switching, selected vote removal, selected styling, guest-safe boundaries, and overlapping request prevention.");
