import {
 DNS,INVENTED_DNS_REPORT,canonicalPublicDomain,dnsRequestUrl,parseDnsRequired,confirmDnsPaidReport,
} from "./email-dns-core.mjs";
import {
 MERCHANT,createAuthorization,createPaymentHeader,makeSecureNonce,balanceOfCalldata,
 checkUsdcBalance,decodeBase64Json,
} from "./checkout-core.mjs";
const $=id=>document.getElementById(id);
const state={quote:null,requestUrl:null,domain:null,busy:false,signedAttempt:false};
function msg(text,type="info"){
 $("dns-status").textContent=text;$("dns-status").dataset.state=type;
}
function reset(){
 if(state.signedAttempt)return;
 state.quote=null;state.requestUrl=null;state.domain=null;
 $("dns-quote-panel").hidden=true;$("dns-pay").disabled=true;
 $("dns-paid").hidden=true;$("dns-explorer").hidden=true;
 msg("Domain changed. Request a new, unsigned live 402 quote before considering payment.");
}
function free(){
 $("dns-free-report").textContent=JSON.stringify(INVENTED_DNS_REPORT,null,2);
 $("dns-free-report").hidden=false;
 msg("Fictional example shown locally. No network, user data or wallet used.","ok");
}
async function getQuote(){
 if(state.signedAttempt||state.busy)return;
 const domain=canonicalPublicDomain($("dns-domain").value);
 const url=dnsRequestUrl(domain);
 state.quote=null;state.requestUrl=null;state.domain=null;
 $("dns-quote-panel").hidden=true;$("dns-pay").disabled=true;
 state.busy=true;$("dns-quote").disabled=true;
 try{
  msg("Checking public DNS for your chosen domain and requesting one unsigned x402 price quote. No wallet or payment involved.");
  const r=await fetch(url,{method:"GET",mode:"cors",redirect:"error",cache:"no-store"});
  if(r.status!==402)throw Error("Merchant returned HTTP "+r.status+" rather than a payable 402 quote. No payment was authorized; try only after fixing domain/availability.");
  const q=parseDnsRequired(r.headers.get("PAYMENT-REQUIRED"),url);
  state.quote=q;state.domain=domain;state.requestUrl=url;
  $("dns-amount").textContent=DNS.priceUSDC+" native Circle USDC on Base (one paid GET)";
  $("dns-token").textContent=q.requirements.asset;
  $("dns-payee").textContent=q.requirements.payTo;
  $("dns-quote-panel").hidden=false;
  $("dns-pay").disabled=false;
  msg("Real server x402 quote verified for one exact domain, network, amount, token, payee and EIP-712 signing domain. NO money spent yet.","ok");
 }finally{state.busy=false;if(!state.signedAttempt)$("dns-quote").disabled=false;}
}
async function buyerWallet(){
 const provider=window.ethereum;
 if(!provider||typeof provider.request!=="function")
  throw Error("An EIP-1193 wallet such as MetaMask is required ONLY for an optional paid purchase.");
 let network=await provider.request({method:"eth_chainId"});
 if(typeof network!=="string"||network.toLowerCase()!==MERCHANT.chainHex){
  await provider.request({method:"wallet_switchEthereumChain",params:[{chainId:MERCHANT.chainHex}]});
  network=await provider.request({method:"eth_chainId"});
 }
 if(typeof network!=="string"||network.toLowerCase()!==MERCHANT.chainHex)throw Error("Buyer wallet is not on Base mainnet.");
 const accounts=await provider.request({method:"eth_requestAccounts"});
 if(!Array.isArray(accounts)||!accounts[0])throw Error("No wallet selected.");
 return {provider,account:accounts[0]};
}
async function pay(){
 if(state.signedAttempt||state.busy)return;
 if(!state.quote || !state.requestUrl || !state.domain ||
    dnsRequestUrl($("dns-domain").value)!==state.requestUrl)
  throw Error("Refresh the correct live domain-specific unsigned quote first.");
 if(!$("dns-consent").checked)
  throw Error("Confirm exactly one paid 0.005 USDC domain-only lookup and that you accept the report limits.");
 if(!window.confirm("Authorize ONE "+DNS.priceUSDC+" native Circle Base USDC payment to "+state.quote.requirements.payTo+" for public DNS configuration of "+state.domain+"? No automatic retry/refund promise.")){
  msg("Buyer declined purchase before any wallet request. No payment.");return;
 }
 state.busy=true;$("dns-pay").disabled=true;$("dns-quote").disabled=true;
 let signed=false;
 try{
  const {provider,account}=await buyerWallet();
  const balance=await provider.request({method:"eth_call",params:[{to:MERCHANT.asset,data:balanceOfCalldata(account)},"latest"]});
  checkUsdcBalance(balance,state.quote.requirements.amount);
  const {authorization,typedData}=createAuthorization({
   account,quote:state.quote,nowSeconds:Math.floor(Date.now()/1000),nonce:makeSecureNonce()
  });
  const signature=await provider.request({method:"eth_signTypedData_v4",params:[account,JSON.stringify(typedData)]});
  // Header creation never broadcasts a payment. Mark the attempt as irreversible
  // BEFORE the first possible HTTP request; no background or click-to-retry path.
  const header=createPaymentHeader({quote:state.quote,signature,authorization});
  signed=true;state.signedAttempt=true;
  msg("One EIP-3009 authorization signed. Submitting exactly ONE paid GET; do not retry if outcome is uncertain.");
  const response=await fetch(state.requestUrl,{method:"GET",mode:"cors",redirect:"error",cache:"no-store",headers:{"PAYMENT-SIGNATURE":header}});
  if(response.status!==200)throw Error("Signed request returned HTTP "+response.status+". Payment/delivery may be uncertain.");
  const report=confirmDnsPaidReport(await response.json(),state.domain);
  $("dns-paid").textContent=JSON.stringify(report,null,2);
  $("dns-paid").hidden=false;
  msg("Paid DNS JSON report returned. Independently confirm final Base transaction before treating payment as settled.","ok");
  const receipt=response.headers.get("PAYMENT-RESPONSE");
  if(receipt && receipt.length<10000){
   try{
    const decoded=decodeBase64Json(receipt);
    if(decoded?.success===true && /^0x[0-9a-fA-F]{64}$/.test(decoded.transaction||"")){
     $("dns-explorer").href="https://basescan.org/tx/"+decoded.transaction;
     $("dns-explorer").hidden=false;
    }
   }catch{}
  }
 }catch(e){
  msg((signed?"Signed payment outcome uncertain. DO NOT sign/pay again before independent chain check. ":"No signed payment was sent. ")+String(e.message||e),"warning");
  if(!signed)$("dns-pay").disabled=false;
 }finally{
  state.busy=false;
  if(state.signedAttempt){
   $("dns-pay").disabled=true;$("dns-quote").disabled=true;$("dns-domain").readOnly=true;
  } else {$("dns-quote").disabled=false;}
 }
}
function start(){
 $("dns-domain").value="example.com";
 $("dns-domain").addEventListener("input",reset);
 $("dns-free").addEventListener("click",free);
 $("dns-quote").addEventListener("click",()=>getQuote().catch(e=>msg(String(e.message||e),"warning")));
 $("dns-pay").addEventListener("click",()=>pay().catch(e=>msg(String(e.message||e),"warning")));
 msg("Start with a free fictional sample, or enter a PUBLIC DNS domain to see a real, UNPAID 0.005 Base USDC quote. No wallet connection on load.");
}
start();
