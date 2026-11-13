import test from "node:test";
import assert from "node:assert/strict";
import { nativeDocsGrant, nativeDocMarkdownEqual, tryUploadDocBlocks } from "../../provider-google-docs/dist/native-docs.js";

const drive="https://www.googleapis.com/auth/drive";

function nativeParagraphs(lines) {
  let pos=1;
  return lines.map(value => {
    const startIndex=pos, {text, ...props}=typeof value === "string" ? {text:value} : value;
    const elements=typeof text === "string" ? [{textRun:{content:text+"\n"}}] : text;
    for (const el of elements) {
      el.startIndex=pos;
      pos+=el.textRun?.content.length??1;
      el.endIndex=pos;
    }
    return {startIndex,endIndex:pos,paragraph:{paragraphStyle:{namedStyleType:"NORMAL_TEXT"},elements,...props}};
  });
}

function fixture(lines,{scopes=[drive],comments=[[]],writeCode=200,retryRead=false,rev="server-rev",namedRanges={},lists={},extraTab=false}={}) {
  const content=nativeParagraphs(lines), posts=[], reads=[], seen=[];
  const doc={documentId:"doc",revisionId:rev,tabs:[{tabProperties:{tabId:"tab-main"},documentTab:{body:{content},namedRanges,lists}}]};
  if (extraTab) doc.tabs.push({tabProperties:{tabId:"tab-two"}, documentTab:{body:{content:nativeParagraphs(["one"])}}});
  const runtime={
    configuration:{getOptional:k=>k === "GOOGLE_FORMS_TOKEN_FILE" ? "/grant" : undefined},
    filesystem:{exists:async()=>true,readText:async()=>JSON.stringify({token:"testBearer",scopes,expiry:"2070-01-01"})},
    clock:{now:()=>new Date("2026-01-01")},
    http:{request:async(url,init)=>{
      assert.equal(init.redirect,"error");
      assert.equal(init.headers.authorization,"Bearer testBearer");
      const u=new URL(url);
      seen.push(u.pathname);
      if(u.hostname==="www.googleapis.com" && u.pathname==="/drive/v3/files/doc/comments") {
        const page=Number(u.searchParams.get("pageToken")??0);
        return Response.json({comments:comments[page],...(page+1<comments.length&&{nextPageToken:String(page+1)})});
      }
      assert.equal(u.hostname,"docs.googleapis.com");
      if(init.method==="POST") {
        posts.push(JSON.parse(init.body));
        return new Response("{}",{status:writeCode});
      }
      assert.equal(u.pathname,"/v1/documents/doc");
      reads.push(u);
      if(retryRead && reads.length===1)return new Response("",{status:429,headers:{"retry-after":"0"}});
      return Response.json(doc);
    }}
  };
  const write=(old,next,confirm=async()=>old,tab=null)=>tryUploadDocBlocks(runtime,"doc",null,tab,old,next,confirm);
  return {runtime,content,write,posts,reads,seen};
}

test("only existing write-scoped grants can use the official Docs transport",async()=>{
  const f=fixture(["one"],{scopes:["https://www.googleapis.com/auth/forms.body","https://www.googleapis.com/auth/drive.readonly"]});
  assert.equal(await nativeDocsGrant(f.runtime),null);
  assert.equal(await f.write("one","two"),false);
  assert.deepEqual(f.seen,[]);
});

test("read grants are independent and complete grants take precedence across configured sources",async()=>{
  const f=fixture(["one"],{scopes:[drive+".readonly"]});
  assert.equal(await nativeDocsGrant(f.runtime),null);
  assert.equal((await nativeDocsGrant(f.runtime,true))?.token,"testBearer");
  f.runtime.configuration.getOptional=k=>k==="GOOGLE_DOCS_TOKEN_FILE"?"/read":k==="GOOGLE_FORMS_TOKEN_FILE"?"/drive":undefined;
  f.runtime.filesystem.readText=async path=>JSON.stringify({token:path,scopes:[path==="/read"?drive+".readonly":drive],expiry:"2070-01-01"});
  assert.equal((await nativeDocsGrant(f.runtime,true))?.token,"/drive");
  assert.equal((await nativeDocsGrant(f.runtime))?.token,"/drive");
});

test("unscoped multi-tab export is never mapped to a default tab",async()=>{
  const f=fixture(["one"],{extraTab:true});
  await assert.rejects(f.write("one\none","one\nchanged"),/explicit tab/);
  assert.equal(f.posts.length,0);
  await f.write("one","changed",undefined,"tab-two");
  assert.ok(f.posts[0].requests.every(r=>(Object.values(r)[0].location??Object.values(r)[0].range).tabId==="tab-two"));
});

test("official reads can retry; one revision-guarded batch targets the requested tab",async()=>{
  const f=fixture(["😀 before","guard","end"],{retryRead:true});
  await f.write("😀 before\nguard\nend","😀 after\nguard\nfinish",undefined,"tab-main");
  assert.equal(f.reads.length,2);
  assert.equal(f.posts.length,1);
  assert.deepEqual(f.posts[0].writeControl,{requiredRevisionId:"server-rev"});
  for(const req of f.posts[0].requests) {
    const op=Object.values(req)[0];
    assert.equal((op.range??op.location).tabId,"tab-main");
    if(op.range)assert.ok(op.range.startIndex>=1);
  }
});

