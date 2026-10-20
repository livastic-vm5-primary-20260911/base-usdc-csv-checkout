import test from "node:test";
import assert from "node:assert/strict";
import {
 WORKFLOW,SAFE_SAMPLE_YAML,verifyWorkflowQuote,parseWorkflowPaymentRequired,
 checkYaml,checkFilename,localWorkflowPreview,verifyWorkflowPaidReport,
 createAuthorization,createPaymentHeader,decodeBase64Json,checkUsdcBalance,
} from "../docs/workflow-core.mjs";
const address="0x9876543210098765432100987654321009876543";
const quote=()=>({
 x402Version:2,
 resource:{url:WORKFLOW.endpoint,description:"GitHub Actions security preflight",mimeType:"application/json"},
 accepts:[{scheme:"exact",network:"eip155:8453",amount:"200000",asset:WORKFLOW.asset,payTo:WORKFLOW.payTo,maxTimeoutSeconds:300,extra:{name:"USD Coin",version:"2"}}],
 extensions:{},
});
test("public actual merchant, correct separate paid route and 40x price",()=>{
 assert.equal(WORKFLOW.network,"eip155:8453");
 assert.equal(WORKFLOW.chainId,8453);
 assert.equal(WORKFLOW.amountAtomic,"200000");
 assert.equal(WORKFLOW.priceUSDC,"0.20");
 assert.match(WORKFLOW.endpoint,/\/v1\/workflow-risk$/);
});
test("valid x402 route accepted before any wallet request",()=>{
 const q=verifyWorkflowQuote(quote());
 assert.equal(q.requirements.payTo,WORKFLOW.payTo);
});
for(const [name,edit] of [
 ["wrong x402 version",x=>x.x402Version=1],
 ["wrong quote resource",x=>x.resource.url="https://evil.example/v1/workflow-risk"],
 ["different chain",x=>x.accepts[0].network="eip155:1"],
 ["different scheme",x=>x.accepts[0].scheme="permit2"],
 ["wrong token",x=>x.accepts[0].asset="0x1111111111111111111111111111111111111111"],
 ["wrong payee",x=>x.accepts[0].payTo="0x1111111111111111111111111111111111111111"],
 ["undercharge",x=>x.accepts[0].amount="5000"],
 ["overcharge",x=>x.accepts[0].amount="250000"],
 ["missing acceptance",x=>x.accepts=[]],
 ["ambiguous payment options",x=>x.accepts.push(structuredClone(x.accepts[0]))],
 ["wrong token domain",x=>x.accepts[0].extra.name="Fake USD Coin"],
 ["wrong token signing version",x=>x.accepts[0].extra.version="1"],
 ["unbounded timeout",x=>x.accepts[0].maxTimeoutSeconds=600],
 ["too short timeout",x=>x.accepts[0].maxTimeoutSeconds=1],
 ["wrong transfer method",x=>x.accepts[0].extra.assetTransferMethod="permit"],
 ["wrong payment flow",x=>x.accepts[0].extra.paymentFlow="authorization"]]){
 test("fail closed: "+name,()=>{
  const x=quote();edit(x);assert.throws(()=>verifyWorkflowQuote(x));
 });
}
test("Base64 PAYMENT-REQUIRED decode, never blind JSON trust",()=>{
 const encoded=btoa(JSON.stringify(quote()));
 assert.equal(parseWorkflowPaymentRequired(encoded).requirements.amount,"200000");
 assert.throws(()=>parseWorkflowPaymentRequired("junk!!!"));
});
test("48KiB input cutoff and nonsecret YAML",()=>{
 assert.equal(checkYaml("name: a\n"),8);
 assert.throws(()=>checkYaml(""));
 assert.throws(()=>checkYaml("✨".repeat(20000)),/exceeds/);
 assert.throws(()=>checkYaml("name:\u0000"));
});
test("safe filename only, not directory traversal",()=>{
 assert.equal(checkFilename("ci.yml"),"ci.yml");
 assert.equal(checkFilename("build-prod.yaml"),"build-prod.yaml");
 assert.throws(()=>checkFilename("../../.env"));
 assert.throws(()=>checkFilename("/etc/passwd"));
 assert.throws(()=>checkFilename("ci.txt"));
});
test("local example detects unpinned checkout without claims of full YAML security analysis",()=>{
 const data=localWorkflowPreview(SAFE_SAMPLE_YAML);
 assert.equal(data.possibleWarnings,1);
 assert.equal(data.warnings[0].tag,"MUTABLE_ACTION");
 assert.match(data.scope,/regex hints only/i);
});
test("free hints for broad tokens, risky events, and self-hosted runners",()=>{
 const text="name: dangerous\non: [pull_request_target]\npermissions: write-all\njobs:\n x:\n  runs-on: self-hosted\n";
 const data=localWorkflowPreview(text);
 assert.equal(data.possibleWarnings,3);
 assert.deepEqual(new Set(data.warnings.map(x=>x.tag)),new Set(["PR_TARGET","BROAD_TOKEN","SELF_HOSTED"]));
});
test("comments are not warnings",()=>{
 const r=localWorkflowPreview("# uses: actions/checkout@v4\nname: sample\n");
 assert.equal(r.possibleWarnings,0);
});
test("exact 0.20 successful paid JSON required",()=>{
 assert.equal(verifyWorkflowPaidReport({ok:true,paid:true,chargedUSDC:"0.20",findings:[]}).paid,true);
 assert.throws(()=>verifyWorkflowPaidReport({ok:true,paid:false,chargedUSDC:"0.20",findings:[]}));
 assert.throws(()=>verifyWorkflowPaidReport({ok:true,paid:true,chargedUSDC:"0.005",findings:[]}));
 assert.throws(()=>verifyWorkflowPaidReport({ok:true,paid:true,chargedUSDC:"0.20",findings:null}));
});
test("known actual 0.20 EIP712 transfer amount against original VM5 wallet",()=>{
 const q=verifyWorkflowQuote(quote());
 const {authorization,typedData}=createAuthorization({account:address,quote:q,nowSeconds:1792480000,nonce:"0x"+"01".repeat(32)});
 assert.equal(authorization.value,"200000");
 assert.equal(authorization.to.toLowerCase(),WORKFLOW.payTo.toLowerCase());
 assert.equal(typedData.domain.verifyingContract.toLowerCase(),WORKFLOW.asset.toLowerCase());
 assert.equal(typedData.domain.name,"USD Coin");
 assert.equal(typedData.primaryType,"TransferWithAuthorization");
 assert.equal(checkUsdcBalance("0x30d40",authorization.value),true);
 assert.throws(()=>checkUsdcBalance("0x1388",authorization.value));
 const signature="0x"+"aa".repeat(65);
 const body=decodeBase64Json(createPaymentHeader({quote:q,signature,authorization}));
 assert.equal(body.payload.authorization.value,"200000");
 assert.equal(body.accepted.payTo,WORKFLOW.payTo);
});
test("no autosign, no real private key, no browser analytics in app",async()=>{
 const {readFile}=await import("node:fs/promises");
 const app=await readFile(new URL("../docs/workflow-app.mjs",import.meta.url),"utf8");
 const html=await readFile(new URL("../docs/workflow-risk.html",import.meta.url),"utf8");
 assert.ok(app.includes('$("workflow-pay").addEventListener("click"'));
 assert.match(app,/PAYMENT-SIGNATURE/);
 assert.match(app,/eth_signTypedData_v4/);
 assert.match(app,/SAFE_SAMPLE_YAML/);
 assert.match(app,/state\.signed=true/);
 assert.doesNotMatch(app,/localStorage|sessionStorage|\bprivateKey\b|eth_sendTransaction/);
 assert.match(html,/nonconfidential/i);
 assert.doesNotMatch(html,/<script[^>]+https?:\/\//);
});
