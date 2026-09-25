# OpenLC Research Report

## Design and evaluation of milestone escrow with partial claims and grounded AI mediation for B2B orders on BOT Chain

*25 September 2026 | Contract `0xd35bbde52618F716597cb097Fab3E52D3605A7c6` on BOT Chain Mainnet (chain ID 677) | 19 external sources*

---

## 1. Executive summary

Small and medium businesses in Asia sell on credit because their buyers expect it, and they carry the risk alone. In 2025, 44% of the value of B2B credit sales in Asia was paid late and about 5% was never paid [1]. Coface found that 40% of Asia-Pacific companies now report ultra-long payment delays above 2% of turnover, of which about 80% are never recovered [3]. The instrument that removes this risk, a documentary letter of credit, is issued by banks that reject 41% of SME trade finance applications, and the global trade finance gap stands at US$2.5 trillion [4][5].

OpenLC applies the logic of a letter of credit without a bank in the middle. The buyer locks the full order value in a public escrow contract before the goods ship. The contract releases a deposit at funding, a dispatch payment when the supplier anchors dispatch evidence, and the delivery balance on acceptance. When part of a delivery is damaged or missing, a single transaction holds only the disputed amount and pays the undisputed remainder to the supplier. The disputed amount settles only when both parties sign the same split, or when the arbitrator named on the order decides it within limits the contract enforces. An AI mediator can propose a split, but every factual claim it makes must quote the evidence or the policy verbatim, the backend rejects any quote that does not match its source, and the AI holds no key.

The contract is deployed and source-verified on BOT Chain Mainnet. The first mainnet order, OLC-LAUNCH-001, exercised funding, the dispatch release, evidence anchoring, the partial claim, dual signatures and execution with real BOT. The contract suite has 41 passing tests and the API suite 143. The design costs a fixed amount of gas per step, independent of order value, where bank and escrow-service fees scale with the order or carry fixed minimums [6][7][8][9].

## 2. Problem statement

A B2B order between two companies that do not yet trust each other has four failure modes:

1. **The buyer never pays** after the supplier ships on credit terms.
2. **The supplier never ships** after the buyer pays in advance.
3. **Part of the delivery is wrong** and the whole invoice freezes while the parties argue.
4. **The dispute never ends** because there is no neutral, affordable process to settle it.

Credit terms push risk 1 onto the supplier. Prepayment pushes risk 2 onto the buyer. Letters of credit address both, but they are priced and administered for banks' existing clients, and they settle on document compliance rather than on the goods: a presentation is paid or refused on whether the documents match the credit, and 65% to 80% of first presentations are reported as discrepant [10]. None of the common instruments handles risk 3 well, because the payment is one indivisible obligation. Risk 4 is left to courts, arbitration or informal negotiation, which are slow and expensive relative to a typical SME order.

OpenLC's research question is whether a public smart contract, a verifying backend and a constrained AI mediator can cover all four failure modes for small orders, at a cost that does not scale with order value, without any party (including OpenLC) holding custody of the funds.

## 3. Market evidence

### 3.1 Late payment is the norm, not the exception

| Indicator | Figure | Source |
|---|---|---|
| Share of B2B sales made on credit, Asia | 54% | Atradius, Q2 2025 [2] |
| Value of B2B credit sales overdue, Asia | 44% | Atradius, Q2 2025 [1] |
| Bad debts as a share of B2B invoices, Asia | about 5% (Indonesia 8%, Hong Kong 7%) | Atradius, Q2 2025 [1][11] |
| Top reason for late payment | customer liquidity problems (51% of respondents) | Atradius, Q2 2025 [1] |
| Average payment delay, Asia-Pacific | 65 days in 2024 | Coface, Q1 2025 [3] |
| Companies with ultra-long delays above 2% of turnover | 40% in 2024, up from 23% in 2023 | Coface, Q1 2025 [3] |
| Share of ultra-long delays never paid | about 80% (Coface experience) | Coface, Q1 2025 [3] |
| Malaysian SME average payment delay | 64 days, Q1 2025 | Experian Malaysia [12] |

