# spec.md: OpenLC

<!-- Filled in by hackathon-spec on 2026-09-20. Read by hackathon-build to
     drive the implementation loop; keep it current if scope is cut.
     Angle, rubric and deadlines live in HACKATHON.md. The Sui original is
     sources/ProofPay (read-only reference, gitignored). -->

## Architecture

OpenLC is PayProof with its chain layer replaced by BOT Chain; everything else carries over. The Next.js web app (Vercel, `openlc.xyz`) talks to MetaMask for every money movement and to the Hono API (Render) for the business record: orders, invites, documents, disputes and AI mediation. The API stores JSONB order and dispute aggregates plus evidence files in a new Supabase project, calls Gemini for purchase-order extraction and mediation, and optionally calls Qdrant for the arbitration package. `OpenLCEscrow.sol` on BOT Chain holds the BOT and enforces milestones, deadlines, partial disputes and dual-signed settlement. The API never signs a transaction and never holds funds. After each wallet transaction the browser posts the tx hash, and the API re-reads that transaction from BOT Chain RPC before marking the step `verified_on_chain`. The order page also reads the escrow straight from the contract, so a judge sees the chain's numbers even if the API is slow.

```text
MetaMask ──tx──▶ OpenLCEscrow.sol (BOT Chain 677 / 968)
   ▲                    ▲ eth_getTransactionReceipt, getEscrow()
   │                    │
web (Next.js, Vercel) ──REST──▶ api (Hono, Render) ──▶ Supabase (orders, disputes, files)
                                         └──▶ Gemini (PO extraction, advocates + mediator), Qdrant (optional)
```

Rejected alternative: a chain-first static site on GitHub Pages (Vol.1 style). It survives API outages, but it's a rewrite that drops invites, documents, PO import and negotiation, about 3 extra days.

## Tech stack

Everything below already exists in either PayProof or Vol.1; nothing is new to learn.

