# plan.md: OpenLC

<!-- Filled in by hackathon-spec on 2026-09-20. hackathon-build reads this
     file and drives the loop task by task; docs/hackathon-build/progress.md
     tracks status against it. Checkpoint times: HACKATHON.md phase plan
     (Feature Zero due Mon 21 Sep 22:00 MYT). -->

## Task list

Feature Zero's tasks come first. Every task carries a model tier: **haiku**
for mechanical/repetitive work, **sonnet** for judgment or multi-file work.

| # | Task | Tier | Feature Zero? |
|---|---|---|---|
| 1 | Repo scaffold: PayProof trees + Vol.1 Hardhat root, green baseline | haiku | yes |
| 2 | `OpenLCEscrow.sol` (Move port with EVM adaptations) | sonnet | yes |
| 3 | Contract test suite (Move parity + EVM cases) | sonnet | yes |
| 4 | Testnet deploy, source verification, ABI export | haiku | yes |
| 5 | API: EIP-191 wallet identity; zkLogin/Enoki/Google removed | sonnet | yes |
| 6 | API: EVM funding + settlement verifiers | sonnet | yes |
| 7 | API: wallet-bound invites and funding party checks | sonnet | yes |
| 8 | Web: chain config, MetaMask provider, wallet sign-in | sonnet | yes |
| 9 | Web: escrow actions on ethers, 18-decimal BOT units | sonnet | yes |
| 10 | Web: Sui removal, OpenLC copy, BOT Chain footer | haiku | yes |
| 11 | Preview deploy (new Supabase, Render, Vercel) + Feature Zero run-through | haiku | yes |
| 12 | Demo supplier that auto-confirms | sonnet | no |
| 13 | On-chain dispute settlement + live AI mediation | sonnet | no |
| 14 | Deadline paths + chain-truth order page | sonnet | no |
| 15 | Rename sweep to EVM names (no behavior change) | haiku | no |
| 16 | OpenLC brand + design system | sonnet | no |
| 17 | Landing page + `/launch` article page | sonnet | no |
| 18 | `openlc.xyz` + production hosting + keep-alive | haiku | no |
| 19 | QA pass | sonnet | no |
| 20 | Mainnet deploy + one real full order cycle | haiku | no |
| 21 | README, demo video script, X launch post | sonnet | no |
| 22 | Mainnet dry run with a fresh wallet | haiku | no |

## Task details

### Task 1: Repo scaffold

**What ships:** The repo root becomes the OpenLC monorepo. `sources/ProofPay/backend` is copied to `backend/`, `ui-prototype` to `web/`, and `docs`, `supabase` and `demo-upload-files` (as `docs/demo/`) come across too. The Vite pay app (`app/`), the Move package and PayProof's pitch documents are not copied. A root Hardhat 3 project is built from Vol.1's `hardhat.config.js` (both BOT Chain networks, Blockscout descriptors, optimizer, `viaIR: true`) with `package.json`, OpenZeppelin 5, dotenv and ethers 6. `.env.example` files name every variable without values.
**Files touched:** new root `package.json`, `hardhat.config.js`, `.env.example`; copied `backend/`, `web/`, `docs/`, `supabase/`
**Definition of done:** `npm install` succeeds in the root, `backend/` and `web/`. `npx hardhat compile` runs. The backend's existing test suite passes **unchanged** (the pre-port green baseline). `npm run build` in `web/` passes. Neither `.env` nor `sources/` would be committed (`.gitignore` verified).

### Task 2: `OpenLCEscrow.sol`

