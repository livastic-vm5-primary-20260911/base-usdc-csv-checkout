/**
 * Unsigned public x402 quote inspector, no network request or wallet required.
 * The optional hosted verifier is an already existing VM5 merchant route;
 * this file never signs with the owner's wallet or returns a safety guarantee.
 */
import {MERCHANT} from "./checkout-core.mjs";
export const INSPECT=Object.freeze({
  endpoint:"https://vm5-openapi-x402.onrender.com/v1/x402-preflight",
  sample:"https://vm5-openapi-x402.onrender.com/v1/x402-sample",
  priceUSDC:"0.01",atomicAmount:"10000",
  maxUserInputChars:3800,maxDecodedChars:12000,
  network:MERCHANT.network, asset:MERCHANT.asset, payTo:MERCHANT.payTo,
});
export const SAMPLE_PUBLIC_UNSIGNED={
 x402Version:2,
 resource:{url:"https://example.invalid/demo",description:"FICTIONAL public x402 sample, no real product",mimeType:"application/json"},
 accepts:[{scheme:"exact",network:"eip155:8453",amount:"10000",asset:MERCHANT.asset,payTo:"0x1111111111111111111111111111111111111111",maxTimeoutSeconds:300,extra:{name:"USD Coin",version:"2"}}],
 extensions:{},
};
const EVM_ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const same=(a,b)=>typeof a==="string" && a.toLowerCase()===b.toLowerCase();
const text=(value)=>typeof value==="string" ? value.trim() : "";
export function parsePublicQuote(raw) {
 const input=text(raw);
 if(input.length===0||input.length>INSPECT.maxUserInputChars) throw Error("Paste a nonsecret unsigned x402 v2 JSON or base64 quote (maximum 3,800 characters).");
 let parsed;
 if(input.startsWith("{")){
  try{parsed=JSON.parse(input)}catch{throw Error("Invalid JSON. Check the unsigned public quote format.");}
 }else{
  if(!/^[a-zA-Z0-9+/_=-]+$/.test(input))throw Error("Invalid base64 payment-required header encoding.");
  try{
   const binary=atob(input.replace(/-/g,"+").replace(/_/g,"/"));
   const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
   const decoded=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
   if(decoded.length>INSPECT.maxDecodedChars)throw Error("Oversized decoded public quote.");
   parsed=JSON.parse(decoded);
  }catch{throw Error("Cannot decode unsigned x402 v2 payment-required header.");}
 }
 if(!parsed || Array.isArray(parsed)||typeof parsed!=="object")throw Error("Quote must be one JSON object.");
 // Do not forward or display signatures/private user credentials or signed payloads.
 if(/"(?:privatekey|paymentpayload|signature|authorization|seedphrase|secret|apikey|password|accesstoken|bearer)"\s*:/i.test(input))
   throw Error("Do not paste public quotes containing signed payment, private credentials or secret fields.");
 if(parsed.payload!==undefined||parsed.paymentPayload!==undefined||
     parsed.signature!==undefined||parsed.authorization!==undefined||
     parsed.privateKey!==undefined||parsed.secret!==undefined||parsed.apiKey!==undefined)
   throw Error("Signed payment or secret fields are never accepted. Paste ONLY the public unsigned PAYMENT-REQUIRED response.");
 return parsed;
}
export function checkPublicQuote(q){
 if(!q||typeof q!=="object"||Array.isArray(q))throw Error("Provide an unsigned public quote.");
 const failures=[],warnings=[];
 const mark=(good,label,message)=>{if(!good)failures.push({label,message});};
 mark(q.x402Version===2,"Protocol","This example checker expects x402 v2.");
 const accepts=Array.isArray(q.accepts)?q.accepts:[];
 mark(accepts.length===1,"Payment options","This simple checker supports one explicitly priced acceptance option.");
 const first=accepts[0]||{};
 mark(first.scheme==="exact","Scheme","Expected fixed 'exact' payment requirements.");
 mark(first.network==="eip155:8453","Network","This checker is scoped to Base mainnet (eip155:8453).");
 mark(same(first.asset,MERCHANT.asset),"Token","Canonical Circle USDC on Base is not matched; check token and chain independently.");
 mark(EVM_ADDRESS.test(first.payTo||""),"Recipient format","Recipient is not a 20-byte EVM address.");
 let amount=null;
 if(typeof first.amount==="string"&&/^\d{1,30}$/.test(first.amount)&&BigInt(first.amount)>0n){
  amount=(BigInt(first.amount)/1000000n).toString()+"."+((BigInt(first.amount)%1000000n).toString().padStart(6,"0"));
 }else failures.push({label:"Atomic units",message:"Amount must be a positive decimal integer with six-decimal USDC precision."});
 if(first.maxTimeoutSeconds!==undefined &&
     (!Number.isSafeInteger(first.maxTimeoutSeconds)||first.maxTimeoutSeconds<1||first.maxTimeoutSeconds>86400)) {
   warnings.push({label:"Expiry",message:"Unusual authorization timeout; inspect the merchant rules."});
 }
 const url=text(q.resource?.url);
 let isHttps=false,hasCredential=false,exampleOnly=false;
 try{
  const parsed=new URL(url);
  isHttps=parsed.protocol==="https:";
  hasCredential=Boolean(parsed.username||parsed.password);
  exampleOnly=parsed.hostname.endsWith(".invalid")||parsed.hostname==="example.com";
 }catch{}
 mark(isHttps&&!hasCredential,"Resource URL","Expected a public HTTPS resource without embedded credentials; NO HTTP request is made.");
 if(exampleOnly)warnings.push({label:"Fictional example",message:"The example.invalid resource is intentionally fictitious, not a payable merchant."});
 if(q.accepts?.length>1)warnings.push({label:"Multiple payment choices",message:"A real buyer must choose an accepted scheme/chain and independently confirm its own wallet support."});
 if(EVM_ADDRESS.test(first.payTo||""))warnings.push({label:"Seller identity not verified",message:"A correctly formatted address does not prove merchant ownership, reputation or delivery."});
 warnings.push({label:"Settlement not checked",message:"An unsigned 402 response is not evidence of payment, merchant safety, a working facilitator or successful delivery."});
 return {kind:"public_unsigned_x402_v2_heuristic_only",checksPassed:8-failures.length,
  failures,warnings,route:url||null,network:first.network||null,scheme:first.scheme||null,
  quotedAsset:typeof first.asset==="string"?first.asset:null,quotedRecipient:typeof first.payTo==="string"?first.payTo:null,
  quotedAmountAtomic:typeof first.amount==="string"?first.amount:null,quotedAmountUSDC:amount,
  noFundsSpent:true,noWalletTouched:true,noRemoteUrlFetched:true,
  limitations:"Offline structural lint only. A consistent quote is NOT proof a merchant is safe to pay.",
 };
}
export function urlForPaidPublicQuote(q) {
 if(!q||typeof q!=="object"||Array.isArray(q))throw Error("An unsigned public quote is required.");
 const input=JSON.stringify(q);
 if(input.length>INSPECT.maxUserInputChars)throw Error("Public quote is too long for this bounded hosted GET service.");
 const url=new URL(INSPECT.endpoint);
 url.searchParams.set("quote",input);
 if(url.toString().length>9000)throw Error("Encoded quote URL would exceed safe request limits.");
 return url.toString();
}
export function validateMerchantInspectionQuote(q,requestURL) {
 if(!q||typeof q!=="object"||Array.isArray(q)||q.x402Version!==2)throw Error("Merchant did not issue a valid x402 v2 quote.");
 if(typeof requestURL!=="string"||!requestURL.startsWith(INSPECT.endpoint+"?quote="))throw Error("Unexpected hosted paid quote URL.");
 if(q.resource?.url!==requestURL)throw Error("The merchant quote did not bind to the exact inspection request.");
 if(!Array.isArray(q.accepts)||q.accepts.length!==1)throw Error("Ambiguous merchant payment options.");
 const p=q.accepts[0];
 if(p.scheme!=="exact"||p.network!==MERCHANT.network)throw Error("Unexpected payment method or blockchain.");
 if(p.amount!==INSPECT.atomicAmount)throw Error("Unexpected price; refusing wallet authorization.");
 if(!same(p.asset,INSPECT.asset)||!EVM_ADDRESS.test(p.asset))throw Error("Unexpected token contract.");
 if(!same(p.payTo,INSPECT.payTo)||!EVM_ADDRESS.test(p.payTo))throw Error("Unexpected payment recipient.");
 if(p.extra?.name!=="USD Coin"||p.extra?.version!=="2")throw Error("Unexpected USDC signing domain.");
 if(!Number.isSafeInteger(p.maxTimeoutSeconds)||p.maxTimeoutSeconds<45||p.maxTimeoutSeconds>300)throw Error("Unexpected payment timeout.");
 if(p.extra?.paymentFlow && p.extra.paymentFlow!=="direct")throw Error("Unknown payment flow.");
 if(p.extra?.assetTransferMethod && p.extra.assetTransferMethod!=="eip3009")throw Error("Unknown transfer method.");
 return Object.freeze({resource:q.resource,requirements:p,extensions:q.extensions||{}});
}
export function parseInspectionRequired(encoded,requestURL){
 const s=text(encoded);
 if(!/^[A-Za-z0-9+/_=-]+$/.test(s)||s.length<10||s.length>65000)throw Error("Merchant payment header missing or malformed.");
 let quote;
 try{
  const bytes=Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
  quote=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
 }catch{throw Error("Cannot decode the merchant's PAYMENT-REQUIRED header.");}
 return validateMerchantInspectionQuote(quote,requestURL);
}
export function confirmPaidInspection(body) {
 if(body?.ok!==true || body?.paid!==true || body?.chargedUSDC!==INSPECT.priceUSDC || !Array.isArray(body?.checks)){
  throw Error("A correct-priced paid inspection was not confirmed. DO NOT automatically retry a signed payment.");
 }
 return body;
}
