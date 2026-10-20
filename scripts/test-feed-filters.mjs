import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const dependency=createRequire(import.meta.url);
function load(path,imports={}){const code=ts.transpileModule(fs.readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;const mod={exports:{}};new Function("require","module","exports",code)(name=>Object.hasOwn(imports,name)?imports[name]:dependency(name),mod,mod.exports);return mod.exports;}
const sorts=load("app/posts/feed-sort.ts");
const cursorTools=load("app/posts/feed-cursor.ts",{"./feed-sort":sorts});
const id="12345678-1234-1234-1234-123456789abc";
const post={id,user_id:"author",image_path:"author/image.png",caption:"Public caption",created_at:"2026-10-20T01:00:00Z",authorName:"Sam",rankScore:-2};
for(const value of ["all","newest","top","unrated"])assert.equal(sorts.isHomeFeedSort(value),true);
for(const value of [null,[],"unknown","top&userId=victim"])assert.equal(sorts.isHomeFeedSort(value),false);
let table,fields,ordering,filter;
let rows=[post],failed=false;
const query={select(value){fields=value;return query;},order(field,options){ordering.push([field,options.ascending]);return query;},range(){return query;},or(value){filter=value;return query;},returns:async()=>({data:rows,error:failed?{code:"missing_view"}:null})};
const client={from(value){table=value;ordering=[];return query;},storage:{from:()=>({createSignedUrls:async()=>({data:[{path:post.image_path,signedUrl:"/image.png"}],error:null})})}};
const {getHomeFeed,getNextFeed}=load("app/posts/feed-data.ts",{"server-only":{},"./vote-data":{getPostVotes:async()=>new Map([[id,{score:-2,user_vote:0}]])}});
let result=await getHomeFeed(client,1,"newest");assert.equal(table,"home_feed");assert.deepEqual(ordering,[["created_at",false],["id",false]]);assert.equal(fields.includes("context"),false);assert.equal(result.posts[0].crowdPick,false);
await getHomeFeed(client,1,"top");assert.equal(table,"scored_home_feed");assert.deepEqual(ordering,[["vote_score",false],["created_at",false],["id",false]]);
const token=cursorTools.makeFeedCursor(result.posts,null,"top");const cursor=cursorTools.parseFeedCursor(token);assert.equal(cursor.sort,"top");assert.equal(cursor.score,-2);
await getNextFeed(client,cursor);assert.equal(table,"scored_home_feed");assert.equal(filter,`vote_score.lt.-2,and(vote_score.eq.-2,created_at.lt.${post.created_at}),and(vote_score.eq.-2,created_at.eq.${post.created_at},id.lt.${id})`);
await getHomeFeed(client,1,"unrated");assert.equal(table,"unrated_home_feed");assert.equal(fields.includes("user_vote"),false);assert.equal(fields.includes("context"),false);
failed=true;assert.equal((await getHomeFeed(client,1,"top")).error,true);failed=false;
for(const value of [{...cursor,score:"0),id.gt.0"},{...cursor,score:1.5},{...cursor,sort:"bad"}])assert.equal(cursorTools.parseFeedCursor(Buffer.from(JSON.stringify(value)).toString("base64url")),null);
let user=null,queries=0;
const {GET}=load("app/api/feed/route.ts",{
 "next/headers":{cookies:async()=>({})},"@/app/supabase/server":{createClient:()=>({auth:{getUser:async()=>({data:{user},error:null})}})},
 "@/app/posts/feed-sort":sorts,"@/app/posts/feed-cursor":cursorTools,"@/app/posts/feed-data":{getNextFeed:async()=>{queries++;return{posts:[],hasNext:false,error:false};}},
});
function request(sort,cursorScope=sort,scope="home"){return new Request(`http://localhost/api/feed?${new URLSearchParams({scope,sort,cursor:cursorTools.makeFeedCursor([{...post,score:-2}],null,cursorScope)})}`);}
assert.equal((await GET(request("unrated"))).status,401);assert.equal(queries,0);
assert.equal((await GET(request("newest","top"))).status,400);assert.equal((await GET(request("top","top","personal"))).status,400);
user={id:"viewer"};assert.equal((await GET(request("unrated"))).status,200);
const {FeedFilters}=load("app/posts/feed-filters.tsx",{"./feed-sort":sorts,"next/link":({children,href,className,"aria-current":current})=>React.createElement("a",{href,className,"aria-current":current},children)});
const memberHtml=renderToStaticMarkup(React.createElement(FeedFilters,{sort:"top",signedIn:true}));assert.match(memberHtml,/aria-current="page"/);assert.match(memberHtml,/\?sort=unrated/);assert.match(memberHtml,/Top voted/);
const guestHtml=renderToStaticMarkup(React.createElement(FeedFilters,{sort:"all",signedIn:false}));assert.doesNotMatch(guestHtml,/Not rated|Sign in to find posts/);assert.doesNotMatch(guestHtml,/href="\/\?sort=unrated/);
const {getFeedReturnPath}=load("app/auth/return-path.ts");assert.equal(getFeedReturnPath(`/?sort=top#post-${id}`),`/?sort=top#post-${id}`);assert.equal(getFeedReturnPath(`/?sort=bad#post-${id}`),"/");
// Rating an item in Not rated removes it without resetting the loaded feed.
let state=[],index=0;
function VoteStub(){return null;}
const {InfiniteFeed}=load("app/posts/infinite-feed.tsx",{
  "./share-post-button": { SharePostButton: () => null },
 "./vote-buttons":{VoteButtons:VoteStub},"./author-profile":{AuthorProfilePopover:()=>null},"./delete-post-button":{DeletePostButton:()=>null},"next/link":()=>null,
 react:{...React,useState(initial){const i=index++;if(!(i in state))state[i]=initial;return[state[i],value=>{state[i]=typeof value==="function"?value(state[i]):value;}];},useRef:initial=>({current:initial}),useEffect(){},useCallback:fn=>fn},
});
function elements(node){return !node||typeof node!=="object"?[]:[node,...React.Children.toArray(node.props?.children).flatMap(elements)];}
function renderUnrated(){index=0;return elements(InfiniteFeed({initialPosts:[{...post,score:0,userVote:0,votesAvailable:true},{...post,id:"another",score:0,userVote:0,votesAvailable:true}],initialCursor:null,userId:"viewer",scope:"home",sort:"unrated"}));}
let tree=renderUnrated();let control=tree.find(node=>node.type===VoteStub);control.props.onVoteChange(0);assert.equal(renderUnrated().filter(node=>node.type==="article").length,2);
control.props.onVoteChange(1);tree=renderUnrated();assert.equal(tree.filter(node=>node.type==="article").length,1);
tree.find(node=>node.type===VoteStub).props.onVoteChange(-1);tree=renderUnrated();assert.equal(tree.filter(node=>node.type==="article").length,0);assert.ok(tree.some(node=>node.type==="h2"&&node.props.children==="You’ve rated every post"));
console.log("Passed feed filters: defaults, strict newest order, score-first ordering and tied cursor boundaries, unrated view, guest restrictions, cursor/filter matching, safe values, filter controls, missing migration handling, and auth return paths.");
