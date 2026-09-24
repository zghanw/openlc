# Handoff: OpenLC build, written Fri 25 Sep 2026 01:20 MYT

Start here, then `docs/hackathon-build/progress.md` (the authoritative ledger), `HACKATHON.md` (rubric,
submission checklist, scope cuts), `web/PRODUCT.md` (product truth) and `web/DESIGN.md` (the design system).

**Deadline:** Fri 25 Sep 2026, 23:59 GMT+7 (Sat 26 Sep 00:59 MYT). Confirm with Hao Wen that this later reading is
the one the organizers use; if it is the earlier one, submission is already overdue and only the essentials matter.

## How Hao Wen wants this run (non-negotiable)

- Every task goes through the loop: implementer subagent → independent reviewer → fix round → re-review → a ledger
  line in `progress.md`. After each completed task: push to `origin main` and STOP until Hao Wen says go.
- Before every push: `bash .hackathon-build/tools/history-secret-check.sh` (it prints variable names and counts only).
- Never read, print or commit the root `.env`, `web/.env*` or `backend/.env`. Never ask Hao Wen to paste a secret.
- `sources/ProofPay/` is read-only reference, never published. No `Co-Authored-By` or other trailer. Never
  `git add -A` / `-f`.
- **Mainnet BOT has real value.** Hao Wen runs every command or MetaMask action that spends or transfers mainnet
  BOT himself (the deploy, funding wallets, the real order). Claude prepares, explains, and verifies on chain.
- Write an acceptance gate script before any sweep-style task (see `.hackathon-build/plan/task-*-check.sh`).

## What is live (testnet)

| Piece | Where |
|---|---|
| Web | https://openlc.vercel.app (Vercel, root `web/`, auto-deploys on push to main) |
| API | https://openlc-api.onrender.com (Render, root `backend/`) |
| Contract | testnet `0x20C3b91B78D6F86b27C01e12692d2e56C0bcA5C5` (chain 968), source-verified, 41 tests |
| Database | Supabase `ysxjtlajqyunlqspktuv` (holds all testnet orders and disputes today) |
| Keep-alive | GitHub Actions "Keep API warm", repo variable `API_HEALTH_URL` |
| Domain | **openlc.online** bought by Hao Wen on 25 Sep; not connected to anything yet |

Wallets: deployer and arbitrator `0x1221C500Dfd0D3E477ed741a849edEa303d689Ca`; buyer
`0x112CCDa2939B24b865a10C0c958c20299695e604`; supplier and demo supplier `0x73e709f27a9f1AB7588F0a619a7B0d09eAeCc8e0`.
Buyer, supplier and arbitrator must be three different addresses.

Done: tasks 1-14, 16 (workspace redesign), 17's landing part, 21's README and video scripts (`PITCH.md`; both videos
recorded, and video 1 is posted), plus the sign-in gate, the landing sign-in wording, the BOT Chain signing guard, and
the busy-mediator message. Task 13's DoD run happened on camera in the demo recording. Task 15 is cut.

## Mainnet BOT: where it is (checked 01:19 MYT)

Hao Wen received 0.6 mainnet BOT from the organizers, but it is **not in any of the three wallets above**: deployer
0.0651, buyer 0, supplier 0.0038. Ask him which address received it. Budget: the deploy costs about 0.06 BOT (the
deployer should hold ≥ 0.08 first); one real full order cycle needs about 0.1-0.15 BOT for the order plus gas for the
buyer (fund, accept) and the supplier (ship), about 0.02 each. Keep a reserve.

## Remaining work, in order

1. **Task 20: mainnet deploy + one real order cycle.**
   - `CONFIRM_MAINNET=yes npm run deploy:mainnet` (Hao Wen runs it). It writes `deployments/botchain-mainnet.json`
     and refuses to overwrite an existing record.
   - Verify the source on https://scan.botchain.ai (hardhat.config.js already has the Blockscout chainDescriptors
     for 677), then run `npm run check-abi`.
   - One real order on mainnet: fund → ship → accept, at least; a partial claim too if the budget allows. Record every
     hash.
