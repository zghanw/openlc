# OpenLC Platform Terms of Service

**Version 1.3 · Effective 25 September 2026 · Governing law: Malaysia**

---

## Notice — read this first

OpenLC — the open letter of credit — is launched on **BOT Chain mainnet** (chain id 677).

- Amounts are **real BOT**. What you lock in an escrow is real money.
- The OpenLCEscrow contract, `0xd35bbde52618F716597cb097Fab3E52D3605A7c6`, is source-verified on the BOT Chain Explorer. It **has not had an independent security audit**.
- OpenLC charges no fee. Every transaction's network fee (gas) is paid in BOT by the wallet that signs it.
- Use amounts you can afford to lose. Clauses 10 and 11 apply in full.

---

## 1. What OpenLC is

**1.1** OpenLC is a coordination and record-keeping platform for business-to-business trade. It lets a buyer and a supplier agree the contents of a purchase order, lock payment in native BOT in the OpenLCEscrow smart contract on BOT Chain, record delivery, and resolve disputes over what should be released.

**1.2** OpenLC is **not a party to your trade**. The commercial agreement is between the buyer and the supplier. OpenLC does not sell, buy, inspect, ship, or warrant any goods.

**1.3** OpenLC is **not a bank, payment institution, escrow agent, or law firm**, and provides no legal advice. Any analysis produced by the platform, including AI-generated dispute analysis, is informational only.

**1.4** OpenLC does not take custody of your funds. Funds are held by the OpenLCEscrow smart contract, and can only be released to the buyer address and supplier address recorded when the escrow was created. See clause 5.

## 2. Accounts, identity, and organisations

**2.1** You sign in by connecting a wallet (MetaMask) and signing a one-time message. There is no password, email, or Google sign-in. Your wallet address is the identity OpenLC uses; OpenLC never holds your private key and never asks for your seed phrase.

**2.2** You are responsible for keeping control of your wallet secure. OpenLC uses your wallet address to bind invitations and permissions and has no way to recover access on your behalf.

**2.3** Accounts belong to an **organisation**. An organisation may hold a buying capability, a supplying capability, or both.

**2.4** The same organisation may not occupy both sides of a single purchase order. Roles are fixed per order, not per account.

**2.5** You must not create accounts to impersonate another business, or use a wallet address you do not control.

## 3. Purchase orders and invitations

**3.1** A buyer creates a purchase order specifying line items, quantities, unit prices, delivery date, and delivery location, and may optionally name the supplier's wallet address.

**3.2** OpenLC issues a confirmation link for the order, not an email. If the order names the supplier's wallet address, only that wallet may accept it. Otherwise, the first wallet to accept through the link becomes the supplier and its payout address, and no other wallet can take the order after that. Share the link only with your intended counterparty.

**3.3** Invitations expire **7 days** after issue. A buyer may replace an invitation at any time before it is accepted, which immediately invalidates the previous one, or cancel it outright.

**3.4** An order becomes binding between the parties when the supplier confirms it. Until then, either party may walk away and no funds are committed.

**3.5** The order as confirmed — its line items, quantities, prices, delivery terms, and any terms and conditions attached to it — is the **agreement between the parties** for the purposes of these Terms and the Dispute Policy.

**3.6** (Withdrawn in version 1.3.)

## 4. Your agreement with your counterparty

**4.1** You and your counterparty may attach your own terms and conditions to an order. Those terms govern your trade.

**4.2** The **OpenLC Dispute Resolution Policy** sets non-waivable procedural minimums for disputes handled on the platform. Where your terms conflict with those minimums, the Policy prevails to the extent of the conflict, and your terms continue to govern everything else. See Policy clause DP-1.3.

**4.3** OpenLC does not review, approve, or verify the terms you attach, and takes no position on their enforceability.

## 5. Escrow, funding, and settlement

