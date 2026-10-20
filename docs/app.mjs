import {
 MERCHANT,PUBLIC_SYNTHETIC_QUOTE_BODY,parsePaymentRequired,
 createAuthorization,makeSecureNonce,createPaymentHeader,
 checkCsvByteLimit,balanceOfCalldata,checkUsdcBalance,validateResultBody,decodeBase64Json,
} from "./checkout-core.mjs";
import {parseCsv,previewCsv} from "./csv-preview.mjs";
const $=id=>document.getElementById(id);
const state={quote:null,signatureAttempted:false,busy:false,preview:null};
const amountShown=`${MERCHANT.priceUSDC} USDC`;
function status(message,type="info"){const el=$("status");el.textContent=message;el.dataset.state=type;}
function appendSafeReport(report){$("paid-output").textContent=JSON.stringify(report,null,2);$("paid-output").hidden=false;}
function invalidateQuote(){
 state.quote=null;
 $("authorize").disabled=true;
 $("quoted").textContent="Not quoted";
 $("payment-details").hidden=true;
 if(!state.signatureAttempted) status("CSV changed: run local preview, then inspect a fresh price quote.");
}
function getSelectedCsv(){
 const csv=$("csv").value;
 checkCsvByteLimit(csv);
 return csv;
}
function selectedExpectedColumns(csv){
 const explicit=$("expected").value.trim();
 const list=explicit ? explicit.split(",").map(s=>s.trim()) : parseCsv(csv)[0].map(c=>c.trim());
 if(list.length<1||list.length>40||list.some(c=>c.length===0||c.length>128)){
   throw new Error("Expected columns must be 1–40 non-empty names (128 chars maximum).");
 }
 return list;
}
function preview(){
 if(state.signatureAttempted) throw new Error("The signed payment attempt is final in this browser tab. Reload only after verifying the transaction.");
 const csv=getSelectedCsv();
 const data=previewCsv(csv);
 selectedExpectedColumns(csv);
 state.preview=data;
 const summary=`${data.dataRows} rows · ${data.columns} columns · ${data.byteLength.toLocaleString()} bytes · ${data.duplicates} possible duplicates · ${data.missingCells} missing cells · ${data.irregularRows} irregular rows · ${data.formulaRiskCells} formula-prefix risks · ${data.headerDuplicates} duplicate headers.`;
 $("local-preview").textContent=summary;
 $("local-preview").hidden=false;
 $("inspect").disabled=false;
 status("Free preview completed locally. No uploaded CSV left this device.", "ok");
}
async function quotedPrice() {
 if(state.signatureAttempted) return;
 if(!state.preview) throw new Error("Run the local preview first.");
 const csv=getSelectedCsv();
 previewCsv(csv);
 selectedExpectedColumns(csv);
 $("inspect").disabled=true;
 state.busy=true;
 status("Requesting a payment quote using public synthetic example data only…");
 try {
  const response=await fetch(MERCHANT.endpoint,{
   method:"POST",
   mode:"cors",
   redirect:"error",
   cache:"no-store",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify(PUBLIC_SYNTHETIC_QUOTE_BODY),
  });
  if(response.status!==402) throw new Error(`No valid price quote available (HTTP ${response.status}). No wallet was touched.`);
  const quote=parsePaymentRequired(response.headers.get("PAYMENT-REQUIRED"));
  state.quote=quote;
  const p=quote.requirements;
  $("quoted").textContent=`${p.amount==="5000" ? amountShown : "UNEXPECTED"} on Base mainnet`;
  $("recipient").textContent=p.payTo;
  $("token").textContent=p.asset;
  $("payment-details").hidden=false;
  $("authorize").disabled=false;
  status("Quote verified. Nothing charged. Review price, recipient, data/privacy terms, then authorize exactly one payment.", "ok");
 } finally {
  state.busy=false;
  if(!state.signatureAttempted) $("inspect").disabled=false;
 }
}
async function getWallet() {
 if(!window.ethereum || typeof window.ethereum.request!=="function"){
   throw new Error("Install a supported EIP-1193 wallet such as MetaMask. You can still use the free preview without a wallet.");
 }
 const provider=window.ethereum;
 let chain=await provider.request({method:"eth_chainId"});
 if(chain?.toLowerCase()!==MERCHANT.chainHex){
   await provider.request({method:"wallet_switchEthereumChain",params:[{chainId:MERCHANT.chainHex}]});
   chain=await provider.request({method:"eth_chainId"});
 }
 if(chain?.toLowerCase()!==MERCHANT.chainHex) throw new Error("Wallet did not switch to Base mainnet; no authorization requested.");
 const accounts=await provider.request({method:"eth_requestAccounts"});
 if(!Array.isArray(accounts)||typeof accounts[0]!=="string") throw new Error("No wallet account selected.");
 return {provider,account:accounts[0]};
}
async function payExactlyOnce(){
 if(state.busy||state.signatureAttempted) return;
 const q=state.quote;
 if(!q) throw new Error("Fetch and review the live payment quote first.");
 if(!$("consent").checked) throw new Error("Confirm that your CSV is nonsecret and you authorize submitting it before signing.");
 const csv=getSelectedCsv();
 previewCsv(csv);
 const expectedColumns=selectedExpectedColumns(csv);
 if(!window.confirm(`You are about to authorize ONE payment of ${amountShown} in native Circle USDC on Base to ${q.requirements.payTo}. The next request submits your CSV to VM5's API. There is no automatic retry or refund guarantee. Continue?`)){
   status("You cancelled before wallet authorization. Nothing charged.");
   return;
 }
 state.busy=true;$("authorize").disabled=true;$("inspect").disabled=true;
 $("paid-output").hidden=true;
 status("Wallet selected. Checking native Circle USDC balance and waiting for YOUR signature…");
 let authorizationSigned=false;
 try {
   const {provider,account}=await getWallet();
   const balance=await provider.request({
    method:"eth_call",
    params:[{to:MERCHANT.asset,data:balanceOfCalldata(account)},"latest"],
   });
   checkUsdcBalance(balance,q.requirements.amount);
   const {authorization,typedData}=createAuthorization({
    account,quote:q,nowSeconds:Math.floor(Date.now()/1000),nonce:makeSecureNonce(),
   });
   const signature=await provider.request({
    method:"eth_signTypedData_v4",
    params:[account,JSON.stringify(typedData)],
   });
   const header=createPaymentHeader({quote:q,signature,authorization});
   authorizationSigned=true;
   state.signatureAttempted=true;
   status("Authorization signed. Submitting this one-time paid report request. Do not refresh or retry while pending.");
   // The buyer's data is transmitted only here, after explicit informed consent.
   const result=await fetch(MERCHANT.endpoint,{
    method:"POST",mode:"cors",redirect:"error",cache:"no-store",
    headers:{"Content-Type":"application/json","PAYMENT-SIGNATURE":header},
    body:JSON.stringify({csvText:csv,expectedColumns}),
   });
   if(result.status!==200) throw new Error(`Merchant returned HTTP ${result.status}; settlement outcome unknown. Do not re-sign or retry automatically.`);
   const body=validateResultBody(await result.json());
   appendSafeReport(body);
   status("One paid report successfully returned. Check the wallet and settlement record independently.", "ok");
   const proof=result.headers.get("PAYMENT-RESPONSE");
   if(proof&&proof.length<10000){
    try{
     const settlement=decodeBase64Json(proof);
     if(settlement?.success===true && /^0x[0-9a-fA-F]{64}$/.test(settlement.transaction||"")){
       $("transaction").href="https://basescan.org/tx/"+settlement.transaction;
       $("transaction").hidden=false;
     }
    }catch{ /* An optional receipt header must not trigger more transfers. */ }
   }
 } catch (error){
   if(authorizationSigned) status("Signed authorization submitted or attempted; final outcome uncertain. DO NOT pay again without checking BaseScan and contacting support: "+String(error.message||error), "warning");
   else {status("No signed paid request was submitted: "+String(error.message||error),"warning"); $("authorize").disabled=false;}
 } finally {
   state.busy=false;
   if(state.signatureAttempted){$("authorize").disabled=true;$("inspect").disabled=true;$("csv").readOnly=true;$("expected").readOnly=true;}
 }
}
function setup(){
 $("price").textContent=amountShown;
 $("csv").value=PUBLIC_SYNTHETIC_QUOTE_BODY.csvText;
 $("csv").addEventListener("input",()=>{state.preview=null;$("inspect").disabled=true;$("local-preview").hidden=true;invalidateQuote()});
 $("expected").addEventListener("input",()=>{state.preview=null;$("inspect").disabled=true;invalidateQuote()});
 $("file").addEventListener("change",async event=>{
  const f=event.target.files?.[0];if(!f)return;
  if(f.size>MERCHANT.maxCsvUtf8Bytes){status("File exceeds 32,768 bytes. Please select a nonconfidential smaller CSV.","warning");return;}
  try{$("csv").value=await f.text();state.preview=null;$("inspect").disabled=true;$("local-preview").hidden=true;invalidateQuote();status("CSV loaded locally; no upload yet.");}
  catch(e){status("Could not read the local file: "+e.message,"warning");}
 });
 $("preview").addEventListener("click",()=>{try{preview()}catch(e){status(e.message,"warning")}});
 $("inspect").addEventListener("click",()=>{quotedPrice().catch(e=>status(e.message,"warning"))});
 $("authorize").addEventListener("click",()=>{payExactlyOnce().catch(e=>status(e.message,"warning"))});
 status("Ready: load your nonconfidential CSV or try the built-in sample. The free preview requires no wallet.");
}
setup();
