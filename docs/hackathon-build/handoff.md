# Handoff: OpenLC build, written Wed 23 Sep 2026 ~19:30 MYT

Start here, then read `docs/hackathon-build/progress.md` (the authoritative ledger) and `HACKATHON.md`
(rubric, phase plan, submission checklist, scope-cut list). `docs/hackathon-build/spec.md` and
`plan.md` hold the architecture and the 22-task plan.

**Deadline:** Thu 24 Sep 2026, 23:59 GMT+7 (Fri 25 Sep 00:59 MYT) on the earlier reading the
organizers have not yet confirmed. Roughly 29 hours left when this was written. Hao Wen submits
around Thu 20:00 MYT.

## How Hao Wen wants this run (non-negotiable)

- Every plan task goes through the hackathon-build loop: implementer subagent at the tier `plan.md`
  assigns → independent sonnet reviewer → fix round (resume the same implementer with SendMessage;
  a fresh one at sonnet tier if its transcript is gone) → haiku re-review → a ledger line in
  `progress.md`.
- After each completed task: push to `origin main` and STOP until Hao Wen says go. Never chain into
  the next task.
- Before every push: run `.hackathon-build/tools/history-secret-check.sh` (it prints variable names
  and match counts only, never values) and confirm no `.env` or `sources/` path is in history.
- Never read, print or commit the root `.env`. Never ask Hao Wen to paste a secret in chat.
- `sources/ProofPay/` is the read-only Sui original: reference only, never published.
- No `Co-Authored-By` or any other commit trailer. Never `git add -A` or `git add -f`.
- Write an acceptance gate script before dispatching a sweep-style task; a haiku implementer will
  otherwise report success it has not achieved. See `.hackathon-build/plan/task-1*-check.sh`.

## What is live right now

| Piece | Where |
|---|---|
| Web | https://openlc.vercel.app (Vercel, root `web/`, auto-deploys on push to main) |
| API | https://openlc-api.onrender.com (Render, root `backend/`, `/health` → `{"ok":true,"service":"openlc-api"}`) |
| Contract | `0x20C3b91B78D6F86b27C01e12692d2e56C0bcA5C5`, BOT Chain testnet (968), source-verified |
| Database | Supabase `ysxjtlajqyunlqspktuv`, 12 migrations applied, `openlc-documents` bucket |
| Keep-alive | GitHub Actions "Keep API warm" every 10 min on repo variable `API_HEALTH_URL` |
| Repo | github.com/zghanw/openlc (public), branch `main` |

Wallets: buyer `0x112CCDa2939B24b865a10C0c958c20299695e604`, supplier / demo supplier
`0x73e709f27a9f1AB7588F0a619a7B0d09eAeCc8e0`, deployer + arbitrator
`0x1221C500Dfd0D3E477ed741a849edEa303d689Ca`. The contract rejects an escrow unless buyer, supplier
and arbitrator are three distinct addresses.

**Tasks 1-12 are complete.** Feature Zero passed on the deployed preview with real MetaMask: two
orders ran end to end, including the partial claim (one transaction held 0.15 BOT and paid the
supplier the undisputed 0.55) and a mutual settlement. Every transaction hash is in `progress.md`.
The one-wallet judge path (task 12) was verified against the live API after
`OPENLC_DEMO_SUPPLIER_ADDRESS` was set on Render: create → invite → `supplier_confirmed`.

## Fix this first (10 minutes, judge-visible)

On the live demo path the order shows its supplier as **"My OpenLC workspace"**, not "OpenLC Demo
Supplier". `createInvite`'s auto-accept (backend/src/service/trade-service.ts, the demo branch that
calls `acceptWithInvite`) lets the accepting account's auto-provisioned organization name overwrite
`supplierName`. A judge sees a supplier named like their own workspace. Restore
`supplierName = demoSupplier.name` after the accept (or give the demo account's organization that
name when it is created), add a test asserting the supplier name on a demo order, and re-run
`.hackathon-build/tools/check-demo-supplier.mjs` against the live API after deploying.