test("a changed export or refused revision cannot replay a write",async()=>{
  const f=fixture(["one"],{writeCode:429});
  await assert.rejects(f.write("one","two",async()=>"one!"),/changed before writing/);
  assert.equal(f.posts.length,0);
  await assert.rejects(f.write("one","two"),/429/);
  assert.equal(f.posts.length,1);
});

test("disjoint text edits keep middle links, native style and anchors at their original characters",async()=>{
  const anchor="unique linked middle";
  const rich={link:{url:"https://example.org/"},backgroundColor:{color:{rgbColor:{green:1}}},fontSize:{magnitude:16,unit:"PT"}};
  const f=fixture([{text:[{textRun:{content:"old left "}}, {textRun:{content:anchor,textStyle:rich}}, {textRun:{content:" old right\n"}}]}],{comments:[[],[{anchor:"opaque",quotedFileContent:{value:anchor,mimeType:"text/html"}}]]});
  await f.write("old left ["+anchor+"](https://example.org/) old right","new left ["+anchor+"](https://example.org/) new right");
  assert.equal(f.posts.length,1);
  // Both edits have equal UTF-16 length. No replacement, insertion or style
  // refresh should intersect the link that lies between them.
  const {requests}=f.posts[0],start=10,end=start+anchor.length;
  for(const req of requests) {
    const op=Object.values(req)[0];
    if(op.range)assert.ok(op.range.endIndex<=start || op.range.startIndex>=end,JSON.stringify(req));
    else assert.ok(op.location.index<start || op.location.index>end);
  }
  assert.equal(f.seen.filter(p=>p.endsWith("/comments")).length,2);
});

test("same-block formatting changes only modify the specified native style field and UTF-16 range",async()=>{
  const f=fixture(["😀 one middle end"]);
  await f.write("😀 one middle end","😀 one **middle** end");
  assert.deepEqual(f.posts[0].requests,[{updateTextStyle:{range:{startIndex:8,endIndex:14,tabId:"tab-main"},textStyle:{bold:true},fields:"bold"}}]);
});

test("before any write reject ambiguous duplicate edits, opaque blocks, and inaccessible tabs",async()=>{
  const f=fixture(["item","middle","item"]);
  await assert.rejects(f.write("item\nmiddle\nitem","edit\nmiddle\nitem"),/ambiguous/);
  await assert.rejects(f.write("middle","![opaque](https://img.test/)"),/unsupported/);
  await assert.rejects(f.write("item","edit",undefined,"not-this-tab"),/tab/);
  assert.equal(f.posts.length,0);
});

test("quoted text (including subsequent pages), unmappable anchors and named ranges block touching writes",async()=>{
  for(const options of [
    {comments:[[],[{anchor:"a",quotedFileContent:{value:"guard"}}]]},
    {comments:[[{anchor:"opaque"}]]},
    {comments:[[{anchor:"opaque",quotedFileContent:{value:"missing"}}]]},
    {namedRanges:{myRange:{namedRanges:[{ranges:[{startIndex:1,endIndex:6}]}]}}},
  ]) {
    const f=fixture(["guard text"],options);
    await assert.rejects(f.write("guard text","changed text"),/comment|named range/);
    assert.equal(f.posts.length,0);
  }
});

test("nested list insertions use relative native levels without reformatting the parent",async()=>{
  const f=fixture([
    {text:"Parent",bullet:{listId:"l"}},
    {text:"Child",bullet:{listId:"l",nestingLevel:1}},
    "End",
  ],{lists:{l:{listProperties:{nestingLevels:[{glyphSymbol:"●"},{glyphSymbol:"○"}]}}}});
  await f.write("* Parent\n  * Child\nEnd","* Parent\n  * Child\n    * New\nEnd");
  const rs=f.posts[0].requests;
  const tabs=rs.find(r=>r.insertText?.text.includes("\t"));
  assert.equal(tabs.insertText.text,"x\n\t");
  for (const req of rs) {const op=Object.values(req)[0];assert.ok((op.range?.startIndex??op.location.index)>=14);}
  assert.ok(rs.some(r=>r.createParagraphBullets));
});

test("verification retains emphasis, links, list depth and exact opaque block contents",()=>{
  assert.ok(nativeDocMarkdownEqual("Intro\n\n* **bold**\n  * child","Intro  \n- **bold**\n  - child"));
  assert.ok(!nativeDocMarkdownEqual("Intro\n- child","Intro\n  - child"));
  assert.ok(!nativeDocMarkdownEqual("* **bold**","* bold"));
  assert.ok(!nativeDocMarkdownEqual("[link](https://a/)","[link](https://b/)"));
  assert.ok(!nativeDocMarkdownEqual("| a |\n| --- |\n","| b |\n| --- |\n"));
});

test("a text change cannot silently consume a separate blank paragraph or orphan a list item",async()=>{
  const f=fixture(["first","second"]);
  await assert.rejects(f.write("first\nsecond","edited\n\nsecond"),/blank paragraph/);
  await assert.rejects(f.write("first\nsecond","first\n    * second"),/matching parent/);
  assert.equal(f.posts.length,0);
  assert.equal(nativeDocMarkdownEqual("first\nsecond","first\n\nsecond"),false);
});