Coface reports that ultra-long delays were highest in China, India, Thailand and Malaysia [3]. For Malaysia, Experian's repayment data shows SMEs pay later than large corporations (64 against 58 days) and that hospitality and F&B SMEs saw delays rise to 73 days in Q3 2024 [12]. This is OpenLC's initial market: produce and F&B distributors selling to new buyers on 30 to 60 day terms.

### 3.2 The bank instrument does not reach SMEs

The Asian Development Bank's 2025 survey of more than 110 trade finance providers puts the global trade finance gap at US$2.5 trillion, unchanged since 2023 and about 10% of global trade [4][5]. SME rejection rates fell to 41%, close to the 40% for mid-cap and corporate clients for the first time, but ADB cautions that this may reflect "discouraged demand": SMEs that stop applying after earlier rejections [4]. Separate AfDB evidence cited by ADB found about 17% of SMEs in Kenya and Tanzania needed trade finance but did not apply, mainly because of collateral requirements, fear of rejection and unfamiliarity with the process [4].

### 3.3 What a letter of credit costs a small order

Published Singapore and regional bank tariffs show the fee structure a small importer faces:

| Charge | DBS (SG) [6] | UOB (SG) [7] | Mashreq (HK) [8] |
|---|---|---|---|
| Issuance | 1/8% per month, minimum 2 months, not less than S$80 | 1/8% per month, minimum 1/4% or S$75 | 0.25% on the first US$100,000 per six months, minimum US$150 |
| Discrepancy | US$80 per set | S$100 per set | US$80 per set |
| Other | acceptance, amendment and SWIFT charges | amendment S$75, non-SWIFT issuance S$100 | full-text SWIFT US$80, cancellation US$60 |

These tariffs are the applicant's side only. Advising, confirmation and negotiation fees fall on the beneficiary, and industry guides estimate an all-in cost of about 1.0% to 3.5% of the credit value per year for a mid-sized import, driven mostly by confirmation risk premiums (estimate, single source) [13]. For a US$2,000 order, the fixed minimums alone exceed several percent of the order value before a single discrepancy fee. The LC also needs the buyer to hold a banking facility, which is exactly what rejected SMEs lack.

### 3.4 Escrow services and their pricing

Commercial escrow services protect both sides but charge a percentage of the transaction. Escrow.com's published standard fee for US-dollar transactions is 2.6% (minimum US$50) up to US$5,000, 2.4% (minimum US$130) up to US$50,000 and 1.9% (minimum US$1,200) up to US$200,000 [9]. The service holds the funds itself, releases them in one step after the buyer approves, and resolves disagreements through its own process; there is no native notion of paying the undisputed part of a partially wrong delivery.

## 4. Existing approaches and why they fall short

| Approach | Protects the supplier | Protects the buyer | Partial claims | Cost profile | Custody |
|---|---|---|---|---|---|
| Open account credit | No | Yes | Informal | Free, but 44% paid late [1] | Buyer |
| Prepayment | Yes | No | Informal | Free | Supplier |
| Letter of credit | Yes, on compliant documents | Yes, on compliant documents | No, documents pass or fail | Percentage plus fixed minimums [6][7][8] | Banks |
| Trade credit insurance and factoring | Partly, after underwriting | No | No | Premiums or discounts, needs credit history | Insurer or factor |
| Online escrow service | Yes | Yes | No, one release | 0.9% to 2.6% with minimums [9] | The escrow company |
| Bank blockchain consortia | Yes, for member banks' clients | Yes | Not a focus | Membership, bank pricing | Banks |
| **OpenLC** | **Yes, funds locked before shipping** | **Yes, released on proof** | **Yes, in one transaction** | **Fixed gas per step, no platform fee** | **None: a public contract** |