**What ships:** The escrow contract exactly as specified in `spec.md` → "Contract": the function table, events, custom errors, 1-based ids, `Status`/`Mode` numbering matching Move, a single `_pay` helper (50k-gas push, then an `owed` credit plus `PaymentDeferred` on failure), `withdraw()`, and `nonReentrant` with effects before payouts. There is no owner, admin, upgrade path or fee. It also ships two test helpers: `RevertingReceiver` (rejects BOT) and `ReentrantReceiver` (re-enters on receive).
**Files touched:** new `contracts/OpenLCEscrow.sol`, `contracts/test/RevertingReceiver.sol`, `contracts/test/ReentrantReceiver.sol`
**Definition of done:** It compiles under 0.8.24 with viaIR. Every payout in the file goes through `_pay` (grep shows no other `.call{value`, except the one in `withdraw`). Each Move abort in `escrow.move` maps to a named custom error.

### Task 3: Contract test suite

**What ships:** A Hardhat mocha suite. Each of the 15 `escrow_tests.move` cases gets a same-named counterpart (the file header lists the mapping). Plus: creation validation (zero amount, duplicate or zero parties, zero hash, empty and 129-byte reference, past deadline, plan sum mismatch); approval rules (mismatch rejected, arbitrator override, refund cap, conservation); exact deadline boundaries (`== deadline` reverts, `+1` succeeds, for both deadline paths); a settled escrow rejects every action; a **reverting supplier cannot block `openDispute`** (payout deferred, then `withdraw` pays it); a **reentrant receiver** can't re-enter or double-withdraw; the balance invariant `contract.balance == Σ escrow.balance + Σ owed` checked after every step of the full lifecycle.
**Files touched:** new `test/OpenLCEscrow.test.js`
**Definition of done:** `npx hardhat test` is green with at least 25 cases, and every Move test name appears in the mapping header.

### Task 4: Testnet deploy, verification, ABI export

**What ships:** `scripts/deploy.js` deploys to the chosen network and writes `deployments/<network>.json` (chainId, address, deployBlock, txHash, deployer). `scripts/export-abi.js` copies the compiled ABI into `backend/src/integrations/openlc-escrow.abi.json` and `web/lib/openlc-escrow.abi.json`, and fails if a copy drifts from the artifact. The contract is deployed and source-verified on BOT Chain testnet.
**Files touched:** new `scripts/deploy.js`, `scripts/export-abi.js`, `deployments/botchain-testnet.json`, both ABI copies
**Definition of done:** `scan.bohr.life/address/<addr>` shows verified source. The deployments JSON matches the deploy transaction. Re-running `export-abi` reports no drift.

### Task 5: API wallet identity

**What ships:** `IdentityService` challenges and verifies with EIP-191 (`ethers.verifyMessage` recovers `getAddress(address)`; the message names BOT Chain and the chain id). Sessions carry `auth: "evm-wallet"`. `Actor` gains a checksummed `walletAddress`. Identity storage uses `openlc_wallet_identities`. The zkLogin, Enoki sponsor and Google OIDC paths are deleted along with their routes, config and tests.
**Files touched:** `backend/src/service/identity-service.ts`, `store/identity-store.ts`, `store/supabase-identity-store.ts`, `domain/types.ts`, `api/app.ts`, `api/identity-auth.ts`, `server.ts`, `config.ts`; delete `service/zklogin-service.ts`, `integrations/enoki-sponsor.ts`, `test/zklogin-service.test.ts`; update `test/identity-service.test.ts`, `test/identity-auth.test.ts`; new identity migration in `supabase/migrations/`
**Definition of done:** A test signs the challenge with an ethers `Wallet` and receives a session. A wrong signer, an expired challenge and a reused challenge each fail with their existing error codes. `npm test` is green.

### Task 6: API EVM verifiers