- **Contracts:** Solidity 0.8.24, OpenZeppelin 5 `ReentrancyGuard`, Hardhat 3 with `hardhat-toolbox-mocha-ethers`. The config comes from Vol.1: networks `botchainTestnet` (968, `https://rpc.bohr.life`) and `botchainMainnet` (677, `https://rpc.botchain.ai`), Blockscout verification, optimizer on, and `viaIR: true` because the escrow struct and events are wide.
- **API (`backend/`):** Node 22, Hono, zod, Supabase JS, jose (session JWT), Gemini and Qdrant clients (unchanged), **ethers 6 replacing `@mysten/sui`**, Vitest.
- **Web (`web/`, formerly `ui-prototype/`):** Next.js 16, React 19, Tailwind 4, shadcn/Radix, motion, TanStack Query, **ethers 6 plus a small MetaMask provider replacing `@mysten/dapp-kit-react`**, Playwright e2e.
- **Hosting:** Vercel (web, `openlc.xyz`), Render (API; a GitHub Actions cron pings `/health` every 10 minutes so judges never hit a cold start), Supabase (a new project, not ProofPay's).
- **Repo layout:** the repo root is the Hardhat project, as in Vol.1.

```text
/                     hardhat.config.js, package.json, .env (PRIVATE_KEY + API secrets, gitignored)
contracts/            OpenLCEscrow.sol, test/RevertingReceiver.sol, test/ReentrantReceiver.sol
test/                 OpenLCEscrow.test.js
scripts/              deploy.js (writes deployments/<network>.json), export-abi.js
deployments/          committed: address, deployBlock, txHash, chainId per network
backend/  web/  docs/  supabase/migrations/
sources/              gitignored Sui reference
```

## Contract: `OpenLCEscrow.sol`

A line-for-line port of `payproof::escrow` (`sources/ProofPay/contracts/payproof/sources/escrow.move`). The `payproof::pay` module is not ported. EVM adaptations:

| Move | Solidity | Why |
|---|---|---|
| Generic `Coin<T>` (SUI, USDC) | Native BOT via `msg.value` only | Judges hold BOT; one fewer approval step |
| Shared object ID | `uint256 escrowId`, **1-based** (`++escrowCount`) | 0 reads as "unset" in off-chain code |
| Object deleted on settle | `Status.Settled` terminal state; outcome kept on the struct | The escrow record itself becomes the permanent receipt |
| `create` + `create_with_milestones` | One `createEscrow` (plan 0/0/total means no milestones) | Smaller ABI |
| `mark_shipped` + `mark_shipped_and_release` | One `markShipped(id, evidenceHash)`, evidence required | The UI always requires dispatch evidence |
| `approve_buyer/supplier/arbitrator` | One `approveSettlement`, role from `msg.sender`, plus a `SettlementApproved` event | Smaller ABI, and each approval becomes verifiable |
| Clock in ms | `block.timestamp` in seconds (`uint64`); the off-chain model keeps ms and converts at the boundary | EVM clock |
| Transfers can't be refused | Capped-gas push (`50_000` gas) with a pull fallback: a failed payout is credited to `owed[to]` (`PaymentDeferred`) and claimed with `withdraw()` | Otherwise a supplier contract that rejects BOT could block the buyer's `openDispute` forever |
| `UpgradeCap` held by the deployer | No owner, no admin, no upgrade, no fee | Answers the "who can change this?" critique in `docs/pitch-review.md` |

**State:** `Status {Open, Disputed, Settled}`; `Mode {BuyerConfirmation, MutualApproval, Arbitrator, RefundUnshipped, ClaimUninspected}` (same numbering as Move: 0-4). Struct `Escrow`: `buyer, supplier, arbitrator` · `totalAmount, depositAmount, dispatchAmount, deliveryAmount` · `releasedAmount` (cumulative to supplier) · `balance` (BOT still held) · `disputedAmount, requestedBuyerRefund` · `approvedBuyerRefund, approvedSupplierRelease, proposalHash` · `orderHash, dispatchEvidenceHash` · `orderReference` (1-128 bytes) · `openedAt, deliveryDeadline, inspectionWindow, shippedAt, settledAt` · `status, mode, shipped, undisputedReleased, buyerApproved, supplierApproved, arbitratorApproved` · `settledBuyerRefund, settledSupplierRelease`. Plus `mapping(address => uint256) owed`.

**Functions** (all state-changing ones `nonReentrant`; effects before payouts):

| Function | Caller | Requires | Effect |
|---|---|---|---|
| `createEscrow(supplier, arbitrator, orderHash, orderReference, deposit, dispatch, delivery, deliveryDeadline, inspectionWindow) payable → id` | buyer | `msg.value == deposit+dispatch+delivery > 0`; three distinct non-zero parties; `orderHash != 0`; reference 1-128 bytes; `deliveryDeadline > now`; `inspectionWindow > 0` | Stores the escrow, pays the deposit to the supplier |
| `markShipped(id, evidenceHash)` | supplier | Open, not shipped, `evidenceHash != 0`, `balance == dispatch+delivery` | Sets `shipped`/`shippedAt`, pays the dispatch milestone |
| `anchorEvidence(id, kind, evidenceHash)` | buyer or supplier | Not Settled, `evidenceHash != 0` | Event only |
| `openDispute(id, disputed, requestedRefund)` | buyer | Open, `0 < disputed <= balance`, `requestedRefund <= disputed` | Status Disputed, pays `balance - disputed` to the supplier **in the same tx** |
| `approveSettlement(id, buyerRefund, supplierRelease, proposalHash)` | buyer / supplier / arbitrator | Disputed, `proposalHash != 0`, `buyerRefund <= requestedRefund`, sum `== disputed`; a party's approval must match an existing approval from the other party or the arbitrator; the arbitrator overrides | Records the approval |
| `executeSettlement(id)` | anyone | Disputed, arbitrator approved OR both parties approved, `balance == disputed` | Pays the split, Settled (MutualApproval / Arbitrator) |
| `releaseFull(id)` | buyer | Open | Pays the whole balance to the supplier, Settled (BuyerConfirmation) |
| `refundUnshipped(id)` | buyer | Open, not shipped, `now > deliveryDeadline` | Refunds the balance, Settled (RefundUnshipped) |
| `claimUninspected(id)` | supplier | Open, shipped, `now > max(shippedAt, deliveryDeadline) + inspectionWindow` | Pays the balance, Settled (ClaimUninspected) |
| `withdraw()` | anyone with `owed > 0` | | Pays `owed[msg.sender]` with full gas |
| `getEscrow(id)`, `inspectionClosesAt(id)`, `escrowCount`, `owed(addr)` | view | | |

**Events:** `EscrowCreated(id↑, buyer↑, supplier↑, arbitrator, amount, orderHash, orderReference, deliveryDeadline, inspectionWindow, deposit, dispatch, delivery)` · `MilestoneReleased(id↑, stage, amount, cumulativeReleased, remaining, evidenceHash)` (stage 1 deposit, 2 dispatch) · `Shipped(id↑, supplier↑, evidenceHash, releasedAmount, remainingAmount)` · `EvidenceAnchored(id↑, party↑, kind, evidenceHash)` · `DisputeOpened(id↑, disputedAmount, requestedBuyerRefund)` · `UndisputedReleased(id↑, supplier↑, amount)` · `SettlementApproved(id↑, approver↑, buyerRefund, supplierRelease, proposalHash)` · `SettlementExecuted(id↑, buyer↑, supplier↑, buyerRefund, supplierRelease, proposalHash, mode)` · `PaymentDeferred(to↑, amount)` · `Withdrawn(to↑, amount)`. Custom errors replace Move abort codes, one per abort (`Unauthorized`, `InvalidState`, `AlreadyShipped`, `DeadlineNotReached`, `NotShipped`, `InvalidAllocation`, `ApprovalMismatch`, …).

**Invariant (tested):** `address(this).balance == Σ escrow.balance + Σ owed` after every call.

## API changes (`backend/`)

- **Delete:** `integrations/sui-funding.ts`, `integrations/sui-settlement.ts`, `integrations/enoki-sponsor.ts`, `service/zklogin-service.ts`, and the routes `/v1/sui/sponsor*` and `/v1/auth/zklogin/complete`. Remove the `@mysten/sui` dependency and add `ethers`.
- **New `integrations/evm-escrow.ts`:** `EvmFundingVerifier` and `EvmSettlementVerifier` implement the **existing** `SuiFundingVerifier` / `SuiSettlementVerifier` interfaces, so `TradeService` and the dispute routes are untouched. They sit behind a narrow `EscrowChainReader` (`getTransactionReceipt`, `getTransaction`, `getEscrow`), which tests replace with a fake. Checks: receipt `status == 1`; a log from the configured escrow address decodes to the expected event; the event fields match the order; `tx.from` is the expected party (stronger than Sui's event sender); `getEscrow(id)` agrees on the final state.
- **Identity:** `IdentityService.createWalletChallenge/verifyWalletChallenge` switch to EIP-191. `ethers.verifyMessage(message, signature)` must recover `getAddress(address)`; the message names `Network: BOT Chain (chain <id>)`. The session JWT claim becomes `auth: "evm-wallet"`. `Actor` gains `walletAddress` (checksummed), so the trade service can bind parties to wallets.
- **Invites become wallet-bound:** `supplierEmail` becomes optional contact info. If the buyer names `supplierWalletAddress`, only a session with that wallet plus the invite token can accept. Otherwise the accepting wallet becomes `supplierWalletAddress`. `recordFunding` requires `funding.buyerAddress == buyer.walletAddress` and `funding.supplierAddress == supplierWalletAddress`.
- **Demo supplier (auto-confirm only):** a system account "OpenLC Demo Supplier" with `walletAddress = DEMO_SUPPLIER_ADDRESS`, a wallet Hao Wen controls; **no key on the server**. An order addressed to that wallet is accepted in the same request that creates its invite, so a lone judge goes straight to "Fund escrow". The UI labels it clearly: it confirms instantly and does not ship, and a second wallet is needed to try shipment.
- **Config (`.env`):** `BOTCHAIN_RPC_URL`, `BOTCHAIN_CHAIN_ID`, `OPENLC_ESCROW_ADDRESS`, `OPENLC_ESCROW_DEPLOY_BLOCK`, `ESCROW_VERIFIER_ENABLED=true`, `ARBITRATOR_ADDRESS` (default: the deployer), `DEMO_SUPPLIER_ADDRESS`, `OPENLC_SESSION_SECRET`, `SUPABASE_*`, `GEMINI_*`, `QDRANT_*` (optional), `FRONTEND_ORIGIN`, `INVITE_BASE_URL`.

## Web changes (`web/`)

- **New `lib/chain.ts`:** BOT Chain network params for 677 and 968 (from Vol.1's `contract.ts`, chosen by `NEXT_PUBLIC_BOTCHAIN_CHAIN_ID`), the escrow address and deploy block from env (**fail closed**: every action is disabled with a visible reason if either is missing), explorer URL helpers, and `formatBot`/`parseBot` built on ethers `formatUnits`/`parseUnits`. **Pitfall:** PayProof's `toUnits` does `Math.round(value * 10 ** decimals)`, which loses precision at 18 decimals, so every amount goes through `parseUnits` on a decimal string.
- **New `lib/wallet.tsx`:** a React provider (`connect`, `ensureBotChain` using `wallet_switchEthereumChain` with a `4902` → `wallet_addEthereumChain` fallback, `account`, `chainId`, `signer`, `accountsChanged`/`chainChanged` listeners, `signMessage`). It replaces `DAppKitProvider` in `app/providers.tsx`.
- **Rewrite `lib/escrow-actions.ts`:** same hook and function names, ethers underneath. `fundEscrow` parses `EscrowCreated` from the receipt for the `escrowId`; custom errors map to the same plain-English messages the Move abort table used. `payRequest` is removed.
- **Rewrite `lib/auth.ts`:** keep only `authenticateConnectedWallet` (personal_sign through the wallet provider).
- **Delete:** `lib/sui-dapp-kit.ts` (constants move to `chain.ts`), `app/auth/callback`, `app/api/faucet`, the QR pay and card top-up UI. The wallet page shows the BOT balance plus links to `faucet.botchain.ai/basic` (testnet) and `dex.botchain.ai` (mainnet).
- **Copy sweep:** Sui / SUI / USDC / Suiscan / zkLogin / Google / sponsored gas → BOT Chain / BOT / BOT Chain Explorer; PayProof / ProofPay → OpenLC.
- **Footer (mandatory):** a "Built on BOT Chain" mark linking `https://botchain.ai` and the BOT Chain Explorer for the active network.
- **Order page chain-truth:** reads `getEscrow(escrowId)` for live balance and status, and shows a banner if the API record disagrees with the chain.

## Data model

Orders and disputes stay JSONB aggregates (`trade_orders.aggregate`, `dispute_aggregates.aggregate`), so field changes need no SQL. The list below uses the names the code will have after the rename sweep (plan task 15). Feature Zero ships with PayProof's field names, so the rename can happen in one mechanical pass.

- `TradeOrder`: id, reference, buyerId, supplierId, **supplierWalletAddress** (required before funding), arbitratorWalletAddress, `assetType: "BOT"`, `amountUnits` (wei string), orderHash (bytes32 hex), lineItems[{description, quantity, unit, unitPriceUnits}], releasePlan{depositUnits, dispatchUnits, deliveryUnits}, status, **funding**{contractAddress, escrowId, txHash, buyerAddress, supplierAddress, arbitratorAddress, verificationStatus, fundedAt, deliveryDeadlineMs, inspectionWindowMs}, shipment{carrier, trackingNumber, txHash, verificationStatus}, documents[{sha256, storagePath, anchor{txHash}}], releaseRecords[{stage, amountUnits, txHash}], settlement{buyerUnits, supplierUnits, txHash, source}
- `DisputeAggregate`: onchainEscrow{contractAddress, escrowId, fundingTxHash, disputeTxHash, buyerAddress, supplierAddress, arbitratorAddress}, evidence[], proposals[], settlement{buyerUnits, supplierUnits, proposalHash, executionStatus}
- `openlc_accounts`: id, name, email (nullable), created_at
- `openlc_wallet_identities`: address (PK, checksummed), account_id → openlc_accounts
- `wallet_auth_challenges`: id, address, message, expires_at, used_at
- Rename map for task 15: `packageId → contractAddress`, `escrowObjectId → escrowId`, `transactionDigest → txHash`, `checkpoint → blockNumber`, `receiptObjectId → removed` (the settled escrow record is the receipt), `verifiedSuiAddress → walletAddress`, `PAYPROOF_* env → OPENLC_*`

## Feature Zero

On **BOT Chain testnet**, deployed (web on a Vercel preview URL, API on Render, the new Supabase project), with the escrow source-verified on `scan.bohr.life`. The product is fully OpenLC-named and Sui-free, but the Tuesday design system isn't applied yet: it wears PayProof's existing polished visual system, which already reads as market-ready. Nothing is stubbed. Every step is a real wallet transaction or a real API write.

**Definition of done:** someone with two MetaMask accounts, starting on the preview URL and never touching code or a console:

1. Account A connects MetaMask. BOT Chain Testnet is added or switched to automatically. They sign the gas-free sign-in message and land in the workspace.
2. A creates a purchase order: three line items, supplier wallet = account B, release plan 10% deposit / 20% dispatch / 70% delivery, a delivery date. A copies the invite link.
3. B opens the link, signs in, ticks "reviewed every line", and accepts.
4. A clicks **Fund escrow** and confirms one MetaMask transaction. The order shows **Funded**, the escrow balance is read from the contract, the step links to the explorer, and B's wallet has received the 10% deposit.
5. B marks the order shipped with a carrier, a tracking number and the dispatch photo. The photo's SHA-256 appears in the `Shipped` event and B receives the 20% dispatch milestone.
6. A records delivery, marks 3 cartons damaged, and opens a claim. **The same transaction** pays B the undisputed value, and only the disputed amount stays locked, on both the order page and the explorer.
7. Every step is marked `verified_on_chain` by the API (`ESCROW_VERIFIER_ENABLED=true`), and no page in the flow says Sui, SUI, USDC, zkLogin or Google.

## Business model / market

- **Target customer:** Southeast Asian SME suppliers who sell to new buyers on credit terms (wedge: Malaysian produce and F&B distributors, the demo story), and the buyers who can't get a bank letter of credit (ADB 2025: 41% of SME trade-finance applications are rejected).
- **How this makes money:** a fee on settled value (proposed 0.5%), charged only when an order settles, and paid by the supplier, who is paid on proof instead of waiting 60 days. The hackathon contract charges nothing, which keeps the code that moves money minimal and fully auditable.
- **Why someone adopts this:** in Asia, 44% of B2B credit sales are paid late and about 5% are never paid (Atradius 2025). OpenLC gives a supplier LC-style certainty (the money is locked before dispatch and released on proof) without a bank relationship. Only the disputed part of a bad delivery is held, so one crushed pallet no longer freezes a whole invoice.