The most ambitious previous attempt to digitise trade finance was a set of bank-owned blockchain networks, and nearly all of them closed:

| Network | Built by | Outcome |
|---|---|---|
| we.trade | Joint venture of 12 European banks, IBM stake | Ran out of cash and discontinued in June 2022 [14] |
| Marco Polo | More than 30 member banks, on R3 Corda | Provisional liquidators appointed in February 2023, €5.2 million of debts [15] |
| Contour | Nine banks including HSBC, Citi, Standard Chartered | Shut down on 30 November 2023 after bank shareholders declined to refund it [16] |

The public reporting points to a common cause: consortium governance and dependency on shareholder banks' continued funding, not a failure of the underlying idea [14][15][16]. Contour's CEO said the company's "unwieldy ownership structure" deterred venture investors [16]. These networks digitised the existing bank instruments for existing bank clients. OpenLC takes the opposite position: a permissionless contract that any two wallets can use, with no consortium to fund and no bank relationship required.

## 5. Dispute resolution evidence

### 5.1 Online dispute resolution works at scale when it is built into the transaction

eBay and PayPal's resolution centre handled more than 60 million disputes a year, with about 90% resolved without a third party deciding [17]. The design lesson is that resolution sits inside the transaction flow, next to the money, rather than being an external service the parties must go and find.

The European Union's standalone ODR platform is the counterexample. Between two and three million people visited it each year, but only about 200 cases a year reached an ADR body, and the EU repealed its regulation and closed the platform on 20 July 2025 [18]. A dispute portal disconnected from where the money sits did not produce resolutions.

OpenLC follows the embedded model: the claim is opened from the order, the disputed amount is already held in the escrow, and the settlement is executed by the same contract that holds it.

### 5.2 Language models in legal settings must be grounded and checked

Large language models invent legal content. Stanford researchers found general-purpose models hallucinate on legal queries between 58% and 82% of the time, and that even specialised retrieval-augmented legal research tools from LexisNexis and Thomson Reuters hallucinated in 17% to 33% of responses [19]. The same study records lawyers sanctioned for filing briefs that cited non-existent cases [19]. Retrieval alone is not enough; outputs must be verified against their sources.

OpenLC therefore treats the model as an untrusted drafter:

- The model is given the dispute record, the parties' agreement and the numbered clauses of the Dispute Resolution Policy, and must return structured JSON whose clause and evidence identifiers are restricted to enumerated values.
- Every statement of fact must carry a verbatim quote. The backend normalises whitespace and checks that each quote is a substring of the cited evidence item or clause. Any non-matching quote rejects the whole output.
- The proposed split must conserve the disputed amount exactly in wei and may not refund more than the buyer requested.
- The model may abstain, and must give a reason when it does.
- The output is a proposal. It moves no money until both parties sign identical amounts on chain.

This does not make the model's judgement correct. It makes every claim checkable, removes invented facts and clauses by construction, and keeps a human signature between the model and the money.

## 6. Research questions and objectives

| ID | Question | How OpenLC answers it |
|---|---|---|
| RQ1 | Can payment be secured before dispatch without a bank or custodian? | Buyer funds a public escrow with no owner or admin; the contract, not OpenLC, holds the BOT. |
| RQ2 | Can release follow proof rather than documents or trust? | Milestones release on the supplier's anchored dispatch evidence and the buyer's acceptance; evidence fingerprints are on chain. |
| RQ3 | Can a partially wrong delivery avoid freezing the whole order? | `openDispute` holds only the disputed amount and pays the undisputed remainder in the same transaction. |
| RQ4 | Can a dispute settle without trusting a single party? | Dual-signed settlement, with an arbitrator bounded by the contract; deadline exits for both sides. |
| RQ5 | Can an AI mediator help without being trusted? | Verbatim-quote verification, conservation checks, abstention, and no key. |
| RQ6 | Is the cost independent of order value? | Only gas, measured per step on mainnet; no platform fee. |

