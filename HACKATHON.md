# HACKATHON.md: Build Week Hackathon Vol.2 (Girl Meets Tech × BOT Chain)

<!-- Filled in by /hackathon-kickoff on 2026-09-20. Every downstream phase
     (hackathon-spec, hackathon-build, hackathon-ui, hackathon-qa,
     hackathon-deck, /pitch-timebox) reads this file; keep it current when
     scope is cut. Rules source: memory/hackathon-vol2-rules.md and
     https://www.girlmeetstech.org/guidebook-build-week-hackathon-vol2 -->

**Product name:** OpenLC, "the open letter of credit" (rebrand of PayProof). Domain: `openlc.xyz`. X handle: @OpenLC or the closest free variant.
**Deployer:** `0x1221C500Dfd0D3E477ed741a849edEa303d689Ca` (the Vol.1 deployer; key in `.env`, never committed). On 2026-09-20: 9.70 testnet BOT, 0.0051 mainnet BOT. Mainnet needs the organizer allocation.
**Base:** PayProof (Sui), reference copy in `sources/ProofPay/`, never published from this repo.
**Builder:** solo (Hao Wen), with Claude Code pairing on implementation.

## The one-liner

Escrow for B2B orders on BOT Chain: the buyer's payment is locked before the goods ship, paid out in milestones as dispatch and delivery are proven, and when part of a delivery goes wrong only the disputed amount is held while everything else pays the supplier in the same transaction.

## Urgency hook

