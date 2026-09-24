# PITCH.md: OpenLC @ Build Week Hackathon Vol.2 (BOT Chain)

<!-- Filled in by /pitch-timebox on 2026-09-24. Two recorded videos, one speaker. Keep this open while recording.
     Every UI label in the demo is the app's exact text (checked against web/ on 2026-09-24). -->

**Speaker:** Chan Hao Wen (solo)
**Video 1:** "Who we are": 1:00, about 130 spoken words, all verbatim.
**Video 2:** "OpenLC: presentation and demo": target 9:00 (limit 10:00). About 1,100 spoken words at 140 wpm, minus
10% for MetaMask pop-ups and page loads. It is recorded, not live, so cut the waiting in the edit (confirmations
take 5-10 s; AI mediation about 30-60 s).
**Where to record:** https://openlc.vercel.app only. The live API only accepts that site, so sign-in fails on localhost.

Rubric weights and where each is earned: contract deployed and working (35): the "On BOT Chain" panel and explorer
links in both scenarios, plus the proof beat at 8:15. Anyone can connect a wallet and the main action works (30):
Scenarios A and B, step by step. Use-case clarity and originality (20): the landing walkthrough and the partial claim.
X post (15): the captions at the end of this file.

---

## Video 1: Who we are (1:00)

Setting: talking head, or voice over the Agent Escrow site, then the OpenLC landing.

| Start-End | Section | Words | Script (verbatim) |
|---|---|---|---|
| 0:00-0:15 | Who | ~35 | "Hi, I'm Chan Hao Wen. In the last Build Week I built Agent Escrow, escrow on BOT Chain for AI agents. A requester locks BOT, the agent delivers, and the contract pays on proof. It won Vol.1." |
| 0:15-0:35 | Why | ~50 | "Building it taught me that escrow isn't about the happy path. It's about who gets the money back when something goes wrong. And the people who need that most aren't agents. They're small suppliers shipping goods on sixty-day credit, hoping to get paid." |
| 0:35-0:52 | What | ~40 | "So I took my escrow prototype and rebuilt it for people, for B2B trade. OpenLC, the open letter of credit. The buyer's payment is locked before the goods ship and released on proof." |
| 0:52-1:00 | Close | ~15 | "Contract, API and app: I built it on BOT Chain. Let me show you." |

Total about 140 words. If a run goes over 1:05, cut "It won Vol.1." first, then "hoping to get paid."
Facts behind it: Agent Escrow is live on BOT Chain mainnet (`0x9DC2e2cB2850680EC74Fd3A4c006B0982972F62B`) and won
Vol.1. OpenLC rebuilds the team's own PayProof prototype (Sui) for BOT Chain; the README's Origin section has the
details.

---

## Video 2: Presentation and demo (target 9:00)

### Before you press record (setup checklist)

