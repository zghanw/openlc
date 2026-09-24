# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary, for this build: hackathon judges** (Build Week Hackathon Vol.2, BOT Chain). A judge opens the live site with MetaMask and must understand what OpenLC is and complete the main action (connect, create an order, send the link to a second wallet playing the supplier, lock BOT in escrow on chain) within minutes. The committee judges it as a production product for real users, not a demo. Judging weights: contract working on BOT Chain 35, anyone can connect a wallet and the main action works 30, use-case clarity and originality 20, X post 15.
- **The real users: Southeast Asian SME suppliers and their buyers** doing repeat B2B orders on credit terms (the wedge: Malaysian produce and F&B distributors). The supplier wants to be paid on proof instead of lending to a stranger for 60 days; the buyer wants to pay without trusting the supplier blindly. They work order by order: confirm terms, fund, ship, inspect, accept or claim.

## Product Purpose

OpenLC, "the open letter of credit", is escrow for B2B orders on BOT Chain. The buyer's payment is locked before the goods ship, paid out in milestones (deposit, dispatch, delivery) as proof arrives, and when part of a delivery goes wrong only the disputed amount is held while everything else pays the supplier in the same transaction. Success: a supplier ships knowing the money exists and is committed; a buyer pays knowing it releases only on proof; a dispute over part of an order never freezes the rest.

## Positioning

"We replace credit terms and deposits with payment secured before dispatch and released on proof." What a neighbour could not truthfully copy: the partial-claim transaction (one transaction holds only the disputed value and pays the undisputed remainder to the supplier), dual-signed on-chain settlement of the split, and an AI mediator that proposes but can never move money. Urgency: across Asia 44% of B2B credit sales are paid late and about 5% never paid (Atradius Payment Practices Barometer, Asia 2025); bank trade finance turns down 41% of SME applications (ADB Global Trade Finance Gap Survey, Dec 2025).

## Operating Context

- A purchase order becomes an escrow when the buyer funds it with one MetaMask signature on BOT Chain mainnet (677; native BOT; gas about 0.001-0.007 BOT per action at 20 gwei, measured on the launch order).
- Parties: buyer, supplier, and a platform-appointed arbitrator; three distinct wallets. Sign-in is a one-time wallet signature; there is no email identity.
- The supplier confirms from its own wallet through a copy-paste link (optionally also emailed). If the supplier never ships, the buyer reclaims everything not yet released after the delivery deadline.
- Evidence (dispatch photos, delivery orders, damage photos) is hashed (SHA-256) and anchored on chain. Documents: purchase orders (can be imported from PDF), agreements, delivery orders.
- Disputes: claim part of a delivery, negotiate proposals (max three human rounds), ask the AI mediator (Gemini buyer advocate, supplier advocate, neutral mediator; every quote verified word for word against the policy and evidence), both accept, both sign the split on chain, either executes.
- Every chain step is re-verified by the API from BOT Chain before it is marked verified; the order page also reads the escrow straight from the contract.

## Capabilities and Constraints

- Signed-in surfaces: Overview (money position, what needs your action, what waits on others), Orders (list, create-order dialog, order detail with stepper, actions, documents, claim section, on-chain panel), Wallet (BOT balance, DEX link, withdraw of deferred payouts), Trust profile, legal documents (Terms of Service and Dispute Resolution Policy v1.3).
- Stack: Next.js 16 / React 19, hand-written CSS (globals.css plus app-shell CSS files, no Tailwind), `motion` for animation, lucide-react icons, radix-ui primitives, ethers 6 with MetaMask. Deployed on Vercel.
- The contract has no owner, admin, upgrade path or fee. The API never signs or holds funds.
- Vocabulary: order, purchase order, escrow, fund / lock, deposit, dispatch, delivery, milestone, claim, disputed amount, split, settle, reclaim, arbitrator, BOT, BOT Chain.
- Mandatory for the hackathon: BOT Chain name and logo in the site footer (or partners), linking to botchain.ai and the BOT Chain Explorer; the site must let a judge connect a wallet and act.
- Live: https://openlc.online; mainnet contract `0xd35bbde52618F716597cb097Fab3E52D3605A7c6` (source-verified). There is no demo supplier, sample data or testnet deployment: the product runs for real users only (the committee asked for a production-ready product).

## Brand Commitments

- Name: **OpenLC**, "the open letter of credit". Mark: a white molecule on a black squircle (web/public/favicon.png), used for the favicon, apple icon and every logo slot.
- Binding visual references given by the owner (2026-09-24): the landing page takes its colour and design style from a dark monochrome reference (black ground, silver-white type, glossy dark cards, flowing wave lines, pill badges) with smooth transition animations; the signed-in workspace takes its colour and design style from the owner's reference dashboard (near-black cool greys, one green accent for active and success states, collapsible left sidebar, sticky blurred header, metric tiles, staggered entry motion). Content must stay OpenLC's.
- Voice: plain English, short sentences, no hype words; say what moves money and when.

## Evidence on Hand

- Live mainnet activity to show: OLC-LAUNCH-001, our own first order with two of our own wallets (0.005 BOT at 10/20/70; the partial claim held 0.001 and paid the supplier 0.0025 in the same transaction; both signed the split; 0.001 refunded). Transaction hashes in the repo README and docs/hackathon-build/progress.md. Earlier testnet orders (PO-90758439, PO-97139111, escrow #3) are history on the testnet explorer.
- Contracts: mainnet `0xd35bbde52618F716597cb097Fab3E52D3605A7c6`, testnet `0x20C3b91B78D6F86b27C01e12692d2e56C0bcA5C5`, both source-verified; 41 contract tests; the API test suite.
- Demo documents: docs/demo (purchase order, agreement, delivery order, dispatch and damage photos).
- Absent, never to be fabricated: customers, testimonials, logos of partners other than BOT Chain, volumes, prices, fees, uptime or security audits.

## Product Principles

1. Money state first: every screen answers what is locked, what is released, and what needs you, before anything else.
2. The chain is the source of truth; show it, link it, never contradict it.
3. One next action per order, obvious enough for someone who has never used escrow.
4. Prove, don't claim: real transactions and the real flow over adjectives.
5. A new user must be able to finish the main action unaided: sign in, create an order, send the link, fund.

## Accessibility & Inclusion

WCAG 2.2 AA contrast on the dark grounds, visible focus, keyboard-operable actions and dialogs, `prefers-reduced-motion` honoured for every animation (the app already wraps motion in `MotionConfig reducedMotion="user"`).