**5.1** The buyer funds the OpenLCEscrow smart contract on BOT Chain, in native BOT. The escrow records the buyer address, the supplier address, the arbitrator address, the order reference, a hash of the agreed order contents, and the exact deposit, dispatch, and delivery allocations confirmed by both parties. The buyer, supplier, and arbitrator must be three different addresses, or the escrow cannot be created. The supplier address is always the wallet that accepted the order; it is never typed in.

**5.2** **OpenLC cannot move your funds.** The escrow releases value only through the release plan and settlement instructions confirmed by the parties:

- **(a)** the confirmed order deposit is paid to the supplier when the buyer funds the escrow;
- **(b)** the dispatch payment is paid when the supplier signs shipment with a 32-byte evidence fingerprint;
- **(c)** the buyer accepts delivery, or a contract deadline permits an unshipped refund or uninspected supplier claim;
- **(d)** the buyer and supplier approve an identical disputed allocation; or
- **(e)** the appointed arbitrator signs a disputed allocation, which the contract accepts without mutual approval.

**5.3** A deposit or dispatch payment is final once released and cannot be clawed back through OpenLC. A refund or dispute is limited to the balance still held in escrow. For a dispute, the buyer refund plus supplier release must equal the disputed balance exactly, and the buyer refund cannot exceed the amount originally requested.

**5.4** When a buyer opens a claim, the contract holds only the disputed amount and pays the undisputed remainder of the delivery balance to the supplier, in the same transaction.

**5.5** OpenLC appoints the arbitrator for every order — a platform arbitrator wallet, holding the signing key described in 5.2(e). This is a real power over the disputed amount, bounded by 5.3. Nominating your own arbitrator is not available yet.

**5.6** Settlement produces an immutable on-chain receipt recording the allocation, the order hash, and the hash of the settled proposal.

**5.7** A settlement transaction may be submitted by anyone once both parties have approved the same split on chain, or once the arbitrator has signed a decision; it need not be submitted by a party to the trade.

**5.8** A payout that the receiving address cannot accept is held in the OpenLCEscrow contract for that address to withdraw. It is not lost, and it does not block the rest of the order.

## 6. Disputes

**6.1** Disputes about what should be released from escrow are handled under the **OpenLC Dispute Resolution Policy**, which forms part of these Terms.

**6.2** OpenLC provides AI-assisted analysis that may propose a settlement. Any proposal is **non-binding**: it takes effect only if both parties accept it and sign that acceptance on chain. See clause 7.

**6.3** If the parties do not reach agreement within the periods set by the Policy, the case escalates to an arbitrator appointed by OpenLC for every order. Nominating your own arbitrator is not available yet.

**6.4** Nothing in these Terms or the Policy prevents you from pursuing any legal remedy available to you, or requires you to treat a platform outcome as a final determination of your legal rights.

## 7. AI-assisted analysis

**7.1** OpenLC uses automated analysis, powered by Google's Gemini models, to summarise each side's case and, where the evidence and the applicable terms support it, to propose an allocation of the disputed amount.

**7.2** Every factual statement in that analysis must quote the evidence a party submitted, and every rule applied must quote either your agreement or the Dispute Policy. The system rejects its own output when a quote cannot be verified against its source.

**7.3** The analysis may be wrong, incomplete, or may decline to propose anything. It is **not legal advice** and is not a determination of liability.

**7.4** No allocation proposed by the system moves any funds. Money moves only under clause 5.2, and only once both parties have signed their acceptance on chain, or the arbitrator has signed a decision.

**7.5** You must not attempt to manipulate the analysis, including by embedding instructions in evidence text, filenames, or documents. Content submitted as evidence is treated as untrusted data, and attempts to influence the system this way may result in suspension under clause 8.

**7.6** What is sent to the model: the claim, each party's written statements, the text transcript of an evidence file where one exists, the order terms, and the Dispute Policy's clauses. Evidence file contents themselves are not sent to the model; a file with no transcript is described to it only by its type, size, and fingerprint.

