import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
const dependency=createRequire(import.meta.url);
const code=ts.transpileModule(fs.readFileSync("app/posts/delete-post-button.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
let state=[],refs=[],index=0,refIndex=0,removed=0,refreshed=0,calls=0;
const imports={react:{...React,useId:()=>"delete-dialog",useState(initial){const i=index++;if(!(i in state))state[i]=initial;return[state[i],value=>{state[i]=value;}];},useRef(initial){const i=refIndex++;return refs[i]??(refs[i]={current:initial});}},"next/navigation":{useRouter:()=>({refresh(){refreshed++;}})}};
const mod={exports:{}};
new Function("require","module","exports",code)(name=>Object.hasOwn(imports,name)?imports[name]:dependency(name),mod,mod.exports);
const {DeletePostButton}=mod.exports;
function elements(node){return !node||typeof node!=="object"?[]:[node,...React.Children.toArray(node.props?.children).flatMap(elements)];}
function render(withCallback=true){index=refIndex=0;return elements(DeletePostButton({postId:"test-post",onDeleted:withCallback?()=>{removed++;}:undefined}));}
const trigger=tree=>tree.find(node=>node.props?.["aria-label"]==="Delete post");
const cancel=tree=>tree.find(node=>node.type==="button"&&node.props.children==="Cancel");
const confirm=tree=>tree.find(node=>node.type==="button"&&["Delete post","Deleting…"].includes(node.props.children));
let opened=false,dialogNode;
const modal={showModal(){opened=true;},close(){opened=false;dialogNode.props.onClose();},getBoundingClientRect:()=>({left:10,right:300,top:10,bottom:200})};
function attach(withCallback=true){const tree=render(withCallback);dialogNode=tree.find(node=>node.type==="dialog");if(dialogNode)dialogNode.props.ref.current=modal;return tree;}
const originalFetch=global.fetch;
try{
 global.fetch=async()=>{calls++;return Response.json({error:"Try again later"},{status:500});};
 let tree=attach();
 trigger(tree).props.onClick();assert.equal(opened,true);assert.equal(calls,0,"Opening confirmation must not delete");
 assert.equal(cancel(tree).props.autoFocus,true,"Initial focus stays on the safe action");
 assert.match(dialogNode.props.className,/fixed.*max-w-sm/);
 cancel(tree).props.onClick();assert.equal(opened,false);assert.equal(calls,0);
 trigger(tree).props.onClick();
 dialogNode.props.onClick({target:modal,currentTarget:modal,clientX:40,clientY:40});assert.equal(opened,true,"Clicking inside does not close");
 dialogNode.props.onClick({target:modal,currentTarget:modal,clientX:0,clientY:0});assert.equal(opened,false);assert.equal(calls,0,"Backdrop dismissal never deletes");
 trigger(tree).props.onClick();
 let prevented=false;dialogNode.props.onCancel({preventDefault(){prevented=true;}});assert.equal(prevented,false,"Escape may close an idle dialog");
 await confirm(tree).props.onClick();tree=attach();
 assert.equal(removed,0);assert.equal(opened,true);assert.ok(tree.some(node=>node.props?.role==="alert"&&node.props.children==="Try again later"));
 let resolveRequest;
 global.fetch=async(url,options)=>{calls++;assert.equal(url,"/api/posts/test-post");assert.equal(options.method,"DELETE");return new Promise(resolve=>{resolveRequest=resolve;});};
 const first=confirm(tree).props.onClick();
 confirm(tree).props.onClick();assert.equal(calls,2,"One failed request and one retry; no duplicate writes");
 tree=attach();assert.equal(confirm(tree).props.disabled,true);assert.equal(cancel(tree).props.disabled,true);
 prevented=false;dialogNode.props.onCancel({preventDefault(){prevented=true;}});assert.equal(prevented,true,"Pending deletion cannot be interrupted by Escape");
 dialogNode.props.onClick({target:modal,currentTarget:modal,clientX:0,clientY:0});assert.equal(opened,true);
 resolveRequest(Response.json({message:"Deleted"}));await first;
 assert.equal(removed,1);assert.equal(refreshed,0);assert.equal(opened,false);
 assert.ok(render().some(node=>node.props?.role==="status"&&node.props.children==="Post deleted."));
 state=[];refs=[];
 tree=attach(false);trigger(tree).props.onClick();
 global.fetch=async()=>{throw new Error("offline");};await confirm(tree).props.onClick();
 tree=attach(false);assert.equal(opened,true);assert.ok(tree.some(node=>node.props?.role==="alert"&&/Check your connection/.test(node.props.children)));
 global.fetch=async()=>Response.json({message:"Deleted"});await confirm(tree).props.onClick();assert.equal(refreshed,1);
}finally{global.fetch=originalFetch;}
console.log("Passed delete modal checks: top-layer layout, no deletion on open/cancel/backdrop, safe initial focus, retry after errors, duplicate prevention, pending dismissal protection, successful closure, and feed callback/refresh.");
