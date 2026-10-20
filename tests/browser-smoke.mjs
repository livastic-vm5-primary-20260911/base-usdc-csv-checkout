// Browser E2E smoke: no real wallet, no real payments; all paid responses are mocked.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,mkdir} from "node:fs/promises";
import {join,resolve,extname} from "node:path";
import {createRequire} from "node:module";
import {MERCHANT,decodeBase64Json} from "../docs/checkout-core.mjs";
const req=createRequire("/srv/multi-vm-agent/workspace/make_money/work/lastone-mobile-playgama-pilot-20261019/package.json");
const {chromium}=req("playwright-core");
const root=resolve("docs");
const mime={".html":"text/html;charset=utf-8",".mjs":"application/javascript;charset=utf-8",".css":"text/css;charset=utf-8",".svg":"image/svg+xml",".txt":"text/plain"};
const server=createServer(async(request,response)=>{
 let path="/";
 try{
  path=decodeURIComponent(new URL(request.url,"http://127.0.0.1").pathname);
  if(path==="/") path="/index.html";
  if(path.includes("..")||!Object.hasOwn(mime,extname(path)))throw Error("badpath");
  const raw=await readFile(join(root,path));
  response.writeHead(200,{"Content-Type":mime[extname(path)],"Cache-Control":"no-store"});response.end(raw);
 }catch{response.writeHead(404);response.end("not found")}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const url=`http://127.0.0.1:${server.address().port}/`;
const quote={
 x402Version:2, resource:{url:MERCHANT.endpoint,description:"CSV preflight",mimeType:"application/json"},
 accepts:[{scheme:"exact",network:MERCHANT.network,amount:"5000",asset:MERCHANT.asset,payTo:MERCHANT.payTo,maxTimeoutSeconds:300,extra:{name:"USD Coin",version:"2"}}],
 extensions:{},
};
const encodedQuote=btoa(JSON.stringify(quote));
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:"/opt/google/chrome/chrome",args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu"]});
 const context=await browser.newContext({viewport:{width:1240,height:900}});
 const page=await context.newPage();
 await page.addInitScript(()=>{
  window.__walletCalls=[];
  window.ethereum={request:async({method,params})=>{
   window.__walletCalls.push(method);
   if(method==="eth_chainId")return "0x2105";
   if(method==="eth_requestAccounts")return ["0x9876543210098765432100987654321009876543"];
   if(method==="eth_call")return "0x2710";
   if(method==="eth_signTypedData_v4")return "0x"+("aa".repeat(65));
   throw Error("Wallet mock rejected unauthorized method: "+method);
  }};
  window.confirm=()=>true;
 });
 let noWalletBeforePay=true;
 let signedPayload=null,quoteBody=null,paidBody=null,requests=0;
 await page.route(MERCHANT.endpoint,async route=>{
  const request=route.request();assert.equal(request.method(),"POST");
  requests++;
  const headers=request.headers();
  const reqBody=JSON.parse(request.postData());
  const withPay=headers["payment-signature"];
  if(!withPay){
   quoteBody=reqBody;
   assert.deepEqual(reqBody.expectedColumns,["email","amount","date","note"]);
   await route.fulfill({status:402,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"content-type,payment-signature","access-control-expose-headers":"PAYMENT-REQUIRED,PAYMENT-RESPONSE","payment-required":encodedQuote},body:JSON.stringify({error:"Payment required"})});
  }else{
   signedPayload=decodeBase64Json(withPay);
   paidBody=reqBody;
   const receipt=btoa(JSON.stringify({success:true,transaction:"0x"+"ab".repeat(32),network:MERCHANT.network}));
   await route.fulfill({status:200,headers:{"content-type":"application/json","access-control-allow-origin":"*","access-control-expose-headers":"PAYMENT-REQUIRED,PAYMENT-RESPONSE","payment-response":receipt},
    body:JSON.stringify({ok:true,paid:true,chargedUSDC:"0.005",dataRows:3,irregularRows:0,normalizedDuplicateRows:1,spreadsheetFormulaRiskCells:1})});
  }
 });
 const errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.goto(url,{waitUntil:"networkidle"});
 assert.equal(await page.title(),"CommaCheck Base — local CSV preview + 0.005 Base USDC on-demand audit");
 assert.equal(await page.locator("#inspect").isDisabled(),true);
 assert.equal(await page.locator("#authorize").isDisabled(),true);
 await page.locator("#preview").click();
 assert.match(await page.locator("#local-preview").innerText(),/3 rows/);
 assert.equal(await page.locator("#inspect").isDisabled(),false);
 assert.deepEqual(await page.evaluate(()=>window.__walletCalls),[]);
 await page.locator("#inspect").click();
 await page.locator("#payment-details").waitFor({state:"visible"});
 assert.equal((await page.locator("#recipient").textContent()).toLowerCase(),MERCHANT.payTo.toLowerCase());
 assert.equal(await page.locator("#authorize").isDisabled(),false);
 assert.deepEqual(await page.evaluate(()=>window.__walletCalls),[]);
 assert.equal(requests,1);
 assert.equal(JSON.stringify(quoteBody).includes("secret-user-csv"),false);
 await page.locator("#consent").check();
 await page.locator("#authorize").click();
 await page.locator("#paid-output").waitFor({state:"visible",timeout:10000});
 assert.equal(requests,2);
 assert.equal(await page.locator("#authorize").isDisabled(),true);
 assert.equal(signedPayload.accepted.amount,"5000");
 assert.equal(signedPayload.payload.authorization.to.toLowerCase(),MERCHANT.payTo.toLowerCase());
 assert.equal(signedPayload.payload.authorization.value,"5000");
 assert.equal(signedPayload.x402Version,2);
 assert.equal(paidBody.csvText,quoteBody.csvText);
 assert.equal((await page.locator("#transaction").getAttribute("href")),"https://basescan.org/tx/0x"+"ab".repeat(32));
 assert.deepEqual(await page.evaluate(()=>window.__walletCalls),["eth_chainId","eth_requestAccounts","eth_call","eth_signTypedData_v4"]);
 assert.deepEqual(errors,[]);
 await mkdir("qa",{recursive:true});
 await page.screenshot({path:"qa/checkout-ui-mocked-success.png",fullPage:true});
 console.log("BROWSER_MOCK_PAYMENT_PASS: no wallet before explicit click; signed EIP3009 single x402 POST; correct receiver, amount, token, no auto retry.");
 const secondary=await context.newPage();
 await secondary.addInitScript(()=>{window.__walletCalls=[];window.ethereum={request:async({method})=>{window.__walletCalls.push(method);throw Error("No wallet should be accessed for invalid quote.")}}});
 await secondary.route(MERCHANT.endpoint,async route=>{
   const bad=structuredClone(quote);bad.accepts[0].payTo="0x1111111111111111111111111111111111111111";
   await route.fulfill({status:402,headers:{"access-control-allow-origin":"*","access-control-expose-headers":"PAYMENT-REQUIRED","payment-required":btoa(JSON.stringify(bad))},body:"{}"});
 });
 await secondary.goto(url,{waitUntil:"networkidle"});
 await secondary.locator("#preview").click();
 await secondary.locator("#inspect").click();
 await secondary.locator("#status[data-state=warning]").waitFor({timeout:6000});
 assert.equal(await secondary.locator("#authorize").isDisabled(),true);
 assert.deepEqual(await secondary.evaluate(()=>window.__walletCalls),[]);
 console.log("BROWSER_QUOTE_TAMPERING_FAIL_CLOSED_PASS: malformed merchant recipient cannot access wallet.");
 console.log("BROWSER_MOCK_SMOKE_RESULT 2/2 successful local UI flows, 0 real tokens, 0 private wallet signing");
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
