/**
 * CommaCheck Base: x402 v2, Base mainnet native Circle USDC.
 * Public, independently inspectable browser-side payment preparation only.
 * Never holds wallet keys and never automatically retries signed payments.
 */
export const MERCHANT = Object.freeze({
  endpoint: "https://vm5-openapi-x402.onrender.com/v1/csv-preflight",
  sample: "https://vm5-openapi-x402.onrender.com/v1/csv-sample",
  network: "eip155:8453",
  chainId: 8453,
  chainHex: "0x2105",
  scheme: "exact",
  amountAtomic: "5000",
  asset: "0x833589fCD6eDb6E08f4C7C32D4f71b54bdA02913",
  payTo: "0x6b01efA0705E91a7aca54271510bf9e594717f34",
  tokenName: "USD Coin",
  tokenVersion: "2",
  maxQuoteTimeoutSeconds: 300,
  maxCsvUtf8Bytes: 32768,
  priceUSDC: "0.005",
});
export const PUBLIC_SYNTHETIC_QUOTE_BODY = Object.freeze({
  csvText: "email,amount,date,note\na@example.com,12.5,2026-10-19,paid\na@example.com,12.5,2026-10-19,paid\nbad-email,not-a-number,2026-13-99,=1+1",
  expectedColumns: ["email", "amount", "date", "note"],
});