## 7. Requirements and threat model

### 7.1 Functional requirements

- The buyer locks the full order value in one transaction, and the agreed deposit pays the supplier in that same transaction.
- The supplier can release the dispatch milestone only by recording a dispatch evidence hash.
- The buyer can accept the delivery (releasing the rest) or open a claim on part of it.
- A claim holds exactly the disputed amount and pays out the rest at once.
- A split pays out only with matching approvals from buyer and supplier, or an arbitrator decision within limits.
- If the supplier never ships, the buyer can recover everything not yet released after the delivery deadline.
- If the buyer never acts after shipment, the supplier can claim the balance after the inspection window.
- No function lets anyone else move an escrow's funds.

### 7.2 Adversaries and failures considered

| Threat | Mitigation |
|---|---|
| A party lies to the API about a transaction | The API re-reads the transaction and escrow state from BOT Chain and pins it to the signing wallet (`tx.from`). |
| A lookalike contract emits matching events | Events are accepted only from the configured escrow address; tested per verifier. |
| A hostile payout recipient blocks settlement | Payouts are gas-capped pushes with a pull-based `withdraw()` fallback; a malicious receiver is in the test suite. |
| Reentrancy on fund-moving paths | `nonReentrant` on every fund-moving function; state updated before transfers; mutation-tested. |
| The buyer and supplier collude against the arbitrator, or vice versa | The arbitrator can only split the disputed amount within the buyer's requested refund; buyer, supplier and arbitrator must be three distinct addresses. |
| A user signs on the wrong network | Every transaction switches MetaMask to BOT Chain, re-reads the chain id and pins it; the send is refused if the network changes. |
| A misconfigured deployment sends value to a wrong address | The web app refuses chain actions without a known chain id and checks the escrow address has contract code before sending value. |
| The AI invents facts or clauses | Verbatim quote verification against the source text; rejected on mismatch. |
| Prompt injection inside evidence | The Dispute Policy (DP-5.7) treats evidence text as data; the model's output is schema-constrained and verified. |
| The API is down | Funds stay safe in the contract; deadline exits need only the contract. |

### 7.3 Threats not addressed

- The quality of the physical goods: evidence proves what was recorded and when, not what was inside a carton.
- A compromised party wallet.
- BOT price volatility during a long escrow.
- Legal enforceability of on-chain agreements in every jurisdiction.

## 8. Protocol design

### 8.1 State machine

```text
            createEscrow
                 |
                 v
     +-------- Open ---------+------------------+
     |           |           |                  |
 markShipped  releaseFull  refundUnshipped  claimUninspected
 (stays Open)    |        (after deadline)  (after inspection window)
     |           v           v                  v
     |        Settled     Settled            Settled
     |
 openDispute
     |
     v
  Disputed --approveSettlement (buyer + supplier, or arbitrator)--> executeSettlement --> Settled
```

Settlement modes are recorded on chain: `BuyerConfirmation`, `MutualApproval`, `Arbitrator`, `RefundUnshipped` and `ClaimUninspected`.

### 8.2 Money conservation

For every escrow, at every step:

```text
totalAmount = releasedAmount + balance + settledBuyerRefund
```

The deposit, dispatch and delivery amounts must sum to the funded value exactly (`InvalidReleasePlan` otherwise). A dispute can only hold part of the remaining balance, and a settlement must split exactly the disputed amount. The test suite checks the invariant after every path.

### 8.3 Time

The delivery deadline is the end of the agreed delivery day and never less than 24 hours after funding. The inspection window (7 days) runs from the later of shipment and the delivery deadline, so a late shipment extends the buyer's time to inspect. Deadline boundaries are tested to the second.

## 9. System architecture

### 9.1 Layers