- [ ] Two browser profiles. **Profile A = buyer** (the wallet with about 12 BOT). **Profile B = supplier** (a second
  MetaMask account with about 0.1 test BOT for gas; faucet https://faucet.botchain.ai/basic). Each profile keeps its
  own sign-in, so you never switch accounts on camera.
- [ ] Sign in once in each profile, then set the company names (account menu → "Edit company name"):
  A = **Choong Trading Sdn. Bhd.**, B = **FreshSource Foods Sdn. Bhd.** The order shows the supplier workspace's own
  name after acceptance.
- [ ] Have `docs/demo/OLC-DEMO-0905-purchase-order.pdf` (3.00 BOT), `supplier-dispatch.png`, `DO-FS-0905.pdf` and
  `receiving-damage.png` ready in a folder.
- [ ] **Prepare Scenario B's order off camera** up to "Inspection due" (create, accept, fund, ship, record delivery),
  so the video doesn't repeat Scenario A's steps. Use the same PO, with the reference changed to **OLC-DEMO-0906** and
  the release plan set to **10% / 20% / 70%**.
- [ ] **"Import from file" is NOT configured on the live site yet** (checked 2026-09-24: `/api/extract-po` returns
  503 "Document reading is not configured"). To show it, set two env vars on the **Vercel** web project, then redeploy:
  `GEMINI_API_KEY` (the same key as Render) and `GEMINI_MODEL=gemini-3.5-flash`. It must be a single model: this route
  takes no fallback list, and its default model was unavailable all evening. Test it once off camera. Otherwise, type
  the three lines by hand in step 1 of Scenario A.
- [ ] MetaMask on BOT Chain Testnet in both profiles. Notifications off, one tab per profile, zoom at 100%.
- [ ] Never click the "Skip to …" buttons on an order page: they only fake a state in your browser.
- [ ] The other party's page doesn't auto-refresh. **Reload** (F5) whenever you switch profiles.

### Timing table

| Start-End | Screen | Section | Words | Script (verbatim open and close; bullets elsewhere) |
|---|---|---|---|---|
| 0:00-0:25 | Landing hero (let the tunnel animate) | Hook | ~60 | VERBATIM: "Across Asia, almost half of all B2B sales on credit are paid late. The supplier ships, then waits sixty days and hopes. The fix used to be a bank letter of credit, and banks turn down four in ten small businesses who ask. This is OpenLC, the open letter of credit on BOT Chain: locked before it ships, released on proof." |
| 0:25-1:15 | Scroll into "Sixty days of credit, or paid on proof." and let the light travel | Problem vs solution | ~110 | Bullets: the same 3 BOT sale, two ways. Left: on credit the goods ship and the supplier is now lending to a stranger; Day 30 the invoice is ageing; Day 60 payment is due; after that 44% paid late, 5% never (Atradius 2025). Right: real order PO-90758439 on testnet. Day 0 the buyer locks 3 BOT before anything ships, and 0.3 deposit pays in the same transaction. Day 1 dispatch photo, fingerprint on chain, 0.6 releases. Day 3 buyer accepts, 2.1 releases, "paid in full on Day 3". Hover a hash link: "every one of these is a real transaction." |
| 1:15-1:50 | "When part of it goes wrong, only that part waits." (let the bar split) | The mechanism | ~75 | Bullets: the thing a bank LC can't do. PO-97139111, 1 BOT, 0.7 still held; one damaged carton, so the buyer claimed 0.15. **One transaction** held the 0.15 and paid the supplier the undisputed 0.55. Both signed the split, 0.15 refunded. If they're stuck, an AI mediator drafts a split quoting the policy and evidence word for word, and it cannot move money. |
| 1:50-2:15 | "Try it in four steps", then "What stays true" | Judge path + trust | ~60 | Bullets: judges can do all of this with ONE wallet: sign in, faucet, tick "Use the OpenLC demo supplier", lock BOT (it confirms instantly and never ships, so you can reclaim everything after the delivery date). What stays true: no owner, admin, upgrade path or fee; the API re-verifies every step on chain; the AI can't move money; both parties sign. "Now let me run two real orders." |
| 2:15-2:30 | Profile A: header "Sign in" | Sign in | ~30 | Click **Sign in** → MetaMask shows a readable "Sign in to OpenLC" message, no transaction, no fee → **Sign**. "Your wallet is your account. One signature, and I'm in the workspace." Point at the four money tiles. |
| 2:30-5:15 | Profiles A and B | **Scenario A: everything goes right** | ~330 | See Scenario A below. fallback: re-record this segment only; each step is independent. |
| 5:15-8:15 | Profiles A and B | **Scenario B: damaged goods** | ~350 | See Scenario B below. fallback: if mediation says "busy", wait a minute and click again, and cut the wait in the edit. |
| 8:15-8:45 | Order page "On BOT Chain" panel → explorer tab | Proof | ~60 | Bullets: open "View on BOT Chain Testnet Explorer" on each order's settlement: the contract, the SettlementExecuted event, the amounts. "Nothing you saw was simulated. The contract has no owner and no admin key, the source is verified, and every step you watched is on BOT Chain." |
| 8:45-9:00 | Landing close ("Lock the payment. Ship on proof.") | Close | ~35 | VERBATIM: "Suppliers get paid on proof instead of lending to strangers. Buyers only pay for what arrives. And when something goes wrong, only that part waits. OpenLC, the open letter of credit, built on BOT Chain." |

### Scenario A: everything goes right (2:30-5:15)

Narrate the "who does what" first: "Choong Trading is buying from FreshSource Foods. Left window is the buyer, right
window is the supplier."

1. **A: "New order".** In the "New purchase order" dialog: "Choong Trading Sdn. Bhd. is buying". Click
   **Import from file** and drop `OLC-DEMO-0905-purchase-order.pdf`. Say: "the PO reader fills in the lines." Check the
   lines (3.00 BOT). No import configured? Type them by hand instead: "Fresh strawberries, 8 x 250 g punnets" 10
   cartons at 0.12; "Fresh blueberries, 12 x 125 g punnets" 6 cartons at 0.15; "Premium Hass avocados, 4 kg" 6 crates
   at 0.15; delivery 1 Oct 2026, "Receiving Bay 2, Shah Alam Distribution Centre". Supplier: leave the demo-supplier box **unticked**, type "FreshSource Foods Sdn. Bhd." and any
   contact email. Click **Set release plan**.
2. **A: "Payment allocation".** Set **10% deposit, 20% dispatch, 70% delivery**. Say: "70% stays protected until I
   accept the delivery." Tick "I accept these terms…", then **Send for supplier confirmation**. On the success
   screen, **Copy link** (it's only shown once).
3. **B: paste the link** and sign in (**Sign in with MetaMask** → **Sign**). The order shows "Review and confirm the
   order". Tick "I have reviewed every line…" and "I accept these terms…", then **Confirm and accept terms**. Say:
   "the supplier's wallet is now bound as the payout address. Nobody types an address."
4. **A: reload** → "Fund escrow". Click **Fund escrow**. The dialog reads "Fund 3 BOT into escrow". Tick, then
   **Sign and fund escrow** → MetaMask transaction → confirm. Say: "3 BOT locked, and the 0.3 deposit paid in the same
   transaction." Scroll to **On BOT Chain**: Status Open, Amount locked 3 BOT, Released to supplier 0.3, Still held
   2.7. "This panel reads the contract directly, not our database."
5. **B: reload** → "Ship the goods". Carrier **DHL Express**, Tracking **DHL-OLC-0905-MY**, attach
   `supplier-dispatch.png` → **Mark as shipped** → **Sign and mark as shipped** → MetaMask. Say: "the photo's
   fingerprint goes on chain and the 0.6 dispatch payment releases."
6. **A: reload** → "Confirm the goods arrived" → **The goods have arrived** → Delivery order number **DO-FS-0905** →
   **Record delivery** (don't attach a file here, to avoid an extra pop-up). Nothing moves; inspection starts.
7. **A: "Check the delivery"** → **Yes, everything intact** → **Accept delivery and release …** → **Release
   payment** → MetaMask. Say: "the remaining 2.1 BOT goes to the supplier." The pill reads **Settled**. Show the
   settlement record: "Delivery accepted in full" with **View on BOT Chain Testnet Explorer**.
   (The button quotes the full order value; the chain moves the remaining 2.1. Say the real number.)

Words for A: about 330, spread across the steps. Keep each step to one or two sentences.

### Scenario B: damaged goods (5:15-8:15)

Say: "Same buyer, same supplier, same 3 BOT purchase order. I've already run it up to delivery off camera, so we
start at inspection. This time two cartons of strawberries arrived crushed."

1. **A: order OLC-DEMO-0906, "Check the delivery".** Choose **Some items missing or damaged**. On the strawberries
   line, type **2** under **Damaged**. The summary shows "Held for claim" **0.24 BOT**. In "What was wrong", write:
   "Two cartons of strawberries arrived crushed and leaking; photographed at the receiving bay." Attach
   `receiving-damage.png`. Click **Open claim for 0.24 BOT** → **Open claim** → MetaMask (one more pop-up anchors the
   photo). Say the key line: "**One transaction holds only the 0.24 in dispute and pays the supplier everything else.**"
   Show On BOT Chain: Status **Disputed**, Disputed 0.24.
2. **B: reload** → the Claim panel on the right: **Dispute with evidence**. "Your statement": "All ten cartons were
   intact at dispatch, see the dispatch photo; damage happened in transit." → **Submit response**. The status reads
   "In negotiation, round 1 of 3".
3. **B (or A): Request AI mediation** (click it before anyone proposes a split). "Mediator is analysing…" Cut the
   wait in the edit. Say: "two AI advocates argue each side, and a neutral mediator drafts a split. Every quote is
   checked word for word against the policy and the evidence."
4. **Show the proposal card:** "AI mediator, *AI proposal, not binding*", Back to buyer / To supplier, Evidence.
   Open **View mediation report** for three seconds (Summary tab). Say: "it's a proposal, not a decision. It holds no
   key and signs nothing."
5. **B: Accept proposal.** **A: reload → Accept proposal.** (An AI proposal needs both.) The pill reads **Settlement
   ready**.
6. **A: Sign as buyer** → MetaMask. The line reads "Waiting for FreshSource Foods Sdn. Bhd. to sign."
7. **B: reload → Sign as supplier** → MetaMask → **Execute settlement** → MetaMask. (The second signer executes;
   the first signer's page doesn't refresh on its own.) The pill reads **Settled**.
8. Show On BOT Chain: "Settled, the parties agreed a settlement split", and the explorer link. Say: "the buyer paid
   for what arrived, the supplier got paid for what they delivered, and nobody waited sixty days."

If mediation returns "The AI mediator did not propose a split": say "when the evidence doesn't settle it, the
mediator says so instead of guessing", then use **Propose a split** (e.g. 0.12 BOT back to the buyer) → the other
party accepts → continue from step 6.

---

## Demo fallback

- It's a recording: re-record any failed segment, and cut the dead air in the edit.
- If the RPC or API stalls mid-transaction: wait, reload, and use the page's own recovery (a completed chain step
  is re-recorded without signing again). Never re-sign a step that already went through on chain.
- If Gemini is busy: wait a minute and click **Request AI mediation** again. Worst case, use **Propose a split**
  (see above).

## Q&A prep (judge questions, weakest criterion first)

| Likely question | One-line answer |
|---|---|
| "Is it on mainnet?" (Contract, 35) | Testnet contract `0x20C3…A5C5` is source-verified with real orders; the mainnet deploy is the next step and the README lists both addresses. |
| "Is any of that simulated?" (Contract, 35) | No. Each step is a real BOT Chain transaction, re-verified by the API before it counts; the explorer links are in the README. |
| "Can a judge try it alone?" (Main action, 30) | Yes: one wallet, tick "Use the OpenLC demo supplier", lock BOT, and reclaim it after the delivery date. |
| "What if the AI is wrong?" (Clarity, 20) | It only proposes. Money moves only when both parties sign the same split on chain, or the arbitrator decides. |
| "Isn't this just escrow?" (Originality, 20) | The partial claim is the difference: one transaction holds only the disputed part and pays the rest. A bank LC can't do that for a 3 BOT order. |
| "Who can take the money?" (Trust) | Nobody but the parties: no owner, no admin, no upgrade path; the arbitrator can only split the disputed amount within the requested refund. |
| "Is this Agent Escrow again?" (Originality) | No. It's a new contract and product for B2B orders, rebuilt from my own PayProof prototype; the README's Origin section lists what changed. |
| "Business model?" | A 0.5% fee on settled value, paid by the supplier, who gets paid on proof instead of in 60 days. The hackathon contract charges no fee. |

## Rehearsal checklist

- [ ] Video 1 read-through with a stopwatch: under 1:05.
- [ ] Video 2 dry run of Scenario A, off camera, on a throwaway order: both profiles, every label as written.
- [ ] Scenario B's order prepared up to "Inspection due" (reference OLC-DEMO-0906).
- [ ] Buyer wallet ≥ 6.5 BOT; supplier wallet ≥ 0.1 BOT.
- [ ] One test click of "Request AI mediation" on a throwaway claim within the hour before recording (Gemini capacity varies).
- [ ] Final cut of Video 2 under 10:00 (target 9:00); if over, trim the landing walkthrough first, never the demo.

## Post captions (X, from @OpenLCdev)

- **Video 1:** "I built Agent Escrow so AI agents get paid on proof. Then I rebuilt it for people. OpenLC, the open
  letter of credit: a supplier's payment is locked before the goods ship and released on proof. Built on
  @BOTChain_ai. openlc.vercel.app"
- **Video 2:** "OpenLC in 9 minutes: two real orders on @BOTChain_ai. One pays in full on proof. In the other, two
  cartons arrive crushed: one transaction holds only the disputed 0.24 BOT and pays the rest, an AI mediator drafts
  the split, and both sides sign it on chain. openlc.vercel.app"
- The launch post ("officially launched on BOT Chain Mainnet") comes after the mainnet deploy (task 20).
