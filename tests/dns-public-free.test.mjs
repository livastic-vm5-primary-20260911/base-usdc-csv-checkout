import test from "node:test";
import assert from "node:assert/strict";
import {DOH_ORIGIN,getFreePublicDns} from "../docs/dns-public-free.mjs";

const fixedNow=()=>new Date("2026-10-21T00:00:00Z");
const payload=(Status,Answer=[])=>({Status,TC:false,Answer});
const quote=(name,type,data)=>({name:name+".",type,data,TTL:120});
const root="example.com";
function fixture({mx=payload(0,[quote(root,15,"0 .")]),txt=payload(0,[quote(root,16,'"v=spf1 -all"')]),dmarc=payload(0,[quote("_dmarc."+root,16,'"v=DMARC1; p=reject; adkim=s"')])}={}){
 const seen=[];
 const fetchImpl=async(url,opt)=>{
  seen.push({url,opt});
  const u=new URL(url);
  assert.equal(u.origin,DOH_ORIGIN);
  assert.equal(u.pathname,"/resolve");
  assert.equal(opt.method,"GET");
  assert.equal(opt.credentials,"omit");
  assert.equal(opt.mode,"cors");
  assert.equal(opt.referrerPolicy,"no-referrer");
  assert.equal(opt.redirect,"error");
  assert.equal(opt.cache,"no-store");
  assert(!Object.keys(opt).some(k=>/body|payment|auth|token|wallet/i.test(k)));
  const name=u.searchParams.get("name"),type=u.searchParams.get("type");
  const x=name==="_dmarc."+root?dmarc:type==="MX"?mx:txt;
  return {status:200,redirected:false,text:async()=>JSON.stringify(x)};
 };
 return {seen,fetchImpl};
}
test("real public free preview recognizes NULL MX, SPF published, DMARC reject without claiming successful delivery",async()=>{
 const f=fixture();
 const r=await getFreePublicDns(root,{fetchImpl:f.fetchImpl,now:fixedNow});
 assert.equal(r.ok,true);
 assert.equal(r.domain,root);
 assert.equal(r.dnsQuestionsMade,3);
 assert.equal(r.costUSDC,"0");
 assert.equal(r.walletRequests,0);
 assert.equal(r.smtpMessagesSent,0);
 assert.equal(r.mx.nullMxAdvertised,true);
 assert.equal(r.mx.advertisedExchangerCount,0);
 assert.equal(r.spf.policyCount,1);
 assert.equal(r.dmarc.requestedPolicy,"reject");
 assert(r.reviewFlags.includes("NULL_MX_DECLINES_INBOUND_MAIL"));
 assert.match(r.limitation,/not proof of mailbox existence/);
 assert.equal(f.seen.length,3);
 assert.deepEqual(new Set(f.seen.map(q=>new URL(q.url).searchParams.get("name"))),new Set([root,"_dmarc."+root]));
 const serialized=JSON.stringify(r);
 assert(!serialized.includes("v=spf1 -all"));
 assert(!serialized.includes("adkim"));
});
test("missing MX flags possible SMTP A fallback instead of definitive unreachable",async()=>{
 const f=fixture({mx:payload(0,[]),txt:payload(0,[quote(root,16,'"v=spf1 -all"')]),dmarc:payload(3)});
 const r=await getFreePublicDns(root,{fetchImpl:f.fetchImpl,now:fixedNow});
 assert.equal(r.ok,true);
 assert.equal(r.mx.explicitRecordCount,0);
 assert(r.reviewFlags.includes("NO_EXPLICIT_MX_SMTP_A_FALLBACK_MAY_EXIST"));
 assert(r.reviewFlags.includes("NO_DMARC_TXT_FOUND"));
 assert(!r.reviewFlags.includes("NULL_MX_DECLINES_INBOUND_MAIL"));
});
test("every root NXDOMAIN is an observed DNS code, not an SMTP/mailbox verdict",async()=>{
 const f=fixture({mx:payload(3),txt:payload(3),dmarc:payload(3)});
 const r=await getFreePublicDns(root,{fetchImpl:f.fetchImpl,now:fixedNow});
 assert.equal(r.ok,false);assert.equal(r.reason,"PUBLIC_DNS_NXDOMAIN");
 assert.match(r.limitation,/not tested SMTP/);
 assert.equal(r.costUSDC,"0");
});
test("DMARC p=none and multiple SPF records are visible narrow review flags",async()=>{
 const f=fixture({mx:payload(0,[quote(root,15,"10 mail.example.com.")]),
  txt:payload(0,[quote(root,16,'"v=spf1 include:a.example.com"'),quote(root,16,'"v=spf1 -all"')]),
  dmarc:payload(0,[quote("_dmarc."+root,16,'"v=DMARC1; p=none; rua=mailto:report@example.com"')])});
 const r=await getFreePublicDns(root,{fetchImpl:f.fetchImpl,now:fixedNow});
 assert.equal(r.mx.nullMxAdvertised,false);
 assert.equal(r.mx.advertisedExchangerCount,1);
 assert.equal(r.spf.policyCount,2);
 assert.equal(r.dmarc.requestedPolicy,"none");
 assert(r.reviewFlags.includes("MULTIPLE_SPF_POLICIES"));
 assert(r.reviewFlags.includes("DMARC_MONITOR_ONLY"));
 assert(!JSON.stringify(r).includes("report@example.com"));
});
test("false DNS answers with a different owner name never count as policy evidence",async()=>{
 const other="attacker.example.com";
 const f=fixture({txt:payload(0,[quote(other,16,'"v=spf1 +all"')]),dmarc:payload(0,[quote("_dmarc."+other,16,'"v=DMARC1; p=reject"')])});
 const r=await getFreePublicDns(root,{fetchImpl:f.fetchImpl,now:fixedNow});
 assert.equal(r.spf.published,false);
 assert.equal(r.dmarc.published,false);
 assert(r.reviewFlags.includes("NO_SPF_TXT_FOUND"));
});
test("invalid public-domain inputs stop BEFORE any third party network request",async()=>{
 const f=fixture();
 for(const x of ["", "localhost","a.local","a.invalid","person@example.com","https://example.com","1.2.3.4","my domain.com","a..com","example.com?foo=1",null,{},["example.com"]]){
  await assert.rejects(()=>getFreePublicDns(x,{fetchImpl:f.fetchImpl,now:fixedNow}),undefined,String(x));
 }
 assert.equal(f.seen.length,0);
});
test("provider errors, truncated, malformed, oversized and wrong status fail closed",async()=>{
 for(const broken of [
   {status:503,redirected:false,text:async()=>JSON.stringify(payload(0))},
   {status:200,redirected:true,text:async()=>JSON.stringify(payload(0))},
   {status:200,redirected:false,text:async()=>"<notjson>"},
   {status:200,redirected:false,text:async()=>"x".repeat(240001)},
   {status:200,redirected:false,text:async()=>JSON.stringify(payload(2))},
   {status:200,redirected:false,text:async()=>JSON.stringify({Status:0,TC:true,Answer:[]})},
   {status:200,redirected:false,text:async()=>JSON.stringify({Status:0,Answer:"bad"})},
 ]){
  const fetchImpl=async()=>broken;
  await assert.rejects(()=>getFreePublicDns(root,{fetchImpl,now:fixedNow}),undefined,String(broken.status));
 }
});
test("the free live-DNS site exposes third-party privacy and disallows auto queries at module import",async()=>{
 const {readFile}=await import("node:fs/promises");
 const [html,app,core]=await Promise.all(["docs/email-dns.html","docs/email-dns-app.mjs","docs/dns-public-free.mjs"].map(p=>readFile(p,"utf8")));
 assert(html.includes('id="dns-live-free"'));
 assert(html.includes('id="dns-live-result"'));
 assert(html.includes("Google Public DNS"));
 assert(html.includes("No wallet, fee or subscription"));
 assert(html.includes("connect-src https://vm5-openapi-x402.onrender.com https://dns.google;"));
 assert(app.includes('"dns-live-free").addEventListener("click"'));
 assert(app.includes("await getFreePublicDns(domain)"));
 assert(core.includes('https://dns.google'));
 assert(!/analytics|posthog|gtag\(|mixpanel|localStorage/i.test(core));
 assert(!/ethereum|eth_signTypedData|payment-signature/i.test(core));
});
