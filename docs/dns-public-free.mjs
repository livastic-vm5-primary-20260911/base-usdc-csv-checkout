/**
 * FREE opt-in public DNS overview via Google Public DNS JSON DoH.
 * Exactly three bounded GET requests to the independent resolver, no
 * wallet, owner backend, email, SMTP, personal inbox or payment.
 */
import {canonicalPublicDomain} from "./email-dns-core.mjs";
export const DOH_ORIGIN="https://dns.google";
const MAX_BODY=240000;
function nameMatches(recordName,expected){
 return typeof recordName==="string" && recordName.toLowerCase().replace(/\.$/,"")===expected;
}
function records(json,name,type){
 if(!json||typeof json!=="object"||Array.isArray(json)||
   !Number.isSafeInteger(json.Status)||![0,3].includes(json.Status))
  throw Error("DNS error or resolver failure; record absence cannot be inferred.");
 if(json.TC===true)throw Error("DNS reply truncated; no result available.");
 const list=json.Answer===undefined?[]:json.Answer;
 if(!Array.isArray(list)||list.length>100)throw Error("DNS answer format/size unexpected.");
 return {
  status:json.Status,
  data:list.filter(x=>x&&typeof x==="object"&&!Array.isArray(x)&&
     x.type===type&&nameMatches(x.name,name)&&typeof x.data==="string"&&x.data.length<=8192)
   .map(x=>x.data)
 };
}
const cleanTXT=s=>s.replace(/^"/,"").replace(/"$/,"").replace(/"\s*"/g,"").trim();
function policies(arr,kind){
 const re=kind==="SPF"?/^v=spf1(?:\s|$)/i:/^v=dmarc1(?:\s|;|$)/i;
 return arr.map(cleanTXT).filter(x=>re.test(x));
}
function summarize(domain,results,checkedUTC){
 const mx=records(results[0],domain,15);
 const root=records(results[1],domain,16);
 const dm=records(results[2],"_dmarc."+domain,16);
 if(mx.status===3&&root.status===3&&dm.status===3)
  return {ok:false,domain,checkedUTC,reason:"PUBLIC_DNS_NXDOMAIN",
    limitation:"Public recursive DNS reported NXDOMAIN, not tested SMTP or mailboxes.",walletRequests:0,costUSDC:"0"};
 if(mx.status!==root.status)throw Error("Public root MX/TXT statuses differ; do not infer missing records.");
 const nullMX=mx.data.some(x=>/^0\s+\.$/.test(x.trim()));
 const advertised=mx.data.filter(x=>/^\d+\s+\S+/.test(x.trim())&&!/^0\s+\.$/.test(x.trim()));
 const spf=policies(root.data,"SPF"),dmarc=policies(dm.data,"DMARC");
 const match=dmarc.length===1?dmarc[0].match(/(?:^|;)\s*p\s*=\s*(none|quarantine|reject)(?:\s|;|$)/i):null;
 const policy=match?match[1].toLowerCase():null;
 const flags=[];
 if(nullMX)flags.push("NULL_MX_DECLINES_INBOUND_MAIL");
 if(!mx.data.length)flags.push("NO_EXPLICIT_MX_SMTP_A_FALLBACK_MAY_EXIST");
 if(!spf.length)flags.push("NO_SPF_TXT_FOUND");
 if(spf.length>1)flags.push("MULTIPLE_SPF_POLICIES");
 if(!dmarc.length)flags.push("NO_DMARC_TXT_FOUND");
 if(dmarc.length>1)flags.push("MULTIPLE_DMARC_POLICIES");
 if(dmarc.length===1&&!policy)flags.push("UNRECOGNIZED_DMARC_POLICY");
 if(policy==="none")flags.push("DMARC_MONITOR_ONLY");
 return {
  ok:true,kind:"free_public_dns_configuration_overview",domain,checkedUTC,
  source:"Google Public DNS JSON-over-HTTPS (third party)",
  dnsQuestionsMade:3,
  mx:{explicitRecordCount:mx.data.length,nullMxAdvertised:nullMX,advertisedExchangerCount:advertised.length},
  spf:{published:spf.length>0,policyCount:spf.length,syntaxAndAlignmentVerified:false},
  dmarc:{published:dmarc.length>0,policyCount:dmarc.length,requestedPolicy:policy,actualAlignmentVerified:false},
  reviewFlags:flags,costUSDC:"0",walletRequests:0,smtpMessagesSent:0,
  limitation:"Public cached DNS only; not proof of mailbox existence, SMTP acceptance, Google Group permission, SPF/DKIM/DMARC correctness, deliverability, security or ownership."
 };
}
async function ask(domain,type,fetchImpl,timeoutMs){
 const u=new URL("/resolve",DOH_ORIGIN);
 u.searchParams.set("name",domain);u.searchParams.set("type",type);
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const r=await fetchImpl(u.toString(),{
   method:"GET",mode:"cors",credentials:"omit",cache:"no-store",
   redirect:"error",referrerPolicy:"no-referrer",signal:controller.signal,
  });
  if(!r||r.status!==200||r.redirected===true)throw Error("Independent DNS provider HTTP failure: "+String(r?.status));
  const raw=await r.text();
  if(typeof raw!=="string"||raw.length>MAX_BODY)throw Error("Public DNS response too large.");
  try{return JSON.parse(raw)}catch{throw Error("Public DNS returned invalid JSON.");}
 }finally{clearTimeout(timer);}
}
export async function getFreePublicDns(domainInput,{fetchImpl=globalThis.fetch,now=()=>new Date(),timeoutMs=8500}={}){
 const domain=canonicalPublicDomain(domainInput);
 if(typeof fetchImpl!=="function"||!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>20000)
  throw Error("Invalid DNS client options.");
 const results=await Promise.all([
  ask(domain,"MX",fetchImpl,timeoutMs),
  ask(domain,"TXT",fetchImpl,timeoutMs),
  ask("_dmarc."+domain,"TXT",fetchImpl,timeoutMs),
 ]);
 return summarize(domain,results,now().toISOString());
}