**What ships:** `integrations/evm-escrow.ts` with `EvmFundingVerifier` (verify, verifyShipment, verifyEvidenceAnchor, verifyDisputeOpened, verifyFullRelease, verifyDeadlineSettlement) and `EvmSettlementVerifier`, implementing the existing verifier interfaces behind an `EscrowChainReader` (receipt, transaction, `getEscrow`). Both are wired in `server.ts` behind `ESCROW_VERIFIER_ENABLED`. `@mysten/sui` is removed from the backend.
**Files touched:** new `backend/src/integrations/evm-escrow.ts`, `test/evm-escrow.test.ts`; delete `integrations/sui-funding.ts`, `integrations/sui-settlement.ts`, `test/sui-funding.test.ts`, `test/sui-settlement.test.ts`; `server.ts`, `config.ts`, `package.json`
**Definition of done:** Fake-reader tests cover: funding accepted; wrong `tx.from`; a log from a lookalike contract address; wrong amount or release plan; a mismatched shipment evidence hash; a wrong undisputed amount; a deadline settlement with the wrong mode; a settlement that doesn't conserve or has the wrong proposal hash. `grep -r "@mysten" backend/src` is empty, and build plus tests are green.

### Task 7: Wallet-bound invites and funding checks

**What ships:** `supplierEmail` becomes optional. When the buyer names `supplierWalletAddress`, only that wallet's session plus the invite token can accept. With no named wallet, the accepting wallet is bound. `recordFunding` rejects a buyer address other than the buyer's `walletAddress` and a supplier address other than `supplierWalletAddress`. Error codes and messages keep PayProof's style.
**Files touched:** `backend/src/service/trade-service.ts`, `domain/trade-types.ts`, `api/app.ts` (zod schemas), `test/trade-service.test.ts`, `test/api.test.ts`
**Definition of done:** New tests cover the matching wallet (accepted), a different wallet (403 `SUPPLIER_WALLET_MISMATCH`), an unnamed wallet (bound on accept), and funding from another buyer wallet (409). The full suite is green.

### Task 8: Web wallet layer

**What ships:** `lib/chain.ts` (network params for 677/968 from env, a fail-closed contract config, explorer helpers, `formatBot`/`parseBot`) and `lib/wallet.tsx` (MetaMask provider: connect, `ensureBotChain` with the 4902 → add fallback, listeners, signer, `signMessage`). `app/providers.tsx` uses it. `lib/auth.ts` is reduced to `authenticateConnectedWallet`, and the sign-in UI offers MetaMask only.
**Files touched:** new `web/lib/chain.ts`, `web/lib/wallet.tsx`; `web/app/providers.tsx`, `web/lib/auth.ts`, `web/app/components/app-shell.tsx`, the sign-in surface in `web/app/page.tsx`; delete `web/lib/sui-dapp-kit.ts`
**Definition of done:** In Chrome with MetaMask: connect adds or switches to BOT Chain Testnet, the sign-in signature yields an API session, and the workspace loads. The wrong network shows a one-click switch. An unset contract address disables actions with a visible reason.

### Task 9: Web escrow actions on ethers

**What ships:** `useEscrowActions` keeps its hook API, rebuilt on ethers against the ABI: fund (reads `escrowId` from `EscrowCreated`), ship with evidence, anchor evidence, accept delivery, open claim (records an existing on-chain dispute instead of re-signing, as before), both deadline paths, approve, execute. Custom errors map to the same plain-English messages as PayProof's abort table. Every amount goes through `parseUnits(decimalString, 18)`. `payRequest` is removed.
**Files touched:** `web/lib/escrow-actions.ts`, `web/lib/live-orders.ts`, `web/lib/dispute-actions.ts`, callers of `payRequest`; new `web/lib/units.test.mjs`
**Definition of done:** `grep -r "@mysten" web/` is empty and `npm run build` passes. `node --test web/lib/units.test.mjs` proves `parseBot("1.2") == 1200000000000000000n` and that a round trip through `formatBot` is exact.

### Task 10: Sui removal, OpenLC copy, BOT Chain footer

