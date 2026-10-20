import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve,join,extname} from "node:path";
import {createRequire} from "node:module";
const require=createRequire("/srv/multi-vm-agent/workspace/make_money/work/lastone-mobile-playgama-pilot-20261019/package.json");
const {chromium}=require("playwright-core");
const root=resolve("docs");
const mime={".html":"text/html;charset=utf-8",".mjs":"text/javascript;charset=utf-8",".css":"text/css;charset=utf-8",".svg":"image/svg+xml"};
async function makeSite(){
 const server=createServer(async(req,res)=>{
  try{
   const route=new URL(req.url,"http://127.0.0.1").pathname.replace(/^\/+/,"");
   if(route.includes("..")||!mime[extname(route)])throw Error("invalid");
   const file=await readFile(join(root,route));
   res.writeHead(200,{"content-type":mime[extname(route)]});res.end(file);
  }catch{res.writeHead(404);res.end("not found")}
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 return {server,base:"http://127.0.0.1:"+server.address().port};
}
async function fakeDns(route,counters){
 counters.all++;
 const request=route.request();
 assert.equal(request.method(),"GET");
 assert.equal(request.headers()["payment-signature"],undefined);
 assert.equal(request.headers()["authorization"],undefined);
 const u=new URL(request.url());
 assert.equal(u.origin,"https://dns.google");
 assert.equal(u.pathname,"/resolve");
 let records=[];
 if(u.searchParams.get("type")==="MX"){counters.mx++;records=[{type:15,name:"example.com.",TTL:150,data:"0 ."}];}
 else if(u.searchParams.get("name")==="_dmarc.example.com"){counters.dmarc++;records=[{type:16,name:"_dmarc.example.com.",TTL:150,data:'"v=DMARC1; p=reject"'}];}
 else{counters.txt++;records=[{type:16,name:"example.com.",TTL:150,data:'"v=spf1 -all"'}];}
 await route.fulfill({status:200,contentType:"application/json",headers:{"access-control-allow-origin":"*"},body:JSON.stringify({Status:0,TC:false,Answer:records})});
}
test("real headless Chrome desktop and mobile: opt-in free REAL DNS results only after click, paid merchant never contacted",async()=>{
 const {server,base}=await makeSite();
 const browser=await chromium.launch({headless:true,executablePath:"/opt/google/chrome/chrome",args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu"]});
 try{
  for(const viewport of [{width:1180,height:880},{width:390,height:844}]){
   const ctx=await browser.newContext({viewport});
   await ctx.addInitScript(()=>{
    window.__walletCalls=[];
    window.ethereum={request:async ({method})=>{window.__walletCalls.push(method);throw Error("No wallet should be contacted for free DNS preview");}};
   });
   const page=await ctx.newPage(),scriptsErrors=[],thirdParty=[];
   page.on("pageerror",e=>scriptsErrors.push(e.message));
   page.on("request",r=>{if(!r.url().startsWith(base))thirdParty.push(r.url())});
   const counters={all:0,mx:0,txt:0,dmarc:0};
   await page.route("https://dns.google/resolve**",route=>fakeDns(route,counters));
   const res=await page.goto(base+"/email-dns.html",{waitUntil:"networkidle",timeout:12000});
   assert.equal(res.status(),200);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
   assert.equal(counters.all,0);
   assert.deepEqual(thirdParty,[]);
   await page.locator("#dns-free").click();
   assert.match(await page.locator("#dns-free-report").innerText(),/FIXTURE_ONLY_NOT_LIVE_DNS/);
   assert.equal(counters.all,0);
   await page.locator("#dns-live-free").click();
   await page.locator("#dns-live-result").waitFor({state:"visible",timeout:9500});
   const text=await page.locator("#dns-live-result").innerText();
   const result=JSON.parse(text);
   assert.equal(result.source,"Google Public DNS JSON-over-HTTPS (third party)");
   assert.equal(result.mx.nullMxAdvertised,true);
   assert.equal(result.spf.published,true);
   assert.equal(result.dmarc.requestedPolicy,"reject");
   assert.equal(result.costUSDC,"0");
   assert.deepEqual(counters,{all:3,mx:1,txt:1,dmarc:1});
   assert.equal(thirdParty.filter(u=>u.startsWith("https://vm5-openapi-x402.onrender.com")).length,0);
   assert.deepEqual(await page.evaluate(()=>window.__walletCalls),[]);
   assert.deepEqual(scriptsErrors,[]);
   console.log("FREE_REAL_DNS_MOCK_NETWORK_BUYER_RENDER_PASS",viewport.width,"3 public DoH GET, 0 merchant, 0 wallet");
   await ctx.close();
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
});
test("invalid domain refuses free outbound Google DNS fetch before any wallet call",async()=>{
 const {server,base}=await makeSite();
 const browser=await chromium.launch({headless:true,executablePath:"/opt/google/chrome/chrome",args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu"]});
 try{
  const ctx=await browser.newContext();
  const page=await ctx.newPage(),urls=[];
  page.on("request",r=>{if(r.url().startsWith("https://dns.google"))urls.push(r.url())});
  await page.goto(base+"/email-dns.html",{waitUntil:"networkidle",timeout:12000});
  await page.locator("#dns-domain").fill("test.invalid");
  await page.locator("#dns-live-free").click();
  await page.locator("#dns-status[data-state=warning]").waitFor({timeout:6500});
  assert.equal(urls.length,0);
  assert.equal(await page.locator("#dns-live-result").isHidden(),true);
  await ctx.close();
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
});
