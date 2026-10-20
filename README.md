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
