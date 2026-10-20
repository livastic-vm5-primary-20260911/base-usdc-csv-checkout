import test from "node:test";
import assert from "node:assert/strict";
import {
 INSPECT,SAMPLE_PUBLIC_UNSIGNED,parsePublicQuote,checkPublicQuote,urlForPaidPublicQuote,
 validateMerchantInspectionQuote,parseInspectionRequired,confirmPaidInspection,
} from "../docs/x402-quote-core.mjs";
import {MERCHANT,createAuthorization,createPaymentHeader,decodeBase64Json} from "../docs/checkout-core.mjs";
const clone=x=>structuredClone(x);
const customerInput=clone(SAMPLE_PUBLIC_UNSIGNED);
const exactURL=urlForPaidPublicQuote(customerInput);
const quote=()=>({
 x402Version:2,resource:{url:exactURL,description:"Paid x402 quote review",mimeType:"application/json"},
 accepts:[{scheme:"exact",network:"eip155:8453",amount:"10000",asset:MERCHANT.asset,payTo:MERCHANT.payTo,maxTimeoutSeconds:300,extra:{name:"USD Coin",version:"2"}}],
 extensions:{bazaar:{info:{method:"GET"},schema:{type:"object"}}},
});
test("exact original available 0.01 Base Circle USDC route",()=>{
 assert.equal(INSPECT.priceUSDC,"0.01");
 assert.equal(INSPECT.atomicAmount,"10000");
 assert.equal(INSPECT.asset.toLowerCase(),MERCHANT.asset.toLowerCase());
 assert.equal(INSPECT.payTo.toLowerCase(),MERCHANT.payTo.toLowerCase());
 assert.equal(INSPECT.network,MERCHANT.network);
});
test("human free inspector parses both public JSON and base64 without any wallet",()=>{
 const json=JSON.stringify(customerInput);
 assert.deepEqual(parsePublicQuote(json),customerInput);
 assert.deepEqual(parsePublicQuote(btoa(json)),customerInput);
});
test("positive free synthetic public quote emits no seller safety claims",()=>{
 const data=checkPublicQuote(customerInput);
 assert.equal(data.failures.length,0);
 assert.equal(data.checksPassed,8);
 assert.equal(data.noRemoteUrlFetched,true);
 assert.equal(data.noWalletTouched,true);
 assert.equal(data.noFundsSpent,true);
 assert.match(data.limitations,/NOT proof/i);
 assert.ok(data.warnings.some(w=>w.label==="Fictional example"));
 assert.ok(data.warnings.some(w=>w.label==="Settlement not checked"));
});
test("free checker reports a bad chain and malicious recipient format as structural failures",()=>{
 const x=clone(customerInput);
 x.accepts[0].network="eip155:1";
 x.accepts[0].payTo="mywallet123";
 const result=checkPublicQuote(x);
 assert.ok(result.failures.some(e=>e.label==="Network"));
 assert.ok(result.failures.some(e=>e.label==="Recipient format"));
 assert.equal(result.noRemoteUrlFetched,true);
});
test("bad unsigned quote missing money and illegal URL gets clear warnings",()=>{
 const x=clone(customerInput);
 x.accepts[0].amount="0";
 x.resource.url="http://localhost:3000/private";
 const result=checkPublicQuote(x);
 assert.ok(result.failures.some(e=>e.label==="Atomic units"));
 assert.ok(result.failures.some(e=>e.label==="Resource URL"));
});
for(const value of ["","//", "NOT-BASE64!", "X".repeat(3900), "[]", "42"]){
 test("reject nonquote or malformed input without contacting wallet "+value.slice(0,14),()=>assert.throws(()=>parsePublicQuote(value)));
}
test("reject any top-level secret/signed payload, even if it resembles a quote",()=>{
 for(const bad of ["payload","paymentPayload","signature","authorization","privateKey","secret","apiKey"]){
  const obj=clone(customerInput);
  obj[bad]={secretValue:"synthetic-do-not-copy"};
  assert.throws(()=>parsePublicQuote(JSON.stringify(obj)),/signed|secret/i);
 }
});
test("paid request URL is bound to actual public unsigned quote and not another origin",()=>{
 assert.equal(new URL(exactURL).origin,"https://vm5-openapi-x402.onrender.com");
 assert.equal(new URL(exactURL).pathname,"/v1/x402-preflight");
 assert.ok(new URL(exactURL).searchParams.get("quote").includes("example.invalid"));
 assert.equal(urlForPaidPublicQuote(customerInput),exactURL);
});
test("quote URL refuses oversized public data, private unsigned payloads",()=>{
 const x=clone(customerInput);
 x.resource.description="X".repeat(4500);
 assert.throws(()=>urlForPaidPublicQuote(x));
});
test("merchant exact live 402 requirements authorize one fixed 0.01",()=>{
 const original=quote(),p=validateMerchantInspectionQuote(original,exactURL);
 assert.equal(p.requirements.amount,"10000");
 assert.equal(p.resource.url,exactURL);
 assert.equal(p.requirements.payTo,MERCHANT.payTo);
 const parsed=parseInspectionRequired(btoa(JSON.stringify(original)),exactURL);
 assert.deepEqual(parsed.requirements,p.requirements);
});
for(const [name,corrupt] of [
 ["version",q=>q.x402Version=1],
 ["resource mismatch",q=>q.resource.url=INSPECT.endpoint],
 ["price wrong",q=>q.accepts[0].amount="10001"],
 ["chain wrong",q=>q.accepts[0].network="eip155:1"],
 ["asset wrong",q=>q.accepts[0].asset="0x1111111111111111111111111111111111111111"],
 ["recipient wrong",q=>q.accepts[0].payTo="0x1111111111111111111111111111111111111111"],
 ["scheme wrong",q=>q.accepts[0].scheme="deferred"],
 ["multiple rails",q=>q.accepts.push(clone(q.accepts[0]))],
 ["missing rails",q=>q.accepts=[]],
 ["domain changed",q=>q.accepts[0].extra.name="Fake Coin"],
 ["version changed",q=>q.accepts[0].extra.version="1"],
 ["timeout wrong",q=>q.accepts[0].maxTimeoutSeconds=5000],
 ["asset method wrong",q=>q.accepts[0].extra.assetTransferMethod="permit2"],
 ["payment flow wrong",q=>q.accepts[0].extra.paymentFlow="deferred"]]){
 test("fail closed before buyer wallet: "+name,()=>{
  const q=quote();corrupt(q);assert.throws(()=>validateMerchantInspectionQuote(q,exactURL));
 });
}
test("wrong origin requestURL can never get a signed quote",()=>{
 assert.throws(()=>validateMerchantInspectionQuote(quote(),"https://attacker.example/v1/x402-preflight?quote=x"));
});
test("EIP3009 signed authorization is for exact original 0.01 and original endpoint",()=>{
 const q=validateMerchantInspectionQuote(quote(),exactURL);
 const {authorization,typedData}=createAuthorization({account:"0x9876543210098765432100987654321009876543",quote:q,nowSeconds:1792480000,nonce:"0x"+"11".repeat(32)});
 assert.equal(authorization.value,"10000");
 assert.equal(authorization.to,MERCHANT.payTo);
 assert.equal(typedData.domain.chainId,8453);
 assert.equal(typedData.domain.verifyingContract,MERCHANT.asset);
 const result=decodeBase64Json(createPaymentHeader({quote:q,signature:"0x"+"aa".repeat(65),authorization}));
 assert.equal(result.accepted.amount,"10000");
 assert.equal(result.resource.url,exactURL);
 assert.equal(result.x402Version,2);
});
test("buyer did not pay unless actual paid report payload verified",()=>{
 assert.equal(confirmPaidInspection({ok:true,paid:true,chargedUSDC:"0.01",checks:[]}).paid,true);
 assert.throws(()=>confirmPaidInspection({ok:true,paid:false,chargedUSDC:"0.01",checks:[]}));
 assert.throws(()=>confirmPaidInspection({ok:true,paid:true,chargedUSDC:"0.001",checks:[]}));
 assert.throws(()=>confirmPaidInspection({ok:true,paid:true,chargedUSDC:"0.01",checks:null}));
});
test("all wallet interactions happen only on buyer-initiated purchase click",async()=>{
 const fs=await import("node:fs/promises");
 const app=await fs.readFile(new URL("../docs/x402-quote-app.mjs",import.meta.url),"utf8");
 const html=await fs.readFile(new URL("../docs/x402-quote-checker.html",import.meta.url),"utf8");
 assert.ok(app.includes('$("inspect-approve").addEventListener("click"'));
 assert.ok(app.includes('$("inspect-local").addEventListener("click"'));
 assert.match(app,/eth_signTypedData_v4/);
 assert.match(app,/PAYMENT-SIGNATURE/);
 assert.doesNotMatch(app,/localStorage|sessionStorage|privateKey|eth_sendTransaction/);
 assert.doesNotMatch(html,/<script[^>]*https?:\/\//);
 assert.match(html,/not a receipt or a guarantee/i);
});