| Layer | Responsibility |
|---|---|
| `OpenLCEscrow.sol` | Holds funds, enforces the state machine, conservation, roles and deadlines. No owner, admin, upgrade path or fee. |
| API (Hono, Node 22) | Orders, invitations, evidence storage, disputes and mediation. Re-verifies every chain step. Never signs a transaction. |
| Database (Supabase Postgres) | Order and dispute records with row-level security; private bucket for evidence files. |
| Web app (Next.js 16) | Wallet sign-in, order flows, exact money maths, chain reads for the order page. |
| AI (Gemini) | Advocates and a neutral mediator; purchase order extraction and evidence transcription. |

### 9.2 Chain-then-record

Every money movement is a wallet transaction first and a database record second. After confirmation, the browser stores the receipt and posts it to the API, which verifies it on chain before recording the step. If the API call fails, a retry re-posts the stored receipt without asking for a second signature, and a claim can recover its transaction from on-chain logs. This removes the failure where a signed step is stranded because the second half failed.

### 9.3 Identity

Sign-in is an EIP-191 signature over a readable message naming the site origin and the chain. Challenges are single-use and short-lived; sessions expire after 12 hours. Invitations are copy-paste links bound to the wallet that accepts them, and the supplier's payout address always comes from its authenticated session, never from a form field.

## 10. AI mediation design

The pipeline for one run:

1. Build a case from the order, the inspection, both parties' statements, evidence transcripts, the agreement terms and the numbered policy clauses. Raw files are never sent; images and PDFs are transcribed to text first.
2. A buyer advocate and a supplier advocate each produce a structured analysis and a recommended split, with verbatim quotes for every factual and legal basis.
3. If they disagree, each receives the other's analysis and responds once.
4. A neutral mediator produces a proposal or abstains, again with verbatim quotes.
5. The backend validates every quote and the allocation. A failure rejects the output.

Limits: at most 8 model calls and a 90-second budget per run, with an ordered fallback list of models. A model outage, a rate limit or a cut-off answer returns "busy, try again" rather than a partial analysis. The proposal then enters the same negotiation flow as a human proposal, and nothing is paid until both parties sign.

## 11. Evaluation

### 11.1 Automated tests

| Suite | Result | Coverage |
|---|---|---|
| Contract (Hardhat) | 41 passing | Milestone release plans, partial claims, dual and arbitrator settlement, arbitration limits, deadline boundaries, terminal states, a hostile receiver, reentrancy and conservation invariants. Removing the reentrancy guard, or the inspection-window rule, makes a named test fail. |
| API (Vitest) | 143 passing | Each chain verifier against wrong contracts and wrong signers, invite binding and single use, party distinctness, the dispute state machine, mediation quote verification, allocation conservation and outage handling. |
| Web | Assertion checks | Exact BOT parsing and display, wei-exact claim splits, and the deadline actions the contract would accept. |

### 11.2 Mainnet evidence

