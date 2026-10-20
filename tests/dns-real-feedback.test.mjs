import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("genuine separate external feedback only appears after actual free domain check, not on load",async()=>{
 const [html,app,readme]=await Promise.all(['docs/email-dns.html','docs/email-dns-app.mjs','README.md'].map(x=>readFile(x,'utf8')));
 assert(html.includes('id="dns-real-feedback" class="quote-panel" hidden'));
 assert(html.includes("Did that real DNS preview help?"));
 assert(html.includes("https://docs.google.com/forms/d/e/1FAIpQLSe_N8anCGUDmWdNZLnGwFRfhYaaCsB18BKdYd_VsFZp1xWm3g/viewform"));
 assert(html.includes('issues/new?template=real-user-feedback.yml'));
 assert(html.includes("may ask you to sign in"));
 assert(html.includes("Neither response is a purchase"));
 assert(app.includes('"dns-real-feedback").hidden=false'));
 assert(app.split('"dns-real-feedback").hidden=true').length>=3);
 assert(readme.includes("no fake identity"));
});