**What ships:** `app/auth/callback` and `app/api/faucet` are deleted. The QR pay and card top-up UI is replaced by a BOT balance plus testnet faucet and mainnet DEX links. All user-facing copy moves from Sui / SUI / USDC / Suiscan / zkLogin / Google / sponsored gas / PayProof / ProofPay to BOT Chain / BOT / BOT Chain Explorer / OpenLC. The footer gets a "Built on BOT Chain" mark linking `https://botchain.ai` and the active network's explorer.
**Files touched:** `web/app/**` (wallet, buyer, supplier, claim-section, order-actions, LiveTradeConsole, app-shell, layout metadata), `web/public/favicon.svg`
**Definition of done:** `grep -rniE "\bsui\b|usdc|zklogin|suiscan|payproof|proofpay|sponsored gas" web/app web/lib web/components` returns nothing, and the footer links resolve.

### Task 11: Preview deploy + Feature Zero run-through

**What ships:** The new Supabase project gets the migrations applied. The API runs on Render and the web app on a Vercel preview, both configured for BOT Chain testnet with the verifier enabled. `.github/workflows/keepalive.yml` pings `/health` every 10 minutes. CORS and the invite base URL point at the preview.
**Files touched:** `supabase/migrations/*`, new `.github/workflows/keepalive.yml`, `.env.example`, `web/.env.example`
**Needs from Hao Wen:** the new Supabase project's URL and keys, Render and Vercel access, the Gemini key (all into `.env` files, never pasted in chat), and a second MetaMask account with testnet BOT.
**Definition of done:** `spec.md` → Feature Zero → all seven steps pass on the deployed preview, and every transaction link is recorded in `docs/hackathon-build/progress.md`.

### Task 12: Demo supplier that auto-confirms

**What ships:** A system account "OpenLC Demo Supplier" with `walletAddress = DEMO_SUPPLIER_ADDRESS` (a wallet Hao Wen controls, no key on the server). An order addressed to it is accepted in the invite request. The create-order dialog gets a "Use the OpenLC demo supplier" option, labelled: "Confirms instantly. Does not ship. Use a second wallet to try shipment."
**Files touched:** `backend/src/service/trade-service.ts` (or new `service/demo-supplier.ts`), `config.ts`, tests; `web/app/components/create-order-dialog.tsx`
**Definition of done:** A test shows an order to the demo wallet becomes `supplier_confirmed` without a second session. On the preview, one wallet goes create → fund with no second account.

### Task 13: On-chain dispute settlement + live AI mediation

**What ships:** The claim section drives `approveSettlement` for each party and `executeSettlement`, and the API's settlement-execution route uses `EvmSettlementVerifier`. Gemini is configured, and the dispute policy is re-labelled for OpenLC.
**Files touched:** `web/app/components/claim-section.tsx`, `web/lib/escrow-actions.ts`, `backend/src/api/app.ts`, `server.ts`, `docs/dispute-policy.md`, `docs/terms-of-service.md`
**Definition of done:** On testnet, both parties submit evidence, the AI returns a cited proposal, both accept and both sign, execution succeeds, the dispute shows `settled` + `verified_on_chain`, and `SettlementExecuted` appears on the explorer.

### Task 14: Deadline paths + chain-truth order page

**What ships:** The order page reads `getEscrow(escrowId)` and shows the live balance, released total and status. A banner appears when the API record disagrees with the chain. The Reclaim (buyer) and Claim uninspected (supplier) buttons only appear when the contract would accept the call.
**Files touched:** `web/app/orders/[id]/page.tsx`, `web/app/components/order-actions.tsx`, `web/lib/chain.ts`
**Definition of done:** On testnet, a short-deadline escrow created from a Hardhat script shows Reclaim after its deadline and completes it. Hand-editing the API record's status produces the mismatch banner.

### Task 15: Rename sweep

**What ships:** The mechanical rename from `spec.md` → "Data model": `packageId → contractAddress`, `escrowObjectId → escrowId`, `transactionDigest → txHash`, `checkpoint → blockNumber`, `receiptObjectId` removed, `verifiedSuiAddress → walletAddress`, `PAYPROOF_*` env → `OPENLC_*`, and `PayProof*` identifiers → `OpenLC*`. No behavior change.
**Files touched:** `backend/**`, `web/**`, `.env.example` files
**Definition of done:** A grep for every old name is empty in `backend/` and `web/`. Backend tests and the web build are green before and after.