2. **Task 18: openlc.online + production config.**
   - DNS: ask where the domain was bought. In Vercel → Domains, add `openlc.online` and `www.openlc.online`; Vercel
     shows the exact records (usually an A record for the apex and a CNAME for www). Optionally `api.openlc.online`
     → Render as a custom domain.
   - Render env: `BOTCHAIN_RPC_URL=https://rpc.botchain.ai`, `BOTCHAIN_CHAIN_ID=677`, the mainnet
     `OPENLC_ESCROW_ADDRESS` and `OPENLC_ESCROW_DEPLOY_BLOCK`, `FRONTEND_ORIGIN=https://openlc.online` (CORS AND the
     sign-in message's origin use it, so a mismatch breaks sign-in), `INVITE_BASE_URL=https://openlc.online/orders`.
   - Vercel env: `NEXT_PUBLIC_BOTCHAIN_CHAIN_ID=677`, the mainnet escrow address and deploy block, the arbitrator
     address, the backend URL.
   - Update the keep-alive `API_HEALTH_URL` if the API URL changes.
   - Check every env name against `.env.example` and `web/.env.example`.
3. **Production-ready: no demo or hardcoded data** (Hao Wen's request). Candidates, confirm each with him:
   - the sample orders (`web/lib/sample-orders.ts`, `demo-orders.ts`, the "Show sample orders" toggle, "Sample"
     tags, "Sample orders are not counted" on Overview);
   - the "Skip to {status}" buttons on live orders;
   - backend demo mode (`OPENLC_DEMO_MODE`, `/v1/demo/*`, `/auth/demo/google`, `DemoOrderService`, demo-auth);
   - the unlinked legacy `/buyer` and `/supplier` routes;
   - testnet copy on the landing ("runs on BOT Chain testnet", faucet → DEX, the testnet transaction links; swap in
     the mainnet order's hashes after task 20);
   - the terms and policy "pilot on testnet" wording.
   Known small bugs to fix on the way: "Accept delivery and release {full value}" quotes the full order value, not
   the remaining balance; the supplier contact email is required though identity is wallet-only (make it optional and
   omit it when blank).
   **Decisions to ask first:**
   - Does the OpenLC demo supplier stay on mainnet? It is the lone-judge path (30% of the score); on mainnet a
     judge's BOT stays locked until the delivery date, min 24h, then is reclaimable.
   - Do the testnet orders in Supabase get archived or cleared before mainnet? That is destructive: export first and
     get explicit approval.
   - Does testnet stay reachable anywhere?
4. **Gemini:** the free tier allows 20 requests/day per Flash model, and one mediation uses up to 8. Recommend billing
   (the same key; negligible cost), or set `GEMINI_MODEL` on Render to models with quota left, e.g.
   `gemini-3.5-flash-lite,gemini-3.6-flash,gemini-3.1-flash-lite`. The web PO import (`/api/extract-po`) needs
   `GEMINI_API_KEY` and a single `GEMINI_MODEL` on Vercel; it is not configured there yet.
5. **Task 17:** the `/launch` article on the site, stating OpenLC is "officially launched on BOT Chain Mainnet", with
   the mainnet address and the real order's hashes.
6. **README:** fill in the mainnet Deployment row and add the mainnet on-chain activity. **Task 21's rest:** the X
   launch post tagging @BOTChain_ai (at least 5 valid posts from @OpenLCdev in total).
7. **Task 19 QA + task 22 dry run** on openlc.online with a fresh wallet and a fresh browser profile.

## Traps

- The live API accepts only the configured FRONTEND_ORIGIN: test sign-in on the real domain, never localhost.
- Vercel once silently missed a push. Verify a deploy by commit status AND a marker string unique to the new build.
- The testnet RPC sometimes returns 503 for minutes; mainnet is untested at load. Retry before assuming a bug.
- Money in the browser: every conversion goes through `toUnits` → `parseBotNumber`. Never float wei maths.
- Every signed transaction goes through `requireBotChainSigner` (switches and pins the chain id). Keep it that way.
- A claim can't exceed the balance still held (the contract reverts); the form doesn't check this.

## Local tools (git-ignored)

`.hackathon-build/tools/`: `history-secret-check.sh`, `watch-escrow.mjs`, `check-demo-supplier.mjs`,
`await-web-fix.mjs "marker"` (polls the live bundle for a string). Briefs, gates and review diffs are in
`.hackathon-build/plan/`. `.claude/launch.json` runs the web dev server on port 3107.
