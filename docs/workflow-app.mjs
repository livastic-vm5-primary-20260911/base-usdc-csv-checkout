import {MERCHANT} from "./checkout-core.mjs";
import {
 WORKFLOW,SAFE_SAMPLE_YAML,checkYaml,checkFilename,localWorkflowPreview,
 parseWorkflowPaymentRequired,createAuthorization,createPaymentHeader,makeSecureNonce,
 balanceOfCalldata,checkUsdcBalance,verifyWorkflowPaidReport,decodeBase64Json,
} from "./workflow-core.mjs";
const $=name=>document.getElementById(name);
const state={quote:null,preview:null,signed:false,busy:false};
function msg(value,type="info"){$("workflow-status").textContent=value;$("workflow-status").dataset.state=type;}
function source(){return $("workflow-source").value;}
function clear(){
 state.quote=null;state.preview=null;
 $("workflow-quote").hidden=true;$("workflow-free-output").hidden=true;
 $("workflow-review").disabled=true;$("workflow-pay").disabled=true;
 msg("Source changed. Free preview again, then request a fresh signed-price quote if needed.");
}
function local(){
 if(state.signed)throw Error("One signature attempt has already occurred; verify settlement before doing anything further.");
 const text=source();const out=localWorkflowPreview(text);
 checkFilename($("filename").value.trim());
 state.preview=out;
 $("workflow-free-output").hidden=false;
 $("workflow-free-output").textContent=JSON.stringify(out,null,2);
 $("workflow-review").disabled=false;
 msg("Local heuristic preview complete. No YAML sent to any server.", "ok");
}
const originalSample={workflowYaml:SAFE_SAMPLE_YAML,filename:"ci.yml",includeSarif:true};
async function quote(){
 if(!state.preview||state.signed)throw Error("Run the free local preview before requesting the price.");
 checkYaml(source());checkFilename($("filename").value.trim());
 state.busy=true;$("workflow-review").disabled=true;
 try{
  msg("Inspecting original public merchant quote with a published synthetic example — not your YAML…");
  const r=await fetch(WORKFLOW.endpoint,{
   method:"POST",mode:"cors",cache:"no-store",redirect:"error",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify(originalSample),
  });
  if(r.status!==402)throw Error("No valid quote returned. HTTP "+r.status+"; wallet not contacted.");
  const q=parseWorkflowPaymentRequired(r.headers.get("PAYMENT-REQUIRED"));
  state.quote=q;
  $("workflow-quote").hidden=false;
  $("workflow-amount").textContent="0.20 native Circle USDC on Base (one request)";
  $("workflow-token").textContent=q.requirements.asset;
  $("workflow-payee").textContent=q.requirements.payTo;
  $("workflow-pay").disabled=false;
  msg("Exact original wallet amount and payee verified. No payment was made. Review consent before authorizing one charge.", "ok");
 } finally {state.busy=false; if(!state.signed)$("workflow-review").disabled=false}
}
async function wallet(){
 const provider=window.ethereum;
 if(!provider||typeof provider.request!=="function")throw Error("A compatible EIP-1193 wallet such as MetaMask is required for the optional paid report.");
 let chain=await provider.request({method:"eth_chainId"});
 if(chain?.toLowerCase()!==WORKFLOW.chainHex){
  await provider.request({method:"wallet_switchEthereumChain",params:[{chainId:WORKFLOW.chainHex}]});
  chain=await provider.request({method:"eth_chainId"});
 }
 if(chain?.toLowerCase()!==WORKFLOW.chainHex)throw Error("Switch to Base mainnet before paying.");
 const accounts=await provider.request({method:"eth_requestAccounts"});
 if(!Array.isArray(accounts)||!accounts[0])throw Error("No wallet account selected.");
 return {provider,account:accounts[0]};
}
async function charge(){
 if(state.busy||state.signed)return;
 if(!state.quote)throw Error("Inspect the server's live price quote first.");
 if(!$("workflow-consent").checked)throw Error("Confirm your nonsecret YAML is yours to submit and you authorize a single 0.20 USDC charge.");
 const workflowYaml=source();checkYaml(workflowYaml);
 const filename=checkFilename($("filename").value.trim());
 if(!window.confirm("Approve ONE 0.20 native Circle USDC payment on Base to "+state.quote.requirements.payTo+" for a static report on YOUR workflow? Do not retry if the result is uncertain.")){
  msg("Purchase cancelled before contacting a wallet; no payment.");return;
 }
 state.busy=true;$("workflow-pay").disabled=true;$("workflow-review").disabled=true;
 $("workflow-paid-result").hidden=true;
 let signed=false;
 try{
  const {provider,account}=await wallet();
  const currentBalance=await provider.request({method:"eth_call",params:[{to:MERCHANT.asset,data:balanceOfCalldata(account)},"latest"]});
  checkUsdcBalance(currentBalance,state.quote.requirements.amount);
  const {authorization,typedData}=createAuthorization({
   account,quote:state.quote,nowSeconds:Math.floor(Date.now()/1000),nonce:makeSecureNonce(),
  });
  const signature=await provider.request({method:"eth_signTypedData_v4",params:[account,JSON.stringify(typedData)]});
  const header=createPaymentHeader({quote:state.quote,signature,authorization});
  signed=true;state.signed=true;
  msg("Exact single-use authorization signed. Processing ONE paid request; do not retry if settlement is ambiguous.");
  const res=await fetch(WORKFLOW.endpoint,{
   method:"POST",mode:"cors",redirect:"error",cache:"no-store",
   headers:{"Content-Type":"application/json","PAYMENT-SIGNATURE":header},
   body:JSON.stringify({workflowYaml,filename,includeSarif:true}),
  });
  if(res.status!==200)throw Error("HTTP "+res.status+" after signed authorization. Resolve payment outcome before doing anything further.");
  const data=verifyWorkflowPaidReport(await res.json());
  $("workflow-paid-result").textContent=JSON.stringify(data,null,2);
  $("workflow-paid-result").hidden=false;
  msg("Confirmed paid JSON report received. Review its heuristic limitations and independently verify the wallet settlement.", "ok");
  const receipt=res.headers.get("PAYMENT-RESPONSE");
  if(receipt&&receipt.length<10000){
   try{
    const p=decodeBase64Json(receipt);
    if(p?.success===true && /^0x[0-9a-fA-F]{64}$/.test(p.transaction||"")){
     $("workflow-tx").href="https://basescan.org/tx/"+p.transaction;
     $("workflow-tx").hidden=false;
    }
   }catch{}
  }
 }catch(e){
  msg(signed?"Payment status may be uncertain: "+e.message+" Never automatically sign or pay again; check BaseScan/support first.":"Payment not signed/submitted: "+e.message, "warning");
  if(!signed)$("workflow-pay").disabled=false;
 }finally{
  state.busy=false;
  if(state.signed){$("workflow-pay").disabled=true;$("workflow-review").disabled=true;$("workflow-source").readOnly=true;$("filename").readOnly=true;}
 }
}
function start(){
 $("workflow-price").textContent="0.20 USDC";
 $("workflow-source").value=SAFE_SAMPLE_YAML;
 $("workflow-source").addEventListener("input",clear);
 $("filename").addEventListener("input",clear);
 $("workflow-file").addEventListener("change",async e=>{
  const f=e.target.files?.[0];if(!f)return;
  if(f.size>WORKFLOW.maxBytes){msg("Max 48 KiB nonsecret YAML allowed.","warning");return;}
  try{$("workflow-source").value=await f.text();$("filename").value=f.name;clear();msg("File was loaded LOCALLY. No upload occurred.");}
  catch(ex){msg(ex.message,"warning")}
 });
 $("workflow-free").addEventListener("click",()=>{try{local()}catch(e){msg(e.message,"warning")}});
 $("workflow-review").addEventListener("click",()=>{quote().catch(e=>msg(e.message,"warning"))});
 $("workflow-pay").addEventListener("click",()=>{charge().catch(e=>msg(e.message,"warning"))});
 msg("Ready: run free local heuristic hints. Only explicitly purchased reports send your nonsecret YAML to the hosted x402 API.");
}
start();
