/**
 * Browser-local x402 v2 buyer controls for the ALREADY LIVE VM5 public DNS
 * report.  Never uses or reads an owner wallet; no auto-pay or retry.
 */
import {MERCHANT,validateQuote} from "./checkout-core.mjs";
export const DNS=Object.freeze({
 origin:"https://vm5-openapi-x402.onrender.com",
 endpoint:"https://vm5-openapi-x402.onrender.com/v1/email-dns-preflight",
 freeSample:"https://vm5-openapi-x402.onrender.com/v1/email-dns-sample",
 priceAtomic:MERCHANT.amountAtomic,
 priceUSDC:MERCHANT.priceUSDC,
 chainHex:MERCHANT.chainHex,
});
const RESERVED_TLDS=new Set(["local","localhost","test","invalid","onion","internal","example"]);
export const INVENTED_DNS_REPORT=Object.freeze({
 exampleOnly:true,notLiveDns:true,ok:true,paid:false,
 kind:"public_email_dns_preflight",domain:"example.org",
 mxCount:1,spfPresent:true,dmarcPresent:true,dmarcPolicy:"reject",
 inspectedAtUTC:"FIXTURE_ONLY_NOT_LIVE_DNS",
 limits:"Fictional fixture. No mailbox existence, DKIM, SMTP, email delivery, or security result is established."
});
export function canonicalPublicDomain(s){
 if(typeof s!=="string" || s!==s.trim() || s.length<4 || s.length>253 ||
    /[@/:?#\\\s]/.test(s))throw Error("Enter ONE public domain (not an email address, URL or private host).");
 const domain=s.toLowerCase();
 if(!/^[a-z0-9.-]+$/.test(domain) || domain.includes(".."))
   throw Error("Use a public ASCII domain (IDNs must be in valid punycode form).");
 const labels=domain.split(".");
 const tld=labels.at(-1);
 if(labels.length<2 || !tld || tld.length<2 || /^[0-9]+$/.test(tld) ||
    RESERVED_TLDS.has(tld) ||
    labels.some(v=>v.length<1 || v.length>63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(v)))
   throw Error("Only a well-formed public domain is supported.");
 return domain;
}
export function dnsRequestUrl(domainInput) {
 const domain=canonicalPublicDomain(domainInput);
 const u=new URL(DNS.endpoint);
 u.searchParams.set("domain",domain);
 return u.toString();
}
export function parseDnsRequired(header,requestUrl){
 if(typeof header!=="string" || header.length<12 || header.length>65000 ||
    !/^[A-Za-z0-9+/_=-]+$/.test(header))throw Error("Invalid or missing merchant PAYMENT-REQUIRED quote.");
 if(typeof requestUrl!=="string" || !requestUrl.startsWith(DNS.endpoint+"?domain="))
   throw Error("Unexpected merchant domain quote URL.");
 const u=new URL(requestUrl);
 if(u.origin!==DNS.origin || u.pathname!=="/v1/email-dns-preflight" ||
    [...u.searchParams.keys()].length!==1 || u.searchParams.getAll("domain").length!==1 ||
    dnsRequestUrl(u.searchParams.get("domain"))!==requestUrl)
   throw Error("Merchant quote is not bound to one validated public domain.");
 let obj;
 try{
  const binary=atob(header.replace(/-/g,"+").replace(/_/g,"/"));
  obj=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Uint8Array.from(binary,x=>x.charCodeAt(0))));
 }catch{throw Error("Cannot decode x402 merchant quote.");}
 const quote=validateQuote(obj,requestUrl);
 if(quote.requirements.amount!==DNS.priceAtomic || quote.requirements.network!==MERCHANT.network)
   throw Error("Unexpected payment chain or amount.");
 return quote;
}
export function confirmDnsPaidReport(body,domain){
 if(!body || typeof body!=="object" || Array.isArray(body) ||
    body.ok!==true || body.paid!==true || body.chargedUSDC!==DNS.priceUSDC ||
    body.kind!=="public_email_dns_preflight" || body.network!==MERCHANT.network ||
    body.domain!==canonicalPublicDomain(domain) ||
    body.rawEmailAddressesReceived!==false || body.smtpContactAttempted!==false ||
    typeof body.inspectedAtUTC!=="string" || !Array.isArray(body.warnings) ||
    !Array.isArray(body.mxHosts) || body.mxHosts.length>8 ||
    typeof body.dmarcPresent!=="boolean" || typeof body.spfPresent!=="boolean")
   throw Error("Paid DNS report was not confirmed with required fields. Check settlement BEFORE any retry.");
 return body;
}