### Task 16: OpenLC brand + design system

**What ships:** Via `hackathon-ui`: the OpenLC logo, favicon and OG image, a palette and type pairing from the curated catalog applied as tokens across the app, and `DESIGN.md` rewritten for OpenLC.
**Files touched:** `web/app/globals.css`, `web/app/app-shell*.css`, `web/public/*`, `web/app/layout.tsx`, `DESIGN.md`
**Definition of done:** Every page uses the new tokens (no stray PayProof colours), the favicon and OG image render, and a desktop + mobile screenshot pair is saved.

### Task 17: Landing page + `/launch` article page

**What ships:** The landing page tells the OpenLC story: the sourced hook numbers with their links, a six-step how-it-works (Confirm, Fund, Ship, Deliver, Inspect, Settle), the partial-claim moment, security guarantees, and a BOT Chain partners section. `/launch` is the mainnet launch write-up; its text states OpenLC is officially launched on BOT Chain Mainnet, and it is published once task 20 is done.
**Files touched:** `web/app/page.tsx`, new `web/app/launch/page.tsx`
**Definition of done:** Every claim on the page is either true in the running product or sourced. No invented metrics.

### Task 18: `openlc.xyz` + production hosting

**What ships:** `openlc.xyz` points at Vercel (apex + www) with TLS, and the API is on Render (optionally `api.openlc.xyz`) with CORS for the domain. The keep-alive cron targets production.
**Files touched:** Vercel/Render settings, `.github/workflows/keepalive.yml`, env files
**Needs from Hao Wen:** the purchased domain and DNS access (keep the receipt for reimbursement).
**Definition of done:** `https://openlc.xyz` loads with valid TLS, signs in and reads an order through the production API.

### Task 19: QA pass

**What ships:** A `hackathon-qa` full-app bug pass and design-consistency pass, driven live against the production testnet build, with fixes landed.
**Definition of done:** The QA report's must-fix list is empty.

### Task 20: Mainnet deploy + one real full order cycle

**What ships:** `OpenLCEscrow` deployed and verified on BOT Chain mainnet, production switched to mainnet, and one real order run through fund → ship → partial claim → AI mediation → both approve → execute, with the transaction links recorded.
**Files touched:** `deployments/botchain-mainnet.json`, production env
**Needs from Hao Wen:** the organizer's mainnet BOT allocation (deploy ≈ 0.06 BOT plus the order value), keys, and the second wallet.
**Definition of done:** `scan.botchain.ai/address/<addr>` shows verified source plus the full cycle of transactions.

### Task 21: README, demo video script, X launch post

**What ships:** A plain-English `README.md` covering: what OpenLC does; how to use it (the demo-supplier path and the two-wallet path); a **Deployment** section with the testnet and mainnet addresses and explorer links; architecture; security model and limitations; and an origin note (rebuilt for BOT Chain from the team's Sui prototype PayProof, with what changed). Plus a 60-90 s demo video script (via `/pitch-timebox`) and the X launch post tagging @BOTChain_ai, drafted for Hao Wen to publish.
**Files touched:** `README.md`, new `docs/launch/video-script.md`, `docs/launch/x-posts.md`
**Definition of done:** A reader who has never seen the repo can find both contract addresses and complete the judge path from the README alone.

### Task 22: Mainnet dry run

**What ships:** A `hackathon-qa` dry run of the judge path on `openlc.xyz` using a fresh browser profile and a fresh MetaMask wallet with a little mainnet BOT.
**Definition of done:** Connect → demo-supplier order → fund works with no console errors, and every box in HACKATHON.md → Submission checklist is ticked.
