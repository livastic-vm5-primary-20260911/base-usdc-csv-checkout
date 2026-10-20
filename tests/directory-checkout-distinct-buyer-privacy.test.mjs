import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync('docs/index.html','utf8');
const readme=readFileSync('README.md','utf8');
const footer=html.slice(html.indexOf('</main>'),html.indexOf('</body>'));
const directory='https://twelve.tools/';

test('one real voluntary independent directory footer link is visible with no tracking',()=>{
 assert.ok(footer.startsWith('</main>'));
 assert.equal(html.split(directory).length-1,1);
 assert.match(footer,/<a href="https:\/\/twelve\.tools\/" target="_blank" rel="noopener noreferrer">Twelve Tools<\/a>/);
 assert.match(footer,/Discover independent tools/);
 assert.match(readme,/requires it for consideration/);
 assert.match(readme,/not a purchase, a commission, an endorsement/);
});
test('original paid merchant and buyer privacy gates unchanged, no third-party script introduced',()=>{
 assert.match(html,/connect-src https:\/\/vm5-openapi-x402\.onrender\.com/);
 assert.match(html,/id="preview"/); assert.match(html,/id="inspect"/);
 assert.match(html,/id="authorize"/);assert.match(html,/id="consent"/);
 assert.match(html,/0\.005 USDC/);
 assert.match(html,/EIP-712 transfer authorization/);
 assert.match(html,/No wallet keys, no approvals, no deposits/);
 assert.equal(html.includes('twelve.tools/script'),false);
 assert.doesNotMatch(html,/<script[^>]+src=["']https?:\/\//);
 assert.doesNotMatch(html,/auto.pay|auto.sign|sendTransaction/);
});
test('clear distinction from earlier no-payment fiat-payout audit and unconfirmed review outcome',()=>{
 assert.match(readme,/distinct free fiat-to-stablecoin payout audit/);
 assert.match(readme,/must never be represented as a customer/);
 assert.match(readme,/Only report a second entry as live if/);
});