## 8. Acceptable use

**8.1** You must not use OpenLC for trades in goods that are illegal in the buyer's or supplier's jurisdiction, or with parties subject to applicable sanctions.

**8.2** You must not submit evidence you know to be falsified, altered, or not your own, or make claims you know to be untrue.

**8.3** You must not attempt to access another organisation's orders, evidence, or invitations.

**8.4** OpenLC may suspend access to an account or organisation that breaches this clause. Suspension does not alter the escrow: funds already locked remain subject to clause 5.

## 9. Data and records

**9.1** OpenLC stores your order contents, evidence statements, evidence file metadata, dispute history, and audit trail with OpenLC's hosting providers — Supabase, for the database and private file storage — in order to run the platform and to produce arbitration packages.

**9.2** Evidence fingerprints (SHA-256) and every escrow transaction, including order hashes and settlement receipts, are written to BOT Chain, which is public and permanent, and cannot be deleted. Commercial details — line items, prices, evidence, and the identities of the parties — are held off-chain, with OpenLC's hosting providers, and are visible only to the parties to that order and, on escalation, the arbitrator.

**9.3** Evidence files are retained for the life of the dispute record. Where files are processed by an automated document-reading service, they are sent for extraction only, are not used to train third-party models, and only the extracted text — not the original file — is sent to the AI mediation model described in clause 7.

**9.4** Personal data is handled in accordance with the Personal Data Protection Act 2010 (Malaysia).

## 10. Fees

**10.1** The contract charges no platform fee. Every transaction's network fee (gas) is paid in BOT by the wallet that signs it.

**10.2** Any future platform fee will be published before it takes effect and will never be deducted from an escrow balance without the express approval required by clause 5.2.

## 11. Liability

**11.1** On BOT Chain mainnet, amounts are real BOT, and the limits in this clause 11 apply in full. OpenLC accepts **no liability for any loss** arising from your use of the platform, except as set out in 11.5.

**11.2** OpenLC is not liable for the performance of your counterparty, the quality or conformity of goods, delivery outcomes, or the commercial merits of any dispute.

**11.3** OpenLC is not liable for the content or consequences of any AI-generated analysis, which is provided on the basis set out in clause 7.

**11.4** OpenLC is not liable for BOT Chain network conditions, including transaction failure, congestion, chain reorganisation, or loss of access to a wallet or signing key by a party.

**11.5** Nothing in this clause excludes liability that cannot be excluded under Malaysian law.

## 12. Suspension and termination

**12.1** You may stop using OpenLC at any time. Orders already funded remain governed by clause 5 until settled.

**12.2** OpenLC may withdraw the service, in whole or in part, on notice. Where it does, parties will be given a reasonable opportunity to settle open escrows first.

## 13. Governing law

**13.1** These Terms are governed by the laws of Malaysia, and the courts of Malaysia have jurisdiction over any dispute about the Terms themselves.

**13.2** Clause 13.1 governs your relationship with OpenLC. It does not determine the governing law of your trade with your counterparty, which is a matter for your own agreement.

## 14. Changes

**14.1** These Terms are versioned. The version and effective date appear at the top of this document.

**14.2** Material changes will be notified before they take effect. Orders already funded continue under the version in force when the escrow was created.

## 15. Contact

Questions about these Terms, the Dispute Policy, or a specific case should be raised through the workspace, which attaches the relevant order record automatically.

## Version history

- **1.3 — 25 September 2026.** OpenLC launched on BOT Chain mainnet (chain id 677). Replaced the opening notice with a mainnet notice: real BOT, a source-verified contract without an independent security audit, no fee, gas paid by the signing wallet. Withdrew clause 3.6 (the demo supplier). Removed pilot wording from clauses 5.5, 6.3, 10.1, 11.1 and 12.2 without changing their meaning.

---

*Related: [OpenLC Dispute Resolution Policy](./dispute-policy.md)*