## Remaining tasks, in the order I would do them

1. **13 — dispute settlement + AI mediation.** Known gap: the API does not record the settlement
   execution. On order PO-97139111 the chain shows `SettlementExecuted`
   (`0xb57dc85208eee87e171db06dbcecc370ad310d382c9af0101ae014d6fe220e61`) but the dispute is still
   `settlement_pending` / `pending_on_chain`. The web does POST
   `/v1/disputes/:id/settlement-execution`; reproduce, find the failure (Hao Wen saw an error
   message; ask for its text), fix, and wire Gemini for mediation. **Careful:** setting
   `GEMINI_API_KEY` on Render also makes `QDRANT_URL`/`QDRANT_API_KEY` required at boot
   (backend/src/server.ts), so the API will not start without them. Make Qdrant optional first.
2. **18 — `openlc.xyz` + production hosting.** Blocked on Hao Wen buying the domain.
3. **20 — mainnet deploy + one real order cycle.** Blocked on the organizers' mainnet BOT
   allocation. Deploy costs ~0.06 BOT; the deployer holds 0.0051. `scripts/deploy.js` refuses
   mainnet without `CONFIRM_MAINNET=yes` and refuses to overwrite a deployment record without
   `ALLOW_REDEPLOY=yes`.
4. **21 — README (Deployment section with BOTH addresses), demo video script, X launch post.**
5. **17 — `/launch` article** stating OpenLC is officially launched on BOT Chain Mainnet.
6. **19 — QA pass**, then **22 — mainnet dry run** with a fresh wallet and browser profile.
7. Cut unless time appears: **14** (deadline paths + chain-truth page), **15** (rename sweep),
   **16** (design system beyond the brand mark, which is done).

## Waiting on Hao Wen

- Mainnet BOT from the organizers to `0x1221C500Dfd0D3E477ed741a849edEa303d689Ca`; also confirm the
  deadline date and whether Vercel is acceptable.
- Buy `openlc.xyz` (keep the receipt, it is reimbursed).
- Post from @OpenLCdev: 5 valid posts are required before submitting, plus the launch post tagging
  @BOTChain_ai. Ready-to-post drafts: https://claude.ai/artifact/HjPUvQURrCyRbeEcmL8yuy

## Open items and traps

- `docs/terms-of-service.md` and `docs/dispute-policy.md` still say ProofPay/Sui/zkLogin, and every
  footer links to them. Task 13 owns them because the mediation engine reads them.
- `web/tests/e2e/*` still target the removed Google/zkLogin sign-in; they will fail. Task 19.
- Backend leftovers for task 15: `/auth/demo/google`, `payproof_organizations` tables and
  functions, `restoreSupabaseSession` in `web/lib/openlc-api.ts` (dead), transitional field names
  (`packageId`, `escrowObjectId`, `transactionDigest`, `checkpoint`).
- The testnet RPC `https://rpc.bohr.life` went 503 for several minutes during the run-through.
  Retry rather than assume a bug.
- Vercel silently missed one push (no deployment, no commit status). Verify a deploy by its commit
  status AND a marker string unique to the new build; an empty commit re-triggers it.
- Money in the browser is JS floats; every conversion goes through `toUnits` → `parseBotNumber`,
  which rounds to 9 decimals before `parseUnits`. Do not reintroduce float wei maths.
- Sessions are wallet-only: `actor.email` is always undefined. Never gate anything on an email.

## Local tools (git-ignored, on this machine)

- `.hackathon-build/tools/history-secret-check.sh` — the pre-push gate.
- `.hackathon-build/tools/watch-escrow.mjs [minutes]` — prints the next escrow events with their
  transaction hashes; retries through RPC outages.
- `.hackathon-build/tools/check-demo-supplier.mjs` — proves the one-wallet judge path on the live API.
- `.hackathon-build/tools/await-web-fix.mjs "marker"` — polls the live bundle for a string.
- `.hackathon-build/plan/` — per-task briefs, implementer reports, review packages, gate scripts.
