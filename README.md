# CommaCheck Base — Base USDC CSV Preflight Microcheckout

**Free local CSV preview; optional single `0.005 USDC` x402-v2 report on a CSV you are allowed to share.**

Public website (after GitHub Pages deployment):
https://livastic-vm5-primary-20260911.github.io/base-usdc-csv-checkout/

## The problem actually solved

Small data imports and agent-generated CSVs often have duplicated rows, missing cells, irregular columns, or spreadsheet formula-like data. The browser runs meaningful local checks **without a wallet, uploads, ads, or analytics**. A human can then separately inspect a real seller price quote and choose a native Circle Base USDC payment for a larger structured JSON report from the **already operating** independent VM5 x402 merchant. This is a convenience/checkout UI for an existing original service, not another marketing-only mock API.

Existing merchant: `https://vm5-openapi-x402.onrender.com/v1/csv-preflight`; buyer-owned CSV maximum **32,768 UTF-8 bytes**. The original server returns HTTP402 with `PAYMENT-REQUIRED` when an unsigned valid request is made, then calls the standard x402 facilitator to verify/settle a valid **EIP-3009** typed data signature. This site never signs with or accesses any owner wallet; each potential purchaser must explicitly approve their own wallet authorization. There is **no auto pay**, auto retry, seed phrase, private key, ERC20 `approve`, staking, exchange, bank login, or owner-user-funding flow.

## Human checkout

1. A buyer pastes/uploads only **nonsecret** CSV they have legal rights to process; optional expected column names. The preview stays client-side and shows counts, not raw data in reports or logs.
2. They explicitly click "Check the live 0.005 USDC quote". It POSTs **one public synthetic sample** instead of their CSV. Only the expected HTTP402 is allowed. The `PAYMENT-REQUIRED` base64 JSON is checked against **exact** origin, path, original native Circle USDC Base contract, network, amount, recipient, token signing domain, expiry and transfer mode. If any differ, there is **no wallet request**.
3. They inspect token, amount and recipient, affirm sensitive-data policy and explicit cost; click a second button, confirm the one-time purchase in a browser confirmation, choose an EIP-1193 wallet, switch to Base, and the app only reads that **buyer's** public wallet address and native Circle USDC balance via `eth_call`.
4. Wallet itself must approve a **single EIP-712 TransferWithAuthorization** for exactly **5000 atomic USDC**, expiring after at most five minutes. This is a gasless EIP-3009 authorization relayed by the existing facilitator, not an unlimited token approval. There is no wallet key handling.
5. Only **after** the user's signature does the buyer's CSV go to the remote API in an actual paid POST. A successful paid response can display a transaction explorer link if provided. On timeout, settlement ambiguity, 402 or 5xx, the page **does not automatically resubmit or re-sign** and directs the buyer to check BaseScan/support before acting again.

Technical source of truth: x402 v2 and EIP-3009 protocol. This app makes no claim that a mainnet human payment has happened; all positive browser payment UI tests are explicitly **MOCKED**. In addition, an actually live *unsigned* HTTP402 quote from the production merchant was checked on 2026-10-20 and matched the expected 0.005USDC Base token and payTo. Actual receipt/accounting requires a new external customer's unique finalized onchain USDC transfer and paid report delivery; previews, wallet connects, local tests, simulated browser payments and quote requests **are NOT revenue**.

## Value, limits, privacy

- Free preview is a local structural heuristic; it isn't a compliance, malware, DLP, KYC, financial or audit certification. It checks row counts, blank cells, duplicates, formula prefixes, header/row width.
- Payment checkout sends buyer CSV to the **known server** only after explicit permission and signature, with no third-party Google scripts, tracking, cookies, browser storage or login. The VM5 API states it does not store customer CSV or echo raw rows, but treat it as a third-party server and **never submit secret, personal, proprietary or regulated information**.
- Only compatible MetaMask/EIP-1193 wallet with native Circle Base8453 USDC is supported. Some wallets/smart contracts cannot sign the required `eth_signTypedData_v4`. A failed browser response may still mean a settlement was broadcast; don't repay automatically. No refund guarantee, no investment pitch.
- `Content-Security-Policy` limits network requests to the legitimate VM5 merchant. All status/results are inserted as text rather than unsafe HTML. No external npm/CDN scripts in production.
- For agent buyers, the already-published VM1 free CSV skill and the existing VM5 x402 API documentation are linked. One economic owner across VM1/2/3/5/6; do not self-purchase or pretend internal probes are customers.

