import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const site=readFileSync("docs/index.html","utf8");
const siteMap=readFileSync("docs/sitemap.xml","utf8");
const robot=readFileSync("docs/robots.txt","utf8");
test("Google original property verification file is exact small public-only 54 bytes",()=>{
  const file="googlecede1404657214bb.html";
  assert.equal(readFileSync("docs/"+file,"utf8"),"google-site-verification: "+file+"\n");
});
test("exact distinct checkout GitHub Pages project prefix and sitemap preserved",()=>{
  const base="https://livastic-vm5-primary-20260911.github.io/base-usdc-csv-checkout/";
  assert.match(site,/rel="canonical"/);
  assert.ok(site.includes(base));
  assert.ok(siteMap.includes("<loc>"+base+"</loc>"));
  assert.ok(robot.includes("Sitemap: "+base+"sitemap.xml"));
  assert.equal([...siteMap.matchAll(/<url>/g)].length,5);
});
test("buyer checkout retains exact opt-in paid data boundary, no tag or backend edits",()=>{
  assert.match(site,/0\.005 USDC/);
  assert.match(site,/id="preview"/);
  assert.match(site,/id="inspect"/);
  assert.match(site,/id="authorize"/);
  assert.match(site,/id="consent"/);
});
