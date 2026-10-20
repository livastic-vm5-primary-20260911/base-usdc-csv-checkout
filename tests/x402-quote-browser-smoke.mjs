// Simulated buyer and fake API only. Never touches real tokens or real wallet signatures.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,mkdir} from "node:fs/promises";
import {join,extname,resolve} from "node:path";
import {createRequire} from "node:module";
import {INSPECT} from "../docs/x402-quote-core.mjs";
import {MERCHANT,decodeBase64Json} from "../docs/checkout-core.mjs";
const req=createRequire("/srv/multi-vm-agent/workspace/make_money/work/lastone-mobile-playgama-pilot-20261019/package.json");
const {chromium}=req("playwright-core");
const root=resolve("docs");
const mime={".html":"text/html;charset=utf-8",".mjs":"application/javascript;charset=utf-8",".css":"text/css;charset=utf-8",".svg":"image/svg+xml"};
const server=createServer(async (request,response)=>{
 try{
  const u=new URL(request.url,"http://127.0.0.1");
  if(u.pathname.includes("..")||!Object.hasOwn(mime,extname(u.pathname)))throw Error("not allowed");
  const body=await readFile(join(root,u.pathname));
  response.writeHead(200,{"Content-Type":mime[extname(u.pathname)]});response.end(body);
 }catch{response.writeHead(404);response.end("not found");}
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
const url=`http://127.0.0.1:${server.address().port}/x402-quote-checker.html`;
let browser;
try{
 browser=await chromium.launch({executablePath:"/opt/google/chrome/chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu"]});
 const ctx=await browser.newContext({viewport:{width:1060,height:860}});
 const page=await ctx.newPage();
 await page.addInitScript(()=>{
  window.__walletCalls=[];
  window.ethereum={request:async({method})=>{
   window.__walletCalls.push(method);
   if(method==="eth_chainId")return "0x2105";
   if(method==="eth_requestAccounts")return ["0x9876543210098765432100987654321009876543"];
   if(method==="eth_call")return "0x4e20";
   if(method==="eth_signTypedData_v4")return "0x"+("aa".repeat(65));
   throw Error("Unexpected mock wallet method "+method);
  }};
  window.confirm=()=>true;
 });
 let firstRequests=0,lastSignedURL=null,body=null;
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.route("https://vm5-openapi-x402.onrender.com/v1/x402-preflight?**",async route=>{
  const request=route.request();assert.equal(request.method(),"GET");
  firstRequests++;
  assert.equal(new URL(request.url()).origin,"https://vm5-openapi-x402.onrender.com");
  assert.ok(new URL(request.url()).searchParams.get("quote")?.includes("example.invalid"));
  const paySig=request.headers()["payment-signature"];
  if(!paySig){
   const challenge={
    x402Version:2,
    resource:{url:request.url(),description:"Public quote inspector",mimeType:"application/json"},
    accepts:[{scheme:"exact",network:MERCHANT.network,amount:INSPECT.atomicAmount,asset:MERCHANT.asset,payTo:MERCHANT.payTo,maxTimeoutSeconds:300,extra:{name:"USD Coin",version:"2"}}],
    extensions:{},
   };
   await route.fulfill({status:402,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Expose-Headers":"PAYMENT-REQUIRED,PAYMENT-RESPONSE","PAYMENT-REQUIRED":btoa(JSON.stringify(challenge))},body:'{"error":"payment required"}'});
  }else{
   body=decodeBase64Json(paySig);lastSignedURL=request.url();
   await route.fulfill({status:200,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Expose-Headers":"PAYMENT-RESPONSE","PAYMENT-RESPONSE":btoa(JSON.stringify({success:true,transaction:"0x"+"ab".repeat(32)}))},
    body:JSON.stringify({ok:true,paid:true,chargedUSDC:"0.01",checks:[{check:"version",result:"pass"}],noSpendingAuthorized:true})});
  }
 });
 await page.goto(url,{waitUntil:"networkidle"});
 assert.equal(await page.locator("#inspect-get-quote").isDisabled(),true);
 assert.equal(await page.locator("#inspect-approve").isDisabled(),true);
 await page.locator("#inspect-local").click();
 assert.match(await page.locator("#inspect-free-output").innerText(),/noRemoteUrlFetched/);
 assert.equal(firstRequests,0);
 assert.deepEqual(await page.evaluate(()=>window.__walletCalls),[]);
 await page.locator("#inspect-share-consent").check();
 await page.locator("#inspect-get-quote").click();
 await page.locator("#inspect-price-details").waitFor({state:"visible",timeout:8500});
 assert.equal(firstRequests,1);
 assert.equal((await page.locator("#inspect-payee").textContent()).toLowerCase(),MERCHANT.payTo.toLowerCase());
 assert.match(await page.locator("#inspect-amount").textContent(),/0.01/);
 assert.deepEqual(await page.evaluate(()=>window.__walletCalls),[]);
 await page.locator("#inspect-paid-consent").check();
 await page.locator("#inspect-approve").click();
 await page.locator("#inspect-paid-output").waitFor({state:"visible",timeout:8500});
 assert.equal(firstRequests,2);
 assert.equal(body.payload.authorization.value,"10000");
 assert.equal(body.payload.authorization.to.toLowerCase(),MERCHANT.payTo.toLowerCase());
 assert.equal(body.resource.url,lastSignedURL);
 assert.equal(await page.locator("#inspect-approve").isDisabled(),true);
 assert.deepEqual(await page.evaluate(()=>window.__walletCalls),["eth_chainId","eth_requestAccounts","eth_call","eth_signTypedData_v4"]);
 assert.deepEqual(errors,[]);
 await mkdir("qa",{recursive:true});
 await page.screenshot({path:"qa/quote-inspector-mocked-paid-flow.png",fullPage:true});
 console.log("QUOTE_BUYER_MOCK_OK: true local preview no requests, separate public-quote consent, 0.01 exact URI/payTo, 2 requests, 1 fake wallet signature, 0 tokens");
 const bad=await ctx.newPage();
 await bad.addInitScript(()=>{
  window.__walletCalls=[];
  window.ethereum={request:async({method})=>{window.__walletCalls.push(method);throw Error("Wallet should never be used with tampered merchant quote: "+method)}};
 });
 await bad.route("https://vm5-openapi-x402.onrender.com/v1/x402-preflight?**",async route=>{
  const response={x402Version:2,resource:{url:route.request().url()},accepts:[{scheme:"exact",network:MERCHANT.network,amount:"50000",asset:MERCHANT.asset,payTo:MERCHANT.payTo,maxTimeoutSeconds:300,extra:{name:"USD Coin",version:"2"}}]};
  await route.fulfill({status:402,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Expose-Headers":"PAYMENT-REQUIRED","PAYMENT-REQUIRED":btoa(JSON.stringify(response))},body:"{}"});
 });
 await bad.goto(url,{waitUntil:"networkidle"});
 await bad.locator("#inspect-local").click();
 await bad.locator("#inspect-share-consent").check();
 await bad.locator("#inspect-get-quote").click();
 await bad.locator("#inspect-status[data-state=warning]").waitFor({timeout:7500});
 assert.equal(await bad.locator("#inspect-approve").isDisabled(),true);
 assert.deepEqual(await bad.evaluate(()=>window.__walletCalls),[]);
 console.log("QUOTE_TAMPERED_PRICE_FAILS_CLOSED_OK: amount changed, no wallet touched");
 const secret=await ctx.newPage();
 await secret.goto(url,{waitUntil:"networkidle"});
 await secret.locator("#inspect-input").fill('{"x402Version":2,"resource":{"url":"https://example.invalid/"},"accepts":[],"extensions":{"info":{"secret":"nope"}}}');
 await secret.locator("#inspect-local").click();
 await secret.locator("#inspect-status[data-state=warning]").waitFor({timeout:6500});
 assert.equal(await secret.locator("#inspect-get-quote").isDisabled(),true);
 console.log("NESTED_SECRET_PUBLIC_INPUT_REJECT_OK: no remote call or charge");
 console.log("QUOTE_MOCK_UI_RESULT 3/3, zero actual buyer payments");
}finally{
 if(browser)await browser.close();
 await new Promise(done=>server.close(done));
}