## Testing

```sh
node --test tests/*.test.mjs       # 32 offline unit/security cases, no wallet involved
node tests/browser-smoke.mjs       # Playwright mocked x402 + fake buyer wallet, NO real money
```

Browser smoke requires local `playwright-core` plus installed Chrome. The VM5 runner may resolve its existing neighboring Playwright dependency when `node_modules` is absent; external developers can use `npm install --no-save playwright-core` before the test. A production end-to-end paid settlement has NOT been performed from an owner-controlled wallet.

## Reproduction

Static files are in `docs/`. GitHub Pages can serve `main:/docs`. The merchant is the previously deployed `https://vm5-openapi-x402.onrender.com`, managed separately. This repository does not modify, replace, clone, or route around any previously blocked production deployment or user-prohibited GPU/CPU/VPS rental. It needs no secrets for local free/unsigned tests.

Support: <onecursora1@gmail.com>. AI-assisted original implementation, one human economic owner. No user principal spent by creation or tests.


## Higher-value CI risk audit (additional published SKU)

Alongside the original low-cost CSV page, `docs/workflow-risk.html` provides a different concrete developer problem: GitHub Actions YAML with mutable action versions, excessive token permission, untrusted PR input and exposed runners. It offers a **free local pattern preview** and a buyer-authorized **0.20 native Circle Base USDC** x402 report generated by the existing working `POST /v1/workflow-risk` VM5 merchant. This hosted backend is derived from the original, MIT-licensed same-owner VM2 analyzer; no production backend modifications were made.

The free preview never sends the YAML to VM5. For the paid report, the buyer explicitly reviews a **synthetic public sample** quote, then checks the payee, amount (200000 atomic), Base mainnet network and token in the EIP-712 wallet prompt before authorizing one paid POST of their nonsecret file. No user/owner key custody, bulk signing, DeFi staking or automatic retry. Tests: `node --test tests/*.test.mjs` and `node tests/workflow-browser-smoke.mjs`; the latter uses exclusively a fake wallet and fake paid API and DOES NOT prove real settlement.


## x402 quote inspector (demand-led third product)

`docs/x402-quote-checker.html` exposes a FREE client-side public unsigned x402-v2 JSON/base64 `PAYMENT-REQUIRED` header parser. It **does not fetch the inspected seller's URL**, touch a wallet, collect secrets or claim a benign-looking 402 is safe. It highlights wrong chain/asset/scheme, invalid recipient format, unsupported atomic amount and HTTP resource syntax. Human buyers can separately consent to upload that PUBLIC unsigned quote only to the existing VM5 merchant `GET /v1/x402-preflight?quote=…` for a hosted static 8-check report at `0.01` native Circle Base USDC. The new dynamic paid GET resource quote is bound to the exact user-consented encoded public request URL; changed amount/network/asset/payTo abort before wallet access. No private user source or tokens were involved in release tests.

Original confirmed demand signal (not direct sales): public NoHumans anonymous search-count feed reported recurring multi-day distinct-client searches for x402 endpoint checks/debugging on its Sep20-Oct13 window. This informs discovery/feature priorities but does not prove unique human users, approved paid subscriptions or conversion. Original paid Route was already operating before this static human entry UI. A full real signed buy-and-delivery for this specific client was NOT attempted from an owner wallet. Tests include pure unit/security cases and simulated buyer+tampered price browser flows.


## Real buyer feedback (free, no wallet)

We are not assuming that page views, quote reads or developer posts mean actual paying customers. The project has a public issue template asking about **actual tasks**, failed free checks, needed evidence and nonbinding hypothetical willingness to pay. No login except a GitHub account (if creating a public issue), no wallet signature or purchase. Users must not paste keys, signatures, transaction credentials, private customer data, wallet seeds or confidential CSV/YAML.

Submit: https://github.com/livastic-vm5-primary-20260911/base-usdc-csv-checkout/issues/new?template=real-user-feedback.yml

Only genuine unrelated human feedback and verified independent paid onchain settlement counts in the sales funnel. AI-generated feedback, our own VM agents' comments, test checkouts and promotional clicks are not customers.


## Real optional public-domain DNS human checkout (new)