The first mainnet order, OLC-LAUNCH-001 (escrow #1), was run between two of the team's own wallets through the production site:

| Step | Transaction | Gas (BOT, 20 gwei) |
|---|---|---|
| Deploy contract | [`0x0f80fbd0`](https://scan.botchain.ai/tx/0x0f80fbd027c4fa8e48921f649afe42649ce944f71c7f903d9e76e2fa8857f7a7) | 0.0308 |
| Fund 0.005 BOT, deposit 0.0005 paid | [`0xc7fa38a1`](https://scan.botchain.ai/tx/0xc7fa38a1e989b272612ea609502e10fabe652cbab0e156028d6beadacc1f9e65) | 0.0067 |
| Ship, dispatch 0.001 paid | [`0x1b3d40c8`](https://scan.botchain.ai/tx/0x1b3d40c8894ad1b5ae51f81d810c7fbe0ec17217714d986ce0637c2f6e29cdee) | 0.0021 |
| Anchor damage photo | [`0xdb664805`](https://scan.botchain.ai/tx/0xdb6648058342f49fc45d860e11d9baa37870192fdcf409fb49d37983fbda1799) | 0.0006 |
| Partial claim: 0.001 held, 0.0025 paid | [`0xc745bfad`](https://scan.botchain.ai/tx/0xc745bfad13f06f90b18d5b8e46c3eed66389f9bd020f27c7ca22f607ef418699) | 0.0021 |
| Buyer approval | [`0x55011ab0`](https://scan.botchain.ai/tx/0x55011ab077c7fadd3088331c81f28465ab822bd9c919753ac96b2085f80a5938) | 0.0018 |
| Supplier approval | [`0x7ac48be1`](https://scan.botchain.ai/tx/0x7ac48be1116c30808f71748e43300b5f2ceff70d9010e7ff4ed498374633bb7f) | 0.0010 |
| Execute settlement, 0.001 refunded | [`0x5584e249`](https://scan.botchain.ai/tx/0x5584e24933f4d613980589f42ea2d9a3ed9a01a0893bd9e7f5b5ba05e15599fa) | 0.0017 |

Final state: the supplier received 0.004 BOT, the buyer 0.001 BOT, the escrow balance is zero, and the API recorded every step as verified on chain.

A second mainnet order, OLC-LAUNCH-002 (escrow #2, 0.001 BOT at 10/20/70), then ran the full-payment path, starting from a PDF purchase order read by the AI importer:

| Step | Transaction | Gas (BOT, 20 gwei) |
|---|---|---|
| Fund 0.001 BOT, deposit 0.0001 paid | [`0x1e457393`](https://scan.botchain.ai/tx/0x1e4573934e3e9277ccfdc1109b5246c2a7a9dc4fc578784ae0a771c42e73dc2b) | 0.0064 |
| Ship, dispatch 0.0002 paid | [`0x3d4b5968`](https://scan.botchain.ai/tx/0x3d4b596827dc43216af8a49d85290f91f4958ef1e3e6e28c3ffba7cf4868eafe) | 0.0021 |
| Accept in full, 0.0007 paid, mode BuyerConfirmation | [`0xe2a27526`](https://scan.botchain.ai/tx/0xe2a27526580b03e1ae8c191c3ad9a5d0cbb2a5724ab6f56f62e1c1a874c2ff7c) | 0.0016 |

The supplier received the whole 0.001 BOT and the escrow balance is zero. The same source had earlier completed a full-payment order, a partial claim with mutual settlement and a deadline reclaim on BOT Chain Testnet.

### 11.3 Cost

A happy-path order (fund, ship, accept) cost 0.0101 BOT of gas at 20 gwei on mainnet (OLC-LAUNCH-002), and a partial-claim order about 0.016 BOT across both parties (OLC-LAUNCH-001), whatever the order value, because gas depends on computation, not on the amount moved. OpenLC charges no platform fee. By comparison, bank letters of credit and escrow services charge a percentage of the order plus fixed minimums [6][7][8][9], so for small orders the fixed minimums dominate.

### 11.4 Findings from the first mainnet order

Running a real order with sub-cent amounts exposed three defects that no test had covered, all fixed before launch:

1. Money was displayed with two decimals, so 0.001 BOT showed as 0. The display now truncates to six decimals and marks dust.
2. The split form rounded amounts to cents, so a 0.0005 / 0.0005 split of a 0.001 claim was rejected as unbalanced. Splits are now computed in wei, and settlement signing uses the recorded unit strings.
3. The mediator's output was cut off by an output-token cap that the model's internal reasoning consumed. The cap was raised, a cut-off answer now falls back to the next model, and the user sees an honest "busy" message.

The lesson for the method: tests written with round amounts missed an entire class of bugs that a real, small order found immediately.

## 12. Limitations

- The contract is tested and source-verified but not independently audited.
- One platform arbitrator (OpenLC's wallet) is appointed for every order; nominating another arbitrator is not yet available.
- Settlement is in native BOT only, so both parties carry BOT price risk while funds are escrowed.
- AI mediation depends on the model provider's capacity; the product degrades to human negotiation and arbitration when it is unavailable.
- Legal authority retrieval (statutes and case law for the arbitration package) is disabled in production.
- Evidence proves what was recorded and when, not the physical condition of goods.
- The market figures in sections 3 and 4 come from surveys and published tariffs, not from OpenLC usage data.

## 13. Future work

- Stable-value settlement assets, to remove price risk during long escrows.
- Party-nominated arbitrators and an arbitrator marketplace.
- Carrier and logistics integrations that anchor dispatch and delivery evidence automatically.
- Verified trust profiles that let suppliers show a history of settled orders without revealing values or counterparties.
- A sustainable fee on settled value, charged only when an order settles; the current contract charges none.

## 14. Reproducibility

- Contract, tests and deploy scripts: [`contracts/`](contracts/), [`test/`](test/), [`scripts/`](scripts/); `npm test`.
- API and its tests: [`backend/`](backend/); `cd backend && npm test`.
- Web app and money checks: [`web/`](web/).
- Deployment records: [`deployments/`](deployments/).
- Policy the mediator quotes: [`docs/dispute-policy.md`](docs/dispute-policy.md).
- Every mainnet transaction above is public on [scan.botchain.ai](https://scan.botchain.ai/address/0xd35bbde52618F716597cb097Fab3E52D3605A7c6).

## Sources

1. [B2B payment practices trends Asia 2025](https://atradiuscollections.com/global/knowledge-and-research/reports/b2b-payment-practices-trends-asia-2025), Atradius Collections, 2 July 2025. 44% of B2B credit sales overdue, bad debts about 5%, top causes of late payment.
2. [Asian firms split on insolvency outlook as trade headwinds continue](https://atradiuscollections.com/global/knowledge-and-research/news/asian-firms-split-on-insolvency-outlook-as-trade-headwinds-continue), Atradius Collections, 9 July 2025. 54% of B2B sales on credit.
3. [Asia Payment Survey 2025](https://www.coface.com/news-economy-and-insights/asia-payment-survey-2025-companies-expect-payment-behaviors-to-worsen-amid-economic-uncertainty), Coface, 11 June 2025. 65-day average delay, 40% with ultra-long delays, about 80% never paid.
4. [ADB Global Trade Finance Gap Survey (ADB Brief 378)](https://www.adb.org/sites/default/files/publication/1109006/adb-brief-378-adb-global-trade-finance-gap-survey.pdf), Asian Development Bank, December 2025. US$2.5 trillion gap, 41% SME rejection, discouraged demand.
5. [Demand for trade finance to rise amid supply chain realignment](https://www.adb.org/news/demand-trade-finance-rise-amid-supply-chain-realignment-adb-report), Asian Development Bank, 15 January 2026. Gap about 10% of global trade.
6. [DBS trade finance service fees](https://www.dbs.com.sg/sme/trade/trade-finance-service-fees), DBS Bank, accessed 25 September 2026. LC issuance and discrepancy fees.
7. [UOB trade finance services fees](https://www.uob.com.sg/business/help-support/rates-fees/trade-finance-services.page), UOB, accessed 25 September 2026. LC issuance, amendment and discrepancy fees.
8. [Mashreq Hong Kong schedule of charges](https://www.mashreq.com/-/jssmedia/pdfs/hong-kong/HK-SOC-01-04-2025-en.ashx), Mashreq, 1 April 2025. LC issuance minimums, SWIFT and discrepancy charges.
9. [Escrow.com fees and calculator](https://www.escrow.com/fee-calculator), Escrow.com, accessed 25 September 2026. Tiered percentage fees with minimums.
10. [Discrepancy rates under UCP 600](https://www.doccredit.world/discrepancy-rates-under-ucp-600/), DocCredit World, 18 December 2024. 65% to 80% of first presentations discrepant (industry estimate).
11. [B2B payment practices trends Indonesia 2025](https://atradiuscollections.com/dam/jcr:a5138c1e-7aa7-48b4-82d7-64a3d938d31d/payment-practices-barometer-asia-2025-indonesia-en.pdf) and [Hong Kong 2025](https://atradius.com.hk/dam/jcr:f9585c1f-dc4c-4cba-887c-ae48a739d52d/payment-practices-barometer-asia-2025-hong-kong-en.pdf), Atradius, 2025. Market bad-debt rates.
12. [Malaysia State of Credit 2025](https://www.experian.com/content/dam/noindex/emea/malaysia/Experian-State-of-Credit-2025-Report.pdf), Experian, 2025. SME and sector payment delays in Malaysia.
13. [Letter of credit cost breakdown](https://ssltglobal.com/guides/lc-cost-breakdown), SSLT Global, accessed 25 September 2026. All-in LC cost estimate (industry guide, single source).
14. [we.trade calls it quits after running out of cash](https://www.gtreview.com/news/top-stories/we-trade-calls-it-quits-after-running-out-of-cash/), Global Trade Review, 6 June 2022.
15. [Marco Polo brings in liquidators as funds run dry](https://www.gtreview.com/news/top-stories/marco-polo-brings-in-liquidators-as-funds-run-dry/), Global Trade Review, 23 February 2023; [The Irish Times](https://www.irishtimes.com/business/2023/02/22/provisional-liquidators-appointed-to-software-company-with-52m-debts/), 22 February 2023.
16. [Contour to shut down as bank shareholders pull funding](https://www.gtreview.com/news/top-stories/exclusive-contour-to-shut-down-as-bank-shareholders-pull-funding/), Global Trade Review, 27 October 2023; [ICC Digital Library](https://library.iccwbo.org/content/tfb/news/dcwn_31October2023113133.htm), 31 October 2023.
17. [Quantifying the economic benefits of effective redress](https://research.ualr.edu/cgi/viewcontent.cgi?article=1005&context=bowen_lawreview), Colin Rule, UALR Law Review; [eBay Resolution Center](https://mediate.com/ebay-resolution-center-up-for-dutch-innovating-justice-awards-needs-your-vote/), Mediate.com, 8 June 2011. More than 60 million disputes a year, over 90% without a third-party decision.
18. [Regulation (EU) 2024/3228](https://eur-lex.europa.eu/eli/reg/2024/3228/oj), European Parliament and Council, 19 December 2024. EU ODR platform discontinued on 20 July 2025; about 200 cases a year reached an ADR body.
19. [Hallucination-Free? Assessing the Reliability of Leading AI Legal Research Tools](https://doi.org/10.1111/jels.12413), Magesh, Surani, Dahl, Suzgun, Manning and Ho, Journal of Empirical Legal Studies, 2025 ([preprint, May 2024](https://arxiv.org/abs/2405.20362)). Legal AI tools hallucinate in 17% to 33% of responses; general models 58% to 82%.

## Methodology

Market and prior-art research used 9 web searches through Exa and read the primary sources listed above; figures were taken from the publishers' own pages or reports where available, and the survey period of each figure is given. Two claims rest on a single industry source and are marked as estimates: the all-in LC cost range [13] and the first-presentation discrepancy rate [10]. Technical claims about OpenLC come from the repository's source code, its test suites and the public BOT Chain Mainnet transactions listed in section 11.2, each of which can be checked on the explorer. Sub-questions: the scale of late payment and the trade finance gap in Asia; the cost and mechanics of letters of credit; alternatives, including bank blockchain networks and why they closed; and online dispute resolution and AI reliability in legal settings. Gaps: no Malaysia-specific trade finance rejection rate was found, and no public data on SME use of online escrow services in Southeast Asia.
