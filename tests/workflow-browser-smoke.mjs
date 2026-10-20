/**
 * Zero-token integration test: fake wallet and mocked x402 responses.
 * No Ethereum signer, actual charge, or public remote API request.
 */
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,mkdir} from "node:fs/promises";
import {join,extname,resolve} from "node:path";
import {createRequire} from "node:module";
import {WORKFLOW,decodeBase64Json} from "../docs/workflow-core.mjs";
const req=createRequire("/srv/multi-vm-agent/workspace/make_money/work/lastone-mobile-playgama-pilot-20261019/package.json");
const {chromium}=req("playwright-core");
const root=resolve("docs");
const MIME={".html":"text/html;charset=UTF-8",".mjs":"application/javascript;charset=UTF-8",".css":"text/css;charset=UTF-8",".svg":"image/svg+xml"};
const server=createServer(async(request,response)=>{
 try{
  let path=new URL(request.url,"http://127.0.0.1").pathname;
  if(path==="/")path="/index.html";
  if(!Object.hasOwn(MIME,extname(path))||path.includes(".."))throw Error("Unexpected resource");
  const body=await readFile(join(root,path));
  response.writeHead(200,{"Content-Type":MIME[extname(path)]});response.end(body);
 }catch{response.writeHead(404);response.end("not found")}
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
const originalURL=`http://127.0.0.1:${server.address().port}/workflow-risk.html`;
const quote={
 x402Version:2,
 resource:{url:WORKFLOW.endpoint,description:"one risk report",mimeType:"application/json"},
 accepts:[{scheme:"exact",network:WORKFLOW.network,amount:WORKFLOW.amountAtomic,asset:WORKFLOW.asset,payTo:WORKFLOW.payTo,maxTimeoutSeconds:300,extra:{name:"USD Coin",version:"2"}}],
 extensions:{},
};
let browser;
try{
 browser=await chromium.launch({executablePath:"/opt/google/chrome/chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu"]});
 const context=await browser.newContext({viewport:{width:1080,height:840}});
 const page=await context.newPage();
 await page.addInitScript(()=>{
  window.__signedMethods=[];
  window.ethereum={request:async({method,params})=>{
   window.__signedMethods.push(method);
   if(method==="eth_chainId")return "0x2105";
   if(method==="eth_requestAccounts")return ["0x9876543210098765432100987654321009876543"];
   if(method==="eth_call")return "0x30d40";
   if(method==="eth_signTypedData_v4")return "0x"+("aa".repeat(65));
   throw Error("Unexpected mock method "+method);
  }};
  window.confirm=()=>true;
 });
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 let requests=0,paymentBody=null,paymentSignature=null;
 await page.route(WORKFLOW.endpoint,async route=>{
  const req=route.request(); assert.equal(req.method(),"POST");
  requests++;
  if(!req.headers()["payment-signature"]){
   const d=JSON.parse(req.postData());
   assert.equal(d.filename,"ci.yml");
   assert.equal(d.workflowYaml.includes("actions/checkout@v4"),true);
   assert.equal(requests,1);
   await route.fulfill({status:402,headers:{"access-control-allow-origin":"*","access-control-expose-headers":"PAYMENT-REQUIRED,PAYMENT-RESPONSE","payment-required":btoa(JSON.stringify(quote))},body:JSON.stringify({error:"Payment required"})});
  }else{
   paymentBody=JSON.parse(req.postData());
   paymentSignature=decodeBase64Json(req.headers()["payment-signature"]);
   await route.fulfill({status:200,headers:{"content-type":"application/json","access-control-allow-origin":"*","access-control-expose-headers":"PAYMENT-REQUIRED,PAYMENT-RESPONSE","payment-response":btoa(JSON.stringify({success:true,transaction:"0x"+("ab".repeat(32))}))},body:JSON.stringify({ok:true,paid:true,chargedUSDC:"0.20",findings:[{id:"ACTION_UNPINNED",line:7,severity:"medium"}],noWorkflowExecuted:true})});
  }
 });
 await page.goto(originalURL,{waitUntil:"networkidle"});
 assert.equal(await page.locator("#workflow-pay").isDisabled(),true);
 assert.equal(await page.locator("#workflow-review").isDisabled(),true);
 await page.locator("#workflow-free").click();
 await page.locator("#workflow-free-output").waitFor({state:"visible"});
 assert.match(await page.locator("#workflow-free-output").innerText(),/MUTABLE_ACTION/);
 assert.deepEqual(await page.evaluate(()=>window.__signedMethods),[]);
 await page.locator("#workflow-review").click();
 await page.locator("#workflow-quote").waitFor({state:"visible"});
 assert.match(await page.locator("#workflow-amount").innerText(),/0.20/);
 assert.equal((await page.locator("#workflow-payee").textContent()).toLowerCase(),WORKFLOW.payTo.toLowerCase());
 assert.deepEqual(await page.evaluate(()=>window.__signedMethods),[]);
 assert.equal(requests,1);
 await page.locator("#workflow-consent").check();
 await page.locator("#workflow-pay").click();
 await page.locator("#workflow-paid-result").waitFor({state:"visible",timeout:9000});
 assert.equal(requests,2);
 assert.equal(paymentSignature.payload.authorization.value,"200000");
 assert.equal(paymentSignature.payload.authorization.to.toLowerCase(),WORKFLOW.payTo.toLowerCase());
 assert.equal(paymentBody.filename,"ci.yml");
 assert.equal(paymentBody.includeSarif,true);
 assert.equal(paymentBody.workflowYaml.includes("actions/checkout@v4"),true);
 assert.deepEqual(await page.evaluate(()=>window.__signedMethods),["eth_chainId","eth_requestAccounts","eth_call","eth_signTypedData_v4"]);
 assert.equal(await page.locator("#workflow-pay").isDisabled(),true);
 assert.equal((await page.locator("#workflow-tx").getAttribute("href")),"https://basescan.org/tx/0x"+("ab".repeat(32)));
 assert.deepEqual(errors,[]);
 await mkdir("qa",{recursive:true});
 await page.screenshot({path:"qa/workflow-paid-browser-mock.png",fullPage:true});
 console.log("MOCKED_WORKFLOW_PAYMENT_PASS: report delivered, exact 0.20 USDC EIP712, recipient correct, one payment request, no buyer funds used.");
 const second=await context.newPage();
 await second.addInitScript(()=>{
  window.__walletMethods=[];
  window.ethereum={request:async({method})=>{window.__walletMethods.push(method);throw Error("Wallet must never be contacted with tampered quote.");}};
 });
 await second.route(WORKFLOW.endpoint,async route=>{
  const tampered=structuredClone(quote);tampered.accepts[0].amount="300000";
  await route.fulfill({status:402,headers:{"access-control-allow-origin":"*","access-control-expose-headers":"PAYMENT-REQUIRED","payment-required":btoa(JSON.stringify(tampered))},body:"{}"});
 });
 await second.goto(originalURL,{waitUntil:"networkidle"});
 await second.locator("#workflow-free").click();
 await second.locator("#workflow-review").click();
 await second.locator("#workflow-status[data-state=warning]").waitFor({timeout:7000});
 assert.equal(await second.locator("#workflow-pay").isDisabled(),true);
 assert.deepEqual(await second.evaluate(()=>window.__walletMethods),[]);
 console.log("MOCKED_WORKFLOW_WRONG_PAYMENT_FAIL_CLOSED_PASS: no wallet signature requested on changed amount.");
 console.log("WORKFLOW_BROWSER_MOCK_RESULT 2/2, ONLY FAKE WALLET, NO MAINNET TOKENS");
}finally{
 if(browser)await browser.close();
 await new Promise(done=>server.close(done));
}