The original fully static [Email DNS checkout](https://livastic-vm5-primary-20260911.github.io/base-usdc-csv-checkout/email-dns.html) reuses the already-running VM5 merchant `GET /v1/email-dns-preflight?domain=<PUBLIC_DOMAIN>` and original native Base Circle USDC receiving account (no new key). The merchant already provides a genuine **unsigned 402 quote for 5,000 atomic USDC units = 0.005 native Circle USDC** and one completely fictional free `/v1/email-dns-sample`. This page improves the buyer path: local invented sample (no network or wallet), strictly validated public-domain-only quote, exact same-owner contract/price/payTo and resource URL, explicit buyer opt-in, expiring EIP-3009 `TransferWithAuthorization` signed **only in the BUYER wallet** and submitted exactly once, and clearly marked ambiguous/failed response semantics.

Source: `docs/email-dns-core.mjs`, `docs/email-dns-app.mjs`, `docs/email-dns.html`, `tests/email-dns-*.test.mjs`. Its static Content Security Policy allows only this merchant, no analytics. No operator MetaMask keys/seed, no gas/funding, no back-end changes, no auto-retry, no spam, no false KYC or assumed third-party purchase. The signed successful-settlement path is tested only with synthetic FAKE wallet/API fixtures, not an external mainnet buyer. Only an independent outside buyer's unique finalized canonical Base USDC receipt and actual verified paid delivery establishes a new sale. Historical original VM1/VM5 receipts must not be double counted.

This is domain-level public DNS configuration, NOT an SMTP deliverability, DKIM selector, mailbox or security certification. No personal emails or customer records should be submitted; domain data is sent to the merchant only for the buyer-chosen quote. Do not promise refunds or immunity from wrong wallet/network. Existing original 0.005 CSV and 0.20 workflow-risk buyer products remain unchanged.


## Demand-first: free REAL public-domain DNS overview (no wallet)
The existing VM5 human DNS checkout now includes an opt-in FREE real public
MX/SPF/DMARC overview. Explicitly clicking its free button makes exactly three
independent Google Public DNS JSON-over-HTTPS GET requests, without sending
anything to the merchant or connecting a wallet. Only the visitor-selected
public domain is queried, not an email address or customer record. Google is
a THIRD-PARTY RESOLVER and can receive the domain and normal browser metadata;
users are told so before clicking. No personal data, key, private company
records or paid RPCs; no query runs on site load. Basic record presence and
Null MX are reported, not security, deliverability, mailbox existence or
Google Groups permission. DNS can be cached or temporary; errors do not mean
missing records. The existing optional separate 0.005 canonical native Circle
Base USDC report remains available for fuller machine-readable domain detail.
The user must explicitly choose and approve their own purchase; no owner funds,
wallet signatures, or fake purchase are involved. The free provider's service
may change independently. Source: docs/dns-public-free.mjs .


## Genuine opt-in free-user feedback
After an actual Google Public DNS lookup returns a response, this same buyer
page now shows two voluntary honest feedback choices: the previously published
VM5 Google-hosted nonconfidential project inquiry form and the existing
public GitHub issue template. A user is clearly warned that Google/GitHub
may collect account metadata or require login. No response is fabricated;
no fake identity, paid order, customer data or automatic submission occurs.
The links remain hidden until a user runs an actual free public-domain query,
and hide again if the domain changes. An optional separate wallet signature
for the same existing merchant API is still buyer-controlled and fully
unrelated to form submission. This provides a way to identify a real need
without demanding keys or USDC upfront.

**External directory listing prep, October 21 2026:** The original CommaCheck Base paid API has a no-login, free local CSV preview and optional separate one-time 0.005 USDC native Circle Base x402 paid POST (no evidence of new outside customer purchases today). Its REAL already published webpage now contains one neutral, nontracking footer backlink to independently operated [Twelve Tools](https://twelve.tools/) because the directory requires it for consideration of a **separately identifiable** service. This is not a purchase, a commission, an endorsement, a guarantee of listing, or evidence of any human buyer, and no payments, identity, credentials, real client CSV or backend changes are involved. The distinct free fiat-to-stablecoin payout audit is independently listed by the same one-human owner and must never be represented as a customer of CommaCheck Base. Only report a second entry as live if its separate original directory URL actually returns HTTP200 with this product and link.
