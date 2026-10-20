import {
 INSPECT,SAMPLE_PUBLIC_UNSIGNED,parsePublicQuote,checkPublicQuote,
 urlForPaidPublicQuote,parseInspectionRequired,confirmPaidInspection,
} from "./x402-quote-core.mjs";
import {
 MERCHANT,createAuthorization,createPaymentHeader,makeSecureNonce,
 balanceOfCalldata,checkUsdcBalance,decodeBase64Json
} from "./checkout-core.mjs";
const $=id=>document.getElementById(id);
const state={publicQuote:null,merchantQuote:null,requestUrl:null,busy:false,signedAttempt:false};
function msg(text,kind="info"){$("inspect-status").textContent=text;$("inspect-status").dataset.state=kind;}
function resetQuote(){
 state.publicQuote=null;state.merchantQuote=null;state.requestUrl=null;
 $("inspect-free-output").hidden=true;
 $("inspect-price-details").hidden=true;
 $("inspect-get-quote").disabled=true;
 $("inspect-approve").disabled=true;
 if(!state.signedAttempt)msg("The quote changed; inspect it locally again. No request was sent.");
}
function localInspection(){
 if(state.signedAttempt)throw Error("A signature attempt already occurred. Check on-chain settlement before restarting.");
 const q=parsePublicQuote($("inspect-input").value);
 const result=checkPublicQuote(q);
 state.publicQuote=q;
 $("inspect-free-output").textContent=JSON.stringify(result,null,2);
 $("inspect-free-output").hidden=false;
 $("inspect-get-quote").disabled=false;
 msg("Free local structural review done. The quoted merchant was not contacted, and no wallet was used.","ok");
}
function auditReady(){
 if(!state.publicQuote)throw Error("Run the local quote inspection first.");
 if(!$("inspect-share-consent").checked)throw Error("Explicitly confirm that the unsigned quote has no secrets before sharing it with VM5.");
 return urlForPaidPublicQuote(state.publicQuote);
}
async function getPrice(){
 if(state.busy||state.signedAttempt)return;
 const url=auditReady();
 state.busy=true;$("inspect-get-quote").disabled=true;
 try{
  msg("Querying the original VM5 merchant for a real 0.01 USDC quote. Only the publicly supplied unsigned quote is sent.");
  const res=await fetch(url,{method:"GET",mode:"cors",redirect:"error",cache:"no-store"});
  if(res.status!==402)throw Error("Merchant did not return HTTP 402 (got HTTP "+res.status+"). No wallet used.");
  const q=parseInspectionRequired(res.headers.get("PAYMENT-REQUIRED"),url);
  state.merchantQuote=q;
  state.requestUrl=url;
  $("inspect-amount").textContent="0.01 native Circle Base USDC (10,000 atomic units)";
  $("inspect-payee").textContent=q.requirements.payTo;
  $("inspect-token").textContent=q.requirements.asset;
  $("inspect-price-details").hidden=false;
  $("inspect-approve").disabled=false;
  msg("Verified exact price, recipient, Base network and token. No charge yet; review wallet consent.","ok");
 }finally{
  state.busy=false;
  if(!state.signedAttempt)$("inspect-get-quote").disabled=false;
 }
}
async function buyerWallet(){
 if(!window.ethereum||typeof window.ethereum.request!=="function")
  throw Error("A supported EIP-1193 wallet (e.g. MetaMask) is required only for optional paid analysis.");
 const provider=window.ethereum;
 let chain=await provider.request({method:"eth_chainId"});
 if(chain?.toLowerCase()!=="0x2105"){
  await provider.request({method:"wallet_switchEthereumChain",params:[{chainId:"0x2105"}]});
  chain=await provider.request({method:"eth_chainId"});
 }
 if(chain?.toLowerCase()!=="0x2105")throw Error("Wallet is not on Base mainnet.");
 const accounts=await provider.request({method:"eth_requestAccounts"});
 if(!Array.isArray(accounts)||typeof accounts[0]!=="string")throw Error("No buyer account selected.");
 return {provider,account:accounts[0]};
}
async function payOnce(){
 if(state.busy||state.signedAttempt)return;
 if(!state.merchantQuote||!state.requestUrl)throw Error("Inspect the live merchant payment quote first.");
 if(!$("inspect-paid-consent").checked)throw Error("Explicitly accept the single 0.01 USDC fee before wallet authorization.");
 if(!window.confirm("Authorize ONE payment of 0.01 native Circle Base USDC to "+state.merchantQuote.requirements.payTo+" for a static report on a PUBLIC unsigned x402 quote? No automatic retry or refund guarantee.")){
   msg("Buyer cancelled before wallet authorization. No payment.");return;
 }
 state.busy=true;$("inspect-get-quote").disabled=true;$("inspect-approve").disabled=true;
 let signed=false;
 try{
  const {provider,account}=await buyerWallet();
  const balance=await provider.request({method:"eth_call",params:[{to:MERCHANT.asset,data:balanceOfCalldata(account)},"latest"]});
  checkUsdcBalance(balance,state.merchantQuote.requirements.amount);
  const {authorization,typedData}=createAuthorization({
   account,quote:state.merchantQuote,nowSeconds:Math.floor(Date.now()/1000),nonce:makeSecureNonce(),
  });
  const signature=await provider.request({method:"eth_signTypedData_v4",params:[account,JSON.stringify(typedData)]});
  const header=createPaymentHeader({quote:state.merchantQuote,signature,authorization});
  signed=true;state.signedAttempt=true;
  msg("Buyer signed one fixed-amount transfer authorization. Submitting exactly ONE paid GET; do not retry until any uncertain settlement is reconciled.");
  const response=await fetch(state.requestUrl,{
   method:"GET",mode:"cors",redirect:"error",cache:"no-store",headers:{"PAYMENT-SIGNATURE":header},
  });
  if(response.status!==200)throw Error("Merchant returned HTTP "+response.status+" after the signed request.");
  const report=confirmPaidInspection(await response.json());
  $("inspect-paid-output").textContent=JSON.stringify(report,null,2);
  $("inspect-paid-output").hidden=false;
  msg("One paid static report returned. Independently verify the Base onchain transfer before counting revenue.","ok");
  const receipt=response.headers.get("PAYMENT-RESPONSE");
  if(receipt&&receipt.length<10000){
   try{
    const parsed=decodeBase64Json(receipt);
    if(parsed?.success===true && /^0x[0-9a-fA-F]{64}$/.test(parsed.transaction||"")){
     $("inspect-tx-link").href="https://basescan.org/tx/"+parsed.transaction;
     $("inspect-tx-link").hidden=false;
    }
   }catch{}
  }
 }catch(e){
  if(signed)msg("Settlement/delivery outcome uncertain: "+String(e.message||e)+". Do NOT pay again before independent chain reconciliation.","warning");
  else {msg("No signed paid request was submitted: "+String(e.message||e),"warning");$("inspect-approve").disabled=false;}
 }finally{
  state.busy=false;
  if(state.signedAttempt){
   $("inspect-approve").disabled=true;$("inspect-get-quote").disabled=true;
   $("inspect-input").readOnly=true;
  }
 }
}
function start(){
 $("inspect-input").value=JSON.stringify(SAMPLE_PUBLIC_UNSIGNED,null,2);
 $("inspect-input").addEventListener("input",resetQuote);
 $("inspect-local").addEventListener("click",()=>{try{localInspection()}catch(e){msg(String(e.message||e),"warning")}});
 $("inspect-get-quote").addEventListener("click",()=>{getPrice().catch(e=>msg(String(e.message||e),"warning"))});
 $("inspect-approve").addEventListener("click",()=>{payOnce().catch(e=>msg(String(e.message||e),"warning"))});
 msg("Ready: an intentionally fictional public quote is preloaded. Run the free browser-only checker. No wallet is needed.");
}
start();