const sameAddress = (a,b) => typeof a==="string" && a.toLowerCase()===b.toLowerCase();
const addressRE = /^0x[0-9a-fA-F]{40}$/;
export function validateQuote(raw, expectedUrl=MERCHANT.endpoint) {
  if(!raw || typeof raw!=="object" || Array.isArray(raw)) throw new Error("Invalid payment quote.");
  if(raw.x402Version!==2) throw new Error("Unsupported x402 version; no wallet request made.");
  const res=raw.resource;
  if(!res || typeof res.url!=="string" || res.url!==expectedUrl) throw new Error("Payment quote does not match this exact merchant route.");
  const a=raw.accepts;
  if(!Array.isArray(a) || a.length!==1) throw new Error("Ambiguous or missing payment options.");
  const p=a[0];
  if(p.scheme!=="exact" || p.network!==MERCHANT.network) throw new Error("Unexpected payment scheme or network.");
  if(p.amount!==MERCHANT.amountAtomic) throw new Error("Amount changed; checkout is halted.");
  if(!sameAddress(p.asset,MERCHANT.asset)||!addressRE.test(p.asset)) throw new Error("Unexpected token contract.");
  if(!sameAddress(p.payTo,MERCHANT.payTo)||!addressRE.test(p.payTo)) throw new Error("Unexpected recipient; checkout is halted.");
  if(p.extra?.name!==MERCHANT.tokenName || p.extra?.version!==MERCHANT.tokenVersion) throw new Error("Unexpected USDC signing domain.");
  if(p.extra?.assetTransferMethod && p.extra.assetTransferMethod!=="eip3009") throw new Error("Unsupported asset-transfer method.");
  if(p.extra?.paymentFlow && p.extra.paymentFlow!=="direct") throw new Error("Unsupported payment flow.");
  if(!Number.isSafeInteger(p.maxTimeoutSeconds)||p.maxTimeoutSeconds<45||p.maxTimeoutSeconds>MERCHANT.maxQuoteTimeoutSeconds) throw new Error("Unexpected payment expiry window.");
  if(raw.extensions && (typeof raw.extensions!=="object"||Array.isArray(raw.extensions))) throw new Error("Malformed payment extensions.");
  return Object.freeze({requirements:p,resource:res,extensions:raw.extensions||{}});
}
export function parsePaymentRequired(value) {
  if(typeof value!=="string"||value.length>65000||value.length<12) throw new Error("Missing or oversized PAYMENT-REQUIRED header.");
  if(!/^[a-zA-Z0-9+/_=-]+$/.test(value)) throw new Error("Malformed payment header encoding.");
  let decoded;
  try {
    const fixed=value.replace(/-/g,"+").replace(/_/g,"/");
    if(typeof atob!=="function") throw new Error("atob unavailable");
    const binary=atob(fixed);
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    decoded=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
  } catch { throw new Error("Cannot decode server payment quote."); }
  return validateQuote(decoded);
}
export function createAuthorization({account,quote,nowSeconds,nonce}) {
  if(!addressRE.test(account||"")) throw new Error("No valid wallet address selected.");
  if(!quote?.requirements) throw new Error("A valid quote is needed before signing.");
  if(!Number.isSafeInteger(nowSeconds)||nowSeconds<1700000000) throw new Error("Invalid payment clock.");
  if(!/^0x[0-9a-fA-F]{64}$/.test(nonce||"")) throw new Error("Secure 32-byte nonce required.");
  const p=quote.requirements;
  const validAfter=String(nowSeconds-60);
  const validBefore=String(nowSeconds+Math.min(p.maxTimeoutSeconds,300));
  const authorization=Object.freeze({from:account,to:p.payTo,value:p.amount,validAfter,validBefore,nonce});
  return {authorization,typedData:{
    types: {
      EIP712Domain:[
        {name:"name",type:"string"},{name:"version",type:"string"},
        {name:"chainId",type:"uint256"},{name:"verifyingContract",type:"address"},
      ],
      TransferWithAuthorization:[
        {name:"from",type:"address"},{name:"to",type:"address"},
        {name:"value",type:"uint256"},{name:"validAfter",type:"uint256"},
        {name:"validBefore",type:"uint256"},{name:"nonce",type:"bytes32"},
      ],
    },
    primaryType:"TransferWithAuthorization",
    domain:{name:MERCHANT.tokenName,version:MERCHANT.tokenVersion,chainId:MERCHANT.chainId,verifyingContract:p.asset},
    message:authorization,
  }};
}
export function makeSecureNonce(cryptoApi=globalThis.crypto) {
  if(!cryptoApi || typeof cryptoApi.getRandomValues!=="function") throw new Error("Cryptographic randomness unavailable.");
  const b=new Uint8Array(32);cryptoApi.getRandomValues(b);
  if(b.every(v=>v===0)) throw new Error("Invalid nonce generator output.");
  return "0x"+[...b].map(n=>n.toString(16).padStart(2,"0")).join("");
}
export function createPaymentHeader({quote,signature,authorization}) {
  if(!/^0x[0-9a-fA-F]{130}$/.test(signature||"")) throw new Error("Wallet did not return a standard signed authorization.");
  if(!quote?.requirements||!authorization) throw new Error("Missing original authorization.");
  if(authorization.value!==quote.requirements.amount || !sameAddress(authorization.to,quote.requirements.payTo)) throw new Error("Authorization amount or recipient mismatch.");
  const payload={
    x402Version:2,
    resource:quote.resource,
    accepted:quote.requirements,
    payload:{signature,authorization},
    extensions:quote.extensions,
  };
  return utf8ToBase64(JSON.stringify(payload));
}
export function utf8ToBase64(input) {
  const bytes=new TextEncoder().encode(input);
  let str="";
  for(let i=0;i<bytes.length;i+=8192) str+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(str);
}
export function decodeBase64Json(encoded) {
  const b=atob(encoded.replace(/-/g,"+").replace(/_/g,"/"));
  return JSON.parse(new TextDecoder("utf-8").decode(Uint8Array.from(b,c=>c.charCodeAt(0))));
}
export function checkCsvByteLimit(csv) {
  const size=new TextEncoder().encode(csv||"").byteLength;
  if(size===0 || size>MERCHANT.maxCsvUtf8Bytes) throw new Error("Select 1–32,768 UTF-8 bytes of nonconfidential CSV.");
  return size;
}
export function balanceOfCalldata(account) {
  if(!addressRE.test(account||"")) throw new Error("Wallet address invalid.");
  return "0x70a08231"+account.slice(2).toLowerCase().padStart(64,"0");
}
export function checkUsdcBalance(ethCallHex,minimum=MERCHANT.amountAtomic) {
  if(typeof ethCallHex!=="string" || !/^0x[0-9a-fA-F]+$/.test(ethCallHex)) throw new Error("Cannot verify wallet USDC balance.");
  if(BigInt(ethCallHex)<BigInt(minimum)) throw new Error("Wallet has insufficient native Base USDC for the quoted 0.005 USDC.");
  return true;
}
export function validateResultBody(body) {
  if(!body||typeof body!=="object"||body.ok!==true||body.paid!==true) throw new Error("Paid report was not confirmed. Do NOT retry automatically.");
  if(typeof body.chargedUSDC!=="string" || body.chargedUSDC!==MERCHANT.priceUSDC) throw new Error("Unexpected reported payment; reconcile before any retry.");
  return body;
}
