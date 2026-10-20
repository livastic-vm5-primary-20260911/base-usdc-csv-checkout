import test from "node:test";
import assert from "node:assert/strict";
import {
  MERCHANT,PUBLIC_SYNTHETIC_QUOTE_BODY,validateQuote,parsePaymentRequired,
  createAuthorization,createPaymentHeader,decodeBase64Json,
  makeSecureNonce,checkCsvByteLimit,balanceOfCalldata,checkUsdcBalance,validateResultBody,
} from "../docs/checkout-core.mjs";
import {parseCsv,previewCsv} from "../docs/csv-preview.mjs";

const address="0x9876543210098765432100987654321009876543";
const originalQuote=()=>({
 x402Version:2,
 resource:{url:MERCHANT.endpoint,description:"Customer supplied CSV preflight",mimeType:"application/json"},
 accepts:[{scheme:"exact",network:MERCHANT.network,amount:"5000",asset:MERCHANT.asset,payTo:MERCHANT.payTo,maxTimeoutSeconds:300,extra:{name:"USD Coin",version:"2"}}],
 extensions:{bazaar:{info:{test:true},schema:{type:"object"}}},
});
const copy=x=>JSON.parse(JSON.stringify(x));
test("known safe public merchant Base token recipient match",()=>{
 assert.equal(MERCHANT.chainId,8453);
 assert.equal(MERCHANT.chainHex,"0x2105");
 assert.equal(MERCHANT.amountAtomic,"5000");
 assert.match(MERCHANT.payTo,/^0x[0-9a-fA-F]{40}$/);
 assert.match(MERCHANT.asset,/^0x[0-9a-fA-F]{40}$/);
 assert.equal(MERCHANT.priceUSDC,"0.005");
});
test("valid independent firstparty x402 quote accepted",()=>{
 const q=validateQuote(originalQuote());
 assert.equal(q.requirements.network,"eip155:8453");
 assert.equal(q.requirements.amount,"5000");
 assert.equal(q.resource.url,MERCHANT.endpoint);
});
for(const [key,patch] of [
 ["bad version",x=>x.x402Version=1],
 ["wrong scheme",x=>x.accepts[0].scheme="deferred"],
 ["wrong chain",x=>x.accepts[0].network="eip155:1"],
 ["too much money",x=>x.accepts[0].amount="5001"],
 ["too little money",x=>x.accepts[0].amount="4999"],
 ["wrong token",x=>x.accepts[0].asset="0x1111111111111111111111111111111111111111"],
 ["wrong payee",x=>x.accepts[0].payTo="0x1111111111111111111111111111111111111111"],
 ["wrong URL",x=>x.resource.url="https://evil.example/v1/csv-preflight"],
 ["wrong token domain name",x=>x.accepts[0].extra.name="Evil Coin"],
 ["wrong token version",x=>x.accepts[0].extra.version="1"],
 ["zero timeout",x=>x.accepts[0].maxTimeoutSeconds=0],
 ["huge timeout",x=>x.accepts[0].maxTimeoutSeconds=10000],
 ["multiple confusing accepted coins",x=>x.accepts.push(copy(x.accepts[0]))],
 ["unsupported transfer",x=>x.accepts[0].extra.assetTransferMethod="permit2"],
 ["unsupported payment flow",x=>x.accepts[0].extra.paymentFlow="deferred"]
]){
 test(`fail closed: ${key}`,()=>{const q=originalQuote();patch(q);assert.throws(()=>validateQuote(q));});
}
test("base64 decoded quote is exact original resource, not JSON in body only",()=>{
 const encoded=btoa(JSON.stringify(originalQuote()));
 assert.equal(parsePaymentRequired(encoded).requirements.amount,"5000");
 assert.throws(()=>parsePaymentRequired("garbage!"));
 assert.throws(()=>parsePaymentRequired(""));
});
test("EIP-712 typed data uses native Circle USD Coin domain and transfer authorization",()=>{
 const quote=validateQuote(originalQuote()),nowSeconds=1792480000;
 const nonce="0x"+"a7".repeat(32);
 const {authorization,typedData}=createAuthorization({account:address,quote,nowSeconds,nonce});
 assert.equal(typedData.domain.name,"USD Coin");
 assert.equal(typedData.domain.version,"2");
 assert.equal(typedData.domain.chainId,8453);
 assert.equal(typedData.domain.verifyingContract,MERCHANT.asset);
 assert.equal(typedData.primaryType,"TransferWithAuthorization");
 assert.deepEqual(typedData.types.TransferWithAuthorization.map(t=>t.name),["from","to","value","validAfter","validBefore","nonce"]);
 assert.equal(authorization.from,address);
 assert.equal(authorization.to,MERCHANT.payTo);
 assert.equal(authorization.value,"5000");
 assert.equal(authorization.validAfter,String(nowSeconds-60));
 assert.equal(authorization.validBefore,String(nowSeconds+300));
});
test("secure nonce is exactly 32 browser-crypto bytes; no predictable fallback",()=>{
 const fake={getRandomValues:a=>{for(let i=0;i<a.length;i++)a[i]=i+1;return a}};
 assert.equal(makeSecureNonce(fake),"0x"+Array.from({length:32},(_,i)=>(i+1).toString(16).padStart(2,"0")).join(""));
 assert.throws(()=>makeSecureNonce({}));
 assert.throws(()=>makeSecureNonce({getRandomValues:a=>{a.fill(0);return a;}}));
});
test("client encodes x402 v2 PAYMENT-SIGNATURE with no private key",()=>{
 const quote=validateQuote(originalQuote());
 const {authorization}=createAuthorization({account:address,quote,nowSeconds:1792480000,nonce:"0x"+"1f".repeat(32)});
 const signature="0x"+"aa".repeat(65);
 const header=createPaymentHeader({quote,authorization,signature});
 const decoded=decodeBase64Json(header);
 assert.equal(decoded.x402Version,2);
 assert.equal(decoded.accepted.payTo,MERCHANT.payTo);
 assert.equal(decoded.payload.authorization.value,"5000");
 assert.equal(decoded.payload.signature,signature);
 assert.deepEqual(decoded.extensions,originalQuote().extensions);
 assert.equal(JSON.stringify(decoded).includes("privateKey"),false);
});
test("reject corrupt wallet signature and changed authorization",()=>{
 const quote=validateQuote(originalQuote());
 const {authorization}=createAuthorization({account:address,quote,nowSeconds:1792480000,nonce:"0x"+"00".repeat(31)+"01"});
 assert.throws(()=>createPaymentHeader({quote,authorization,signature:"0x01"}));
 assert.throws(()=>createPaymentHeader({quote,authorization:{...authorization,to:address},signature:"0x"+"bb".repeat(65)}));
 assert.throws(()=>createPaymentHeader({quote,authorization:{...authorization,value:"10000"},signature:"0x"+"bb".repeat(65)}));
});
test("USDC balance query never sends a transaction",()=>{
 const call=balanceOfCalldata(address);
 assert.ok(call.startsWith("0x70a08231"));
 assert.equal(call.length,74);
 assert.equal(call.slice(-40),address.slice(2).toLowerCase());
 assert.equal(checkUsdcBalance("0x1388"),true);
 assert.throws(()=>checkUsdcBalance("0x1387"),/insufficient/);
 assert.throws(()=>checkUsdcBalance("oops"));
});
test("only confirmed correct-priced paid reports qualify as paid delivery",()=>{
 assert.equal(validateResultBody({ok:true,paid:true,chargedUSDC:"0.005",dataRows:4}).dataRows,4);
 for(const body of [
  {ok:false,paid:false,chargedUSDC:"0"},
  {ok:true,paid:false,chargedUSDC:"0.005"},
  {ok:true,paid:true,chargedUSDC:"0.5"},
  {ok:true,paid:true,chargedUSDC:"0.005000"}
 ]) assert.throws(()=>validateResultBody(body));
});
test("real example preview contains formula-risk / duplicates",()=>{
 const p=previewCsv(PUBLIC_SYNTHETIC_QUOTE_BODY.csvText);
 assert.equal(p.columns,4);
 assert.equal(p.dataRows,3);
 assert.equal(p.duplicates,1);
 assert.equal(p.formulaRiskCells,1);
 assert.equal(p.irregularRows,0);
});
test("CSV parser handles quoted commas, escaped quotes and multiline fields",()=>{
 const r=parseCsv('name,description\n"A, B","say ""hi"""\nC,"multi\nline"\n');
 assert.deepEqual(r,[["name","description"],["A, B",'say "hi"'],["C","multi\nline"]]);
});
test("CSV parser handles BOM and empty trailing lines",()=>{
 assert.deepEqual(parseCsv('\uFEFFa,b\r\n1,2\r\n'),[["a","b"],["1","2"]]);
});
test("CSV preview counts missing, irregular and duplicated headers",()=>{
 const p=previewCsv("x,X,c\n1,2\n1,2\n3,,6\n");
 assert.equal(p.headerDuplicates,1);
 assert.equal(p.irregularRows,2);
 assert.equal(p.duplicates,1);
 assert.equal(p.missingCells,3);
});
test("quoted cell can include prefixed equals without pretending it safe",()=>{
 const p=previewCsv('x,y\n"=SUM(1,2)",1');
 assert.equal(p.formulaRiskCells,1);
});
test("CSV parser rejects broken quotes or invalid headings",()=>{
 assert.throws(()=>parseCsv('h,k\n"unclosed,2'),/Unclosed/);
 assert.throws(()=>previewCsv('a,,c\n1,2,3'),/Header/);
 assert.throws(()=>parseCsv('a,b\n1,2"x"'),/Unexpected quote/);
});
test("byte max rejects more than 32 KiB and empty inputs",()=>{
 assert.throws(()=>checkCsvByteLimit(""));
 assert.throws(()=>checkCsvByteLimit("🚀".repeat(9000)));
 assert.equal(checkCsvByteLimit("a,b\n1,2"),7);
});
test("no hidden auto wallet interaction or storage in authored frontend",async()=>{
 const {readFile}=await import("node:fs/promises");
 const app=await readFile(new URL("../docs/app.mjs",import.meta.url),"utf8");
 const html=await readFile(new URL("../docs/index.html",import.meta.url),"utf8");
 assert.ok(app.includes('$("authorize").addEventListener("click"'));
 assert.match(app,/eth_signTypedData_v4/);
 assert.match(app,/PAYMENT-SIGNATURE/);
 assert.match(app,/PUBLIC_SYNTHETIC_QUOTE_BODY/);
 assert.match(app,/state\.signatureAttempted/);
 assert.doesNotMatch(app,/localStorage|sessionStorage|privateKey|wallet_sendTransaction|eth_sendTransaction/);
 assert.match(html,/nonconfidential/i);
 assert.match(html,/never paste passwords/i);
 assert.doesNotMatch(html,/<script[^>]*https?:\/\//);
});
