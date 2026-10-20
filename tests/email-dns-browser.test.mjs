import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve,join,extname} from "node:path";
import {createRequire} from "node:module";
import {MERCHANT} from "../docs/checkout-core.mjs";
const require=createRequire("/srv/multi-vm-agent/workspace/make_money/work/lastone-mobile-playgama-pilot-20261019/package.json");
const {chromium}=require("playwright-core");
const dir=resolve("docs");
const types={".html":"text/html;charset=utf-8",".mjs":"text/javascript;charset=utf-8",".css":"text/css;charset=utf-8",".svg":"image/svg+xml"};
const path="/v1/email-dns-preflight?domain=example.com";
const url="https://vm5-openapi-x402.onrender.com"+path;
async function localServer(){
 const srv=createServer(async(req,res)=>{
  try{
   const pathname=new URL(req.url,"http://127.0.0.1").pathname;
   const clean=pathname.replace(/^\/+/,"");
   if(!types[extname(clean)]||clean.includes(".."))throw Error("invalid static route");
   const file=await readFile(join(dir,clean));
   res.writeHead(200,{"content-type":types[extname(clean)],"cache-control":"no-store"});res.end(file);
  }catch{res.writeHead(404);res.end("not found");}
 });
 await new Promise(r=>srv.listen(0,"127.0.0.1",r));
 return {srv,base:"http://127.0.0.1:"+srv.address().port};
}
function merchantQuote(originalUrl=url,override={}){
 const o={
  x402Version:2,resource:{url:originalUrl,description:"Safe public DNS config only",mimeType:"application/json"},
  accepts:[{scheme:"exact",network:"eip155:8453",amount:"5000",asset:MERCHANT.asset,payTo:MERCHANT.payTo,maxTimeoutSeconds:300,extra:{name:"USD Coin",version:"2"}}],
  extensions:{}
 };
 Object.assign(o.accepts[0],override);
 return o;
}
function body(){
 return {ok:true,paid:true,chargedUSDC:"0.005",kind:"public_email_dns_preflight",network:"eip155:8453",domain:"example.com",inspectedAtUTC:"2026-10-21T04:00:00Z",warnings:[],mxHosts:[],spfPresent:true,dmarcPresent:true,rawEmailAddressesReceived:false,smtpContactAttempted:false};
}
function quoteHeader(override){
 return Buffer.from(JSON.stringify(merchantQuote(url,override))).toString("base64");
}
const cors={
 "access-control-allow-origin":"*",
 "access-control-expose-headers":"PAYMENT-REQUIRED,PAYMENT-RESPONSE",
 "access-control-allow-methods":"GET,OPTIONS",
 "access-control-allow-headers":"Content-Type,PAYMENT-SIGNATURE",
};
async function mockBuyer(page,ctx,{tamper={},signedStatus=200}={}){
 const requests={unsigned:0,signed:0,OPTIONS:0};
 await ctx.addInitScript(()=>{
  window.__mockWallet={calls:[]};
  window.ethereum={request:async ({method,params})=>{
   window.__mockWallet.calls.push(method);
   if(method==="eth_chainId")return "0x2105";
   if(method==="eth_requestAccounts")return ["0x2222222222222222222222222222222222222222"];
   if(method==="eth_call")return "0x100000";
   if(method==="eth_signTypedData_v4")return "0x"+"3".repeat(130);
   throw Error("Unexpected buyer wallet method "+method);
  }};
  window.confirm=()=>true;
 });
 await ctx.route("https://vm5-openapi-x402.onrender.com/**",async route=>{
  const req=route.request();
  if(req.method()==="OPTIONS"){
   requests.OPTIONS++;
   await route.fulfill({status:204,headers:cors,body:""});
   return;
  }
  if(req.url()!==url)throw Error("Unexpected merchant request "+req.url());
  const pay=req.headers()["payment-signature"];
  if(!pay){
   requests.unsigned++;
   await route.fulfill({status:402,headers:{...cors,"payment-required":quoteHeader(tamper)},contentType:"application/json",body:JSON.stringify({error:"payment_required"})});
   return;
  }
  requests.signed++;
  assert.equal(req.method(),"GET");
  const envelope=JSON.parse(Buffer.from(pay,"base64").toString("utf8"));
  assert.equal(envelope.x402Version,2);
  assert.equal(envelope.resource.url,url);
  assert.equal(envelope.accepted.amount,"5000");
  assert.equal(envelope.accepted.network,"eip155:8453");
  assert.equal(envelope.accepted.payTo.toLowerCase(),MERCHANT.payTo.toLowerCase());
  assert.equal(envelope.payload.authorization.from.toLowerCase(),"0x2222222222222222222222222222222222222222");
  assert.equal(envelope.payload.authorization.value,"5000");
  await route.fulfill({status:signedStatus,headers:cors,contentType:"application/json",body:JSON.stringify(signedStatus===200?body():{error:"uncertain"})});
 });
 return requests;
}
test("real Chrome desktop/mobile UX, free sample + unsigned quote + ONE FAKE buyer-authorized signed GET only",async()=>{
 const web=await localServer();
 const b=await chromium.launch({headless:true,executablePath:"/opt/google/chrome/chrome",args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu"]});
 try{
  for(const vp of [{width:1180,height:850},{width:390,height:844}]){
   const ctx=await b.newContext({viewport:vp});
   const tab=await ctx.newPage(),errors=[],outbound=[];
   tab.on("pageerror",e=>errors.push(e.message));
   tab.on("request",r=>{if(!r.url().startsWith(web.base))outbound.push(r.url())});
   const counts=await mockBuyer(tab,ctx);
   const resp=await tab.goto(web.base+"/email-dns.html",{waitUntil:"networkidle",timeout:12000});
   assert.equal(resp.status(),200);
   assert.equal(await tab.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
   assert.deepEqual(outbound,[]);
   assert.equal(await tab.locator("#dns-paid").isHidden(),true);
   assert.equal(await tab.locator("#dns-pay").isDisabled(),true);
   assert.deepEqual(await tab.evaluate(()=>window.__mockWallet.calls),[]);
   await tab.locator("#dns-free").click();
   assert.match(await tab.locator("#dns-free-report").innerText(),/FIXTURE_ONLY_NOT_LIVE_DNS/);
   assert.equal(counts.unsigned,0);assert.equal(counts.signed,0);
   await tab.locator("#dns-quote").click();
   await tab.getByText("Real server x402 quote verified",{exact:false}).waitFor({timeout:9000});
   assert.equal(counts.unsigned,1);assert.equal(counts.signed,0);
   assert.deepEqual(await tab.evaluate(()=>window.__mockWallet.calls),[]);
   assert.match(await tab.locator("#dns-payee").innerText(),/0x6b01efA/);
   await tab.locator("#dns-pay").click();
   assert.match(await tab.locator("#dns-status").innerText(),/Confirm exactly one paid/);
   assert.equal(counts.signed,0);
   await tab.locator("#dns-consent").check();
   await tab.locator("#dns-pay").click();
   await tab.locator("#dns-paid").waitFor({state:"visible",timeout:10000});
   assert.match(await tab.locator("#dns-paid").innerText(),/"chargedUSDC": "0.005"/);
   assert.equal(counts.signed,1);assert.equal(counts.unsigned,1);
   assert.equal(await tab.locator("#dns-pay").isDisabled(),true);
   assert.equal(await tab.locator("#dns-domain").isDisabled(),false);
   assert.equal(await tab.locator("#dns-domain").getAttribute("readonly")!==null,true);
   const walletCalls=await tab.evaluate(()=>window.__mockWallet.calls);
   assert.equal(walletCalls.filter(x=>x==="eth_signTypedData_v4").length,1);
   assert.deepEqual(walletCalls,["eth_chainId","eth_requestAccounts","eth_call","eth_signTypedData_v4"]);
   assert.deepEqual(errors,[]);
   assert.deepEqual(outbound.filter(u=>u!==url),[]);
   console.log("DNS_BUYER_FAKE_WALLET_ONLY",vp.width,"native_paid_signature_mock=1","no_owner_wallet_or_real_merchant_payment");
   await ctx.close();
  }
 }finally{await b.close();await new Promise(resolve=>web.srv.close(resolve));}
});
test("invalid payTo/amount on same domain aborts before ANY wallet access",async()=>{
 const web=await localServer();
 const b=await chromium.launch({headless:true,executablePath:"/opt/google/chrome/chrome",args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu"]});
 try{
  for(const tamper of [{payTo:"0x1111111111111111111111111111111111111111"},{amount:"5001"},{network:"eip155:1"}]){
   const ctx=await b.newContext({viewport:{width:900,height:810}});
   const tab=await ctx.newPage();
   const counts=await mockBuyer(tab,ctx,{tamper});
   await tab.goto(web.base+"/email-dns.html",{waitUntil:"networkidle",timeout:12000});
   await tab.locator("#dns-quote").click();
   await tab.locator("#dns-status[data-state=warning]").waitFor({timeout:7000});
   assert.equal(await tab.locator("#dns-pay").isDisabled(),true);
   assert.equal(counts.signed,0);
   assert.deepEqual(await tab.evaluate(()=>window.__mockWallet.calls),[]);
   await ctx.close();
  }
 }finally{await b.close();await new Promise(resolve=>web.srv.close(resolve));}
});
test("after one MOCK signed request returns HTTP503, UI locks irreversibly; zero retry",async()=>{
 const web=await localServer();
 const b=await chromium.launch({headless:true,executablePath:"/opt/google/chrome/chrome",args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu"]});
 try{
  const ctx=await b.newContext({viewport:{width:800,height:800}});
  const tab=await ctx.newPage();
  const counts=await mockBuyer(tab,ctx,{signedStatus:503});
  await tab.goto(web.base+"/email-dns.html",{waitUntil:"networkidle",timeout:12000});
  await tab.locator("#dns-quote").click();
  await tab.locator("#dns-pay").waitFor({state:"visible",timeout:8000});
  await tab.locator("#dns-consent").check();
  await tab.locator("#dns-pay").click();
  await tab.getByText("Signed payment outcome uncertain",{exact:false}).waitFor({timeout:9000});
  assert.equal(counts.unsigned,1);assert.equal(counts.signed,1);
  assert.equal(await tab.locator("#dns-pay").isDisabled(),true);
  assert.equal(await tab.locator("#dns-quote").isDisabled(),true);
  assert.match(await tab.locator("#dns-status").innerText(),/DO NOT sign\/pay again/);
  assert.equal(await tab.evaluate(()=>window.__mockWallet.calls.filter(x=>x==="eth_signTypedData_v4").length),1);
  await ctx.close();
 }finally{await b.close();await new Promise(resolve=>web.srv.close(resolve));}
});
