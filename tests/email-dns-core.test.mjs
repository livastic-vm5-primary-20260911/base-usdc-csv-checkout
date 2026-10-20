import test from "node:test";
import assert from "node:assert/strict";
import {MERCHANT,createAuthorization,createPaymentHeader} from "../docs/checkout-core.mjs";
import {DNS,INVENTED_DNS_REPORT,canonicalPublicDomain,dnsRequestUrl,parseDnsRequired,confirmDnsPaidReport} from "../docs/email-dns-core.mjs";

function encoded(q){return Buffer.from(JSON.stringify(q),"utf8").toString("base64");}
function quote(url){return {
 x402Version:2,
 resource:{url,description:"Public MX/SPF/DMARC report, not mailbox security",mimeType:"application/json"},
 accepts:[{scheme:"exact",network:MERCHANT.network,asset:MERCHANT.asset,
  amount:MERCHANT.amountAtomic,payTo:MERCHANT.payTo,maxTimeoutSeconds:300,
  extra:{name:MERCHANT.tokenName,version:MERCHANT.tokenVersion}}],
 extensions:{}
};}
const domain="example.com",url=dnsRequestUrl(domain);
function ok(q=quote(url),link=url){return parseDnsRequired(encoded(q),link)}
function result(){return {
 ok:true,paid:true,chargedUSDC:DNS.priceUSDC,kind:"public_email_dns_preflight",
 network:MERCHANT.network,domain,rawEmailAddressesReceived:false,smtpContactAttempted:false,
 inspectedAtUTC:"2026-10-21T00:00:00.000Z",warnings:[],mxHosts:[],
 spfPresent:true,dmarcPresent:true,dmarcPolicy:"reject"
};}
test("strict public domain canonicalization (no email, private host, URL or query)",()=>{
 assert.equal(canonicalPublicDomain("EXAMPLE.COM"),"example.com");
 assert.equal(canonicalPublicDomain("sub.xn--bcher-kva.de"),"sub.xn--bcher-kva.de");
 assert.equal(dnsRequestUrl("EXAMPLE.COM"),DNS.endpoint+"?domain=example.com");
 for(const bad of ["","localhost","localhost.local","noreply@example.com","https://example.com","example.com/a","127.0.0.1","example.test","a.example","host.internal","host.onion","host.invalid","ex ample.com","a..com","x.com?paid=true","-a.com","a-.com","a.com ","a.com\nx.com","a".repeat(64)+".com","a".repeat(254)+".com",{},null]){
  assert.throws(()=>canonicalPublicDomain(bad),undefined,"Rejected invalid domain "+String(bad).slice(0,20));
 }
});
test("real expected single DNS x402 quote validates original fixed payTo, chain, token, price, resource and signing domain",()=>{
 const checked=ok();
 assert.equal(checked.requirements.payTo,MERCHANT.payTo);
 assert.equal(checked.requirements.amount,"5000");
 assert.equal(checked.requirements.network,"eip155:8453");
 assert.equal(checked.resource.url,url);
 assert.equal(checked.requirements.extra.version,"2");
});
test("modified recipient, amount, network, token, scheme, exact-domain resource or signing domain FAILS CLOSED",()=>{
 for(const [field,value] of [
  ["payTo","0x1111111111111111111111111111111111111111"],
  ["amount","5001"],["network","eip155:1"],
  ["asset","0x1111111111111111111111111111111111111111"],
  ["scheme","upto"],["maxTimeoutSeconds",100000],
 ]){
  const q=quote(url);q.accepts[0][field]=value;
  assert.throws(()=>ok(q),undefined,"Fail closed "+field);
 }
 const e=quote(url);e.accepts[0].extra.name="Test coin";assert.throws(()=>ok(e));
 const e2=quote(url);e2.resource.url=DNS.endpoint+"?domain=attacker.com";assert.throws(()=>ok(e2));
 const e3=quote(url);e3.accepts[0].extra.assetTransferMethod="permit2";assert.throws(()=>ok(e3));
 const e4=quote(url);e4.accepts[0].extra.paymentFlow="escrow";assert.throws(()=>ok(e4));
});
test("url tamper, duplicate params, unrelated origin, wrong endpoint and malformed/oversized header are blocked",()=>{
 const legitimateOtherDomain=DNS.endpoint+"?domain=other.com";
 assert.equal(parseDnsRequired(encoded(quote(legitimateOtherDomain)),legitimateOtherDomain).resource.url,legitimateOtherDomain);
 assert.throws(()=>parseDnsRequired(encoded(quote(legitimateOtherDomain)),url));
 for(const changed of [
  DNS.endpoint+"?domain=example.com&domain=other.com",
  DNS.endpoint+"?domain=example.com&mode=test",
  "https://other.example/v1/email-dns-preflight?domain=example.com",
  DNS.endpoint+"?domain=example.com#change",
  DNS.endpoint+"?domain=%65xample.com",
  DNS.endpoint+"?domain=localhost",
 ]){
  assert.throws(()=>parseDnsRequired(encoded(quote(changed)),changed),undefined,changed);
 }
 assert.throws(()=>parseDnsRequired("invalid %%",url));
 assert.throws(()=>parseDnsRequired("A".repeat(65001),url));
 assert.throws(()=>parseDnsRequired(null,url));
});
test("EIP-712 generated for a buyer, single-use 5000 native Circle USDC authorization, no server signer needed",()=>{
 const q=ok(), account="0x2222222222222222222222222222222222222222";
 const {authorization,typedData}=createAuthorization({account,quote:q,nowSeconds:1792450000,nonce:"0x"+"a".repeat(64)});
 assert.equal(authorization.value,"5000");
 assert.equal(authorization.to,MERCHANT.payTo);
 assert.equal(typedData.domain.chainId,8453);
 assert.equal(typedData.domain.verifyingContract,MERCHANT.asset);
 assert.equal(typedData.primaryType,"TransferWithAuthorization");
 const header=createPaymentHeader({quote:q,signature:"0x"+"3".repeat(130),authorization});
 const decoded=JSON.parse(Buffer.from(header,"base64").toString("utf8"));
 assert.equal(decoded.resource.url,url);
 assert.equal(decoded.payload.authorization.value,"5000");
 assert.equal(decoded.accepted.network,MERCHANT.network);
});
test("required fields and exact domain protect against falsely confirming paid deliverables",()=>{
 assert.equal(confirmDnsPaidReport(result(),domain).paid,true);
 const changes=[
  ["paid",false],["ok",false],["chargedUSDC","0.5"],["kind","fake"],
  ["network","eip155:1"],["domain","other.com"],
  ["rawEmailAddressesReceived",true],["smtpContactAttempted",true],
  ["warnings","not-an-array"],["mxHosts","not-an-array"],
  ["inspectedAtUTC",null],["spfPresent",null],["dmarcPresent",null],
 ];
 for(const [key,v] of changes){const r=result();r[key]=v;assert.throws(()=>confirmDnsPaidReport(r,domain),undefined,"bad response "+key);}
 assert.throws(()=>confirmDnsPaidReport(null,domain));
});
test("fictional example is free and labeled not live or paid",()=>{
 assert.equal(INVENTED_DNS_REPORT.paid,false);
 assert.equal(INVENTED_DNS_REPORT.exampleOnly,true);
 assert.equal(INVENTED_DNS_REPORT.inspectedAtUTC,"FIXTURE_ONLY_NOT_LIVE_DNS");
});
test("human checkout is a single existing owner seller and is discoverable alongside other genuine products",async()=>{
 const {readFile}=await import("node:fs/promises");
 const html=await readFile("docs/email-dns.html","utf8");
 const [home,map,readme]=await Promise.all(["docs/index.html","docs/sitemap.xml","README.md"].map(f=>readFile(f,"utf8")));
 for(const token of ["dns-domain","dns-free","dns-quote","dns-pay","dns-consent","dns-quote-panel","dns-paid","dns-explorer"])assert(html.includes('id="'+token+'"'));
 assert.match(html,/script-src 'self'.*connect-src https:\/\/vm5-openapi-x402.onrender.com/);
 assert(html.includes('./email-dns-app.mjs'));
 assert(!/<script[^>]*src=["']https:\/\//.test(html));
 assert(home.includes('./email-dns.html'));
 assert(map.includes('/base-usdc-csv-checkout/email-dns.html'));
 assert(readme.includes("Zero ")===false || readme.includes("buyer"));
 assert(html.includes("0.005 native Circle Base USDC"));
 assert(html.includes("one human beneficial owner"));
 assert(html.includes("was NOT tested or confirmed"));
});
