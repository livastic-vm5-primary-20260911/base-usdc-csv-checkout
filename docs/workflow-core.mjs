/** VM5 hosted, original VM2 MIT-sourced workflow-risk analyzer: independent paid route.
 * This client rejects unexpected Base USDC amounts, chain, token or payee BEFORE wallet access.
 */
import {MERCHANT,createAuthorization,createPaymentHeader,makeSecureNonce,balanceOfCalldata,checkUsdcBalance,decodeBase64Json} from "./checkout-core.mjs";
export {createAuthorization,createPaymentHeader,makeSecureNonce,balanceOfCalldata,checkUsdcBalance,decodeBase64Json};
export const WORKFLOW=Object.freeze({
 endpoint:"https://vm5-openapi-x402.onrender.com/v1/workflow-risk",
 sample:"https://vm5-openapi-x402.onrender.com/v1/workflow-risk-sample",
 amountAtomic:"200000",
 priceUSDC:"0.20",
 maxBytes:48000,
 filename:"ci.yml",
 network:MERCHANT.network,
 chainId:MERCHANT.chainId,
 chainHex:MERCHANT.chainHex,
 asset:MERCHANT.asset,
 payTo:MERCHANT.payTo,
});
export const SAFE_SAMPLE_YAML=`name: test
on: pull_request
permissions: {contents: read}
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`;
const addr=(a,b)=>typeof a==="string" && a.toLowerCase()===b.toLowerCase();
export function verifyWorkflowQuote(q){
 if(!q||Array.isArray(q)||typeof q!=="object"||q.x402Version!==2)throw Error("Expected genuine x402 v2 quote.");
 if(q.resource?.url!==WORKFLOW.endpoint)throw Error("Quote target URL differs from known original workflow API.");
 if(!Array.isArray(q.accepts)||q.accepts.length!==1)throw Error("Expected exactly one permitted payment option.");
 const a=q.accepts[0];
 if(a.scheme!=="exact"||a.network!==WORKFLOW.network)throw Error("Unsupported chain/payment scheme.");
 if(a.amount!==WORKFLOW.amountAtomic)throw Error("Unexpected price, refusing payment.");
 if(!addr(a.asset,WORKFLOW.asset))throw Error("Unexpected token, refusing payment.");
 if(!addr(a.payTo,WORKFLOW.payTo))throw Error("Unexpected payment recipient, refusing payment.");
 if(a.extra?.name!=="USD Coin"||a.extra?.version!=="2")throw Error("Wrong EIP712 token signing domain.");
 if(!Number.isSafeInteger(a.maxTimeoutSeconds)||a.maxTimeoutSeconds<45||a.maxTimeoutSeconds>300)throw Error("Unexpected authorization timeout.");
 if(a.extra?.assetTransferMethod && a.extra.assetTransferMethod!=="eip3009")throw Error("Unsupported token transfer method.");
 if(a.extra?.paymentFlow && a.extra.paymentFlow!=="direct")throw Error("Unsupported payment routing.");
 return Object.freeze({requirements:a,resource:q.resource,extensions:q.extensions||{}});
}
export function parseWorkflowPaymentRequired(s){
 if(typeof s!=="string"||s.length>65000||s.length<12||!/^[a-zA-Z0-9+/_=-]+$/.test(s))throw Error("Malformed PAYMENT-REQUIRED.");
 let json;
 try{
  const bytes=Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")),b=>b.charCodeAt(0));
  json=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
 }catch{throw Error("Cannot decode merchant payment quote.");}
 return verifyWorkflowQuote(json);
}
export function checkYaml(s){
 if(typeof s!=="string"||s.length===0)throw Error("Choose a nonsecret GitHub Actions YAML file.");
 const bytes=new TextEncoder().encode(s).byteLength;
 if(bytes>WORKFLOW.maxBytes)throw Error("Source exceeds 48,000 UTF-8 bytes.");
 if(s.indexOf("\u0000")!==-1)throw Error("NUL byte is invalid workflow YAML.");
 return bytes;
}
export function checkFilename(name) {
 if(typeof name!=="string"||name.length>94||!/^[\w.\-]+\.(?:yaml|yml)$/i.test(name))throw Error("Filename must be a safe .yml/.yaml basename.");
 return name;
}
export function localWorkflowPreview(yaml){
 const bytes=checkYaml(yaml);
 const lines=yaml.replace(/\r\n?/g,"\n").split("\n");
 const alerts=[];
 const add=(tag,explanation,lineIndex)=>alerts.push({tag,explanation,line:lineIndex+1});
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(/^\s*#/.test(line))continue;
  if(/^\s*permissions:\s*write-all(?:\s*#.*)?$/i.test(line))add("BROAD_TOKEN","Workflow token may be broadly write-capable.",i);
  if(/^\s*pull_request_target\s*:/i.test(line) || /^\s*on:\s*\[?\s*pull_request_target/i.test(line))add("PR_TARGET","Review pull_request_target carefully around untrusted PR code.",i);
  if(/\bself-hosted\b/.test(line))add("SELF_HOSTED","Self-hosted runners may expose environment state to workflows.",i);
  if(/\buses:\s*[\w./-]+@(?!(?:[0-9a-f]{40})(?:\s|$|\s*#))[^\s#]+/i.test(line))add("MUTABLE_ACTION","Action reference is not pinned to a full immutable SHA.",i);
  if(/\$\{\{\s*github\.event\.(?:pull_request\.(?:title|body)|issue\.(?:title|body))\s*\}\}/i.test(line))add("EVENT_INTERPOLATION","Untrusted issue/PR strings may be dangerous inside shell run blocks.",i);
 }
 return {lines:lines.length,bytes,possibleWarnings:alerts.length,warnings:alerts.slice(0,24),truncated:alerts.length>24,scope:"Local regex hints only. Does NOT parse full YAML or certify security."};
}
export function verifyWorkflowPaidReport(json){
 if(json?.ok!==true||json?.paid!==true||json?.chargedUSDC!==WORKFLOW.priceUSDC||!Array.isArray(json?.findings))throw Error("Paid workflow-risk report not independently confirmed; never automatically retry.");
 return json;
}