Across Asia, 44% of B2B sales made on credit are paid late and about 5% are never paid at all ([Atradius Payment Practices Barometer, Asia 2025](https://group.atradius.com/dam/jcr:de5379ba-2ad5-415f-9c77-6e6c2669d13e/payment-practices-barometer-asia-2025-en.pdf)); the bank instrument that fixes this, trade finance, turns down 41% of SME applications ([ADB Global Trade Finance Gap Survey, Dec 2025](https://www.tralac.org/documents/news/7229-adb-global-trade-finance-gap-survey-december-2025/file.html)). Every order shipped on 60-day credit is the supplier lending to a stranger.

**Positioning line (say it first and last):** "We replace credit terms and deposits with payment secured before dispatch and released on proof."

## Business angle

- **Target customer/buyer:** Southeast Asian SME suppliers selling to new buyers on credit terms (wedge: Malaysian produce and F&B distributors, as in the demo story), and the buyers who cannot get a letter of credit.
- **How this makes money:** a fee on settled value (proposed 0.5%), charged only when an order settles. The supplier pays it and is paid on proof instead of waiting 60 days. The hackathon contract charges no fee, to keep the code that moves money small.
- **Why now:** late payment is the default (44% of credit sales), bank trade finance rejects SMEs, and an escrow action on BOT Chain costs about 0.002-0.004 BOT in gas (20 gwei, measured 2026-09-20). A bank LC is priced per instrument, whatever the ticket size.

## Judging rubric

| Criterion | Weight | Our proof point (what a judge can see working in 30 seconds) |
|---|---|---|
| Contract deployed and working on BOT Chain | 35% | Source-verified `OpenLCEscrow.sol` on scan.botchain.ai (mainnet 677) and scan.bohr.life (testnet 968), with one complete real order on mainnet: fund → dispatch release → partial claim → settlement. The order's audit trail links every transaction. |
| Anyone can connect wallet, main action works | 30% | Connect MetaMask (BOT Chain is added automatically), create an order, lock BOT with one signature; the order page reads the escrow balance back from the chain. A lone judge picks the built-in OpenLC demo supplier, which confirms instantly, so a single wallet reaches the on-chain lock; a second MetaMask account plays a real supplier through a copy-paste link. |
| Use case clarity and originality | 20% | One screen: "30 BOT locked → 3.6 BOT disputed → 26.4 BOT paid to the supplier in the same transaction." AI advocates for each side plus a neutral mediator; every quote is verified word for word; the AI cannot move money; both parties sign the split on-chain. |
| X post tagging @BOTChain_ai | 15% | A dedicated project account posting daily from Day 1, a launch video tagging @BOTChain_ai, and a link to the mainnet launch article. |

## Angle decision

Scored 2026-09-20 (1-5 per criterion, weighted to the 100-point rubric).

| Angle | Contract (35) | Main action (30) | Clarity + originality (20) | X post (15) | Weighted |
|---|---|---|---|---|---|
| **A (chosen): PayProof → BOT Chain port + full rebrand** | 5 | 5 | 4 | 4 | **93** |
| B: OpenVerdict cut-down port | 4 | 3 | 5 | 5 | 81 |
| ~~C: PayProof + OpenVerdict jury~~ | | | | | folded into A |

**Why A:** Every trust claim PayProof makes (locked funds, milestones, deadlines, partial disputes, hashed evidence) is plain EVM escrow and carries over unchanged. Its main action is one wallet transaction with no server on the critical path. Option C's extra (a multi-agent AI panel) already exists in PayProof as two advocates plus a neutral mediator, so C adds nothing. B loses its core trust claims on BOT Chain, which has no randomness source (`block.prevrandao` returns the constant 2).

## Deadline (read this first)

The guidebook pairs 2026 dates with 2025 weekdays: it says "Thursday, September 25", but 2026-09-25 is a Friday. Until the organizers confirm, **plan for the earlier reading**:

- **Hard target:** Thu 24 Sep 2026, 23:59 GMT+7 (Fri 25 Sep 00:59 MYT). All seven items submitted.
- If the organizers confirm Fri 25 Sep, the extra day is buffer, not scope.
- Ask in the Telegram group together with the mainnet BOT allocation request.

## Phase plan (back-solved from Thu 24 Sep 23:59 GMT+7; times in MYT, T+0 = Sun 20 Sep 01:00)

There is no live pitch. Judges open the link, connect a wallet and try it, so the "pitch" is the X video, the README and the launch article.

| Checkpoint | Time | Deliverable | Skill / command | Owner |
|---|---|---|---|---|
| Kickoff | Sun 20 Sep, T+0 | This file | `/hackathon-kickoff` | Hao Wen |
| Spec | Sun 20 Sep 12:00, T+11h | Done: [`docs/hackathon-build/spec.md`](docs/hackathon-build/spec.md) + [`plan.md`](docs/hackathon-build/plan.md) (22 tasks, 1-11 = Feature Zero) | `hackathon-spec` | Hao Wen + Claude |
| Name + X day 1 | Sun 20 Sep evening | Name chosen, X account created, post #1 (build in public: "porting a Sui escrow to BOT Chain") | | Hao Wen |
| Contract | Sun 20 Sep 23:00, T+22h | **Done 12:45** — `OpenLCEscrow.sol`, 41 tests, deployed + source-verified on testnet: [`0x20C3b91B78D6F86b27C01e12692d2e56C0bcA5C5`](https://scan.bohr.life/address/0x20C3b91B78D6F86b27C01e12692d2e56C0bcA5C5) | `hackathon-build` | Claude |
| **Feature Zero** | Mon 21 Sep 22:00, T+45h | On BOT Chain testnet, deployed to a preview URL: MetaMask sign-in → create order → second wallet accepts → fund → ship with evidence → partial claim pays the undisputed part in the same transaction. Built market-ready, not a stub. | `hackathon-build` | Claude, tested by Hao Wen |
| Brand + design system | Tue 22 Sep 12:00, T+59h | Name, logo, favicon, palette and type applied to the Feature Zero UI | `hackathon-ui` | Hao Wen + Claude |
| Core build | Tue 22 Sep 23:00, T+70h | Backend EVM verifiers; dispute → AI mediation → both parties sign the split → execute on-chain; deadline refunds and claims; landing page with BOT Chain footer; domain live | `hackathon-build` | Claude |
| QA + polish | Wed 23 Sep 12:00, T+83h | Full-lifecycle bug pass plus design-consistency pass on the production testnet build | `hackathon-qa` | Claude |
| Mainnet | Wed 23 Sep 18:00, T+89h | Mainnet deploy + verification, one real full order cycle on mainnet, production switched to mainnet | | Hao Wen (keys) + Claude |
| Launch assets | Wed 23 Sep 23:00, T+94h | README with a Deployment section (testnet + mainnet addresses), mainnet launch article, 60-90 s demo video, launch post tagging @BOTChain_ai | `hackathon-deck` (adapted), `/pitch-timebox` for the video script | Hao Wen + Claude |
| Code freeze | Thu 24 Sep 00:59, T+96h | "Building ends" (early reading) | | |
| Dry run | Thu 24 Sep 12:00, T+107h | Judge path on mainnet with a fresh wallet on a fresh browser profile; backend kept warm | `hackathon-qa` (dry-run mode) | Hao Wen |
| **Submission** | Thu 24 Sep 20:00, T+115h (cutoff T+120h) | All seven items in the form | | Hao Wen |

X cadence: at least one post per day, Sun through Thu. At least 5 valid posts are required before submitting.

## Submission checklist (pass/fail: any missing item = not judged)

1. [ ] Contract address on BOT Chain, with real on-chain activity (a full mainnet order)
2. [ ] Live website on a purchased domain ($1-1.50, reimbursed; keep the receipt); judges connect a wallet and interact
3. [ ] Public GitHub repo with the `.sol` file and a plain-English `README.md` whose **Deployment** section lists the testnet AND mainnet addresses
4. [ ] X post from the dedicated project account, tagging @BOTChain_ai, showing the live product
5. [ ] At least 5 valid posts from that account within the 30 days before submitting
6. [ ] Mainnet launch article on our own site or channel, stating the project is "officially launched on BOT Chain Mainnet"
7. [ ] BOT Chain name/logo in the site footer or partners section, linking to botchain.ai and the BOT Chain Explorer

## Team

| Name | Strengths | Owns (build) | Pitch section |
|---|---|---|---|
| Hao Wen | Vol.1 champion (Agent Escrow on BOT Chain), Solidity, React/TS, AI integration | Keys and deploys, product decisions, brand, X account, testing with two wallets | X video, launch article, README voice |
| Claude Code (pair) | Porting, tests, verification, docs | Contract, EVM verifiers, frontend chain layer, QA passes | Drafts for review |

## Scope cuts (running log)

**Cut at kickoff** (not portable to BOT Chain, or not needed to win):

- ~~Google sign-in, Sui zkLogin, Enoki sponsored gas~~ → MetaMask only (the hackathon requires a MetaMask connection anyway)
- ~~SUI / USDC settlement~~ → native BOT only
- ~~QR pay-a-request, the separate immediate-payment app (`app/`), `payproof::pay`~~ → escrow trade flow only
- ~~Email invitations~~ → copy-link invites bound to wallets
- ~~Demo supplier auto-ship (server hot wallet)~~ → the demo supplier only auto-confirms (decided 2026-09-20)

**Cut next, top first, if behind at a checkpoint:**

1. Supplier-initiated orders → buyer-initiated only
2. Trust profiles and public company pages → hidden from navigation
3. Organization switching → one workspace per wallet
4. Legal RAG arbitration package (Qdrant) → disabled (already fails soft)
5. Arbitrator UI → the contract keeps the arbitrator path; the README explains it
6. PO import from PDF (Gemini extraction) → manual line entry

**Never cut:** contract tests, the demo supplier's auto-confirm (it is the lone-judge path), backend verification of funding and settlement, the BOT Chain footer, the README Deployment section, real mainnet activity, the daily X cadence.
