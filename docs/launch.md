# OpenLC is officially launched on BOT Chain Mainnet

**25 September 2026**

OpenLC, the open letter of credit, is officially launched on BOT Chain Mainnet. From today a buyer and a supplier can put a business order into escrow on BOT Chain. The buyer's payment is locked before the goods ship. It is released to the supplier in milestones as dispatch and delivery are proven. When part of a delivery goes wrong, only that part is held, and everything else pays the supplier in the same transaction.

## Why we built it

Across Asia, 44% of B2B sales made on credit are paid late, and about 5% are never paid ([Atradius Payment Practices Barometer, Asia 2025](https://group.atradius.com/dam/jcr:de5379ba-2ad5-415f-9c77-6e6c2669d13e/payment-practices-barometer-asia-2025-en.pdf)). The bank instrument built to fix this, trade finance such as a letter of credit, turns down 41% of the applications small and medium businesses make ([ADB Global Trade Finance Gap Survey, December 2025](https://www.tralac.org/documents/news/7229-adb-global-trade-finance-gap-survey-december-2025/file.html)). A supplier who ships on 60-day credit is lending to a stranger.

OpenLC replaces credit terms and deposits with payment that is secured before dispatch and released on proof.

## The contract

- Address: [0xd35bbde52618F716597cb097Fab3E52D3605A7c6](https://scan.botchain.ai/address/0xd35bbde52618F716597cb097Fab3E52D3605A7c6#code) on BOT Chain Mainnet, chain ID 677.
- Deployed in block 24383220 by [transaction 0x0f80fbd0](https://scan.botchain.ai/tx/0x0f80fbd027c4fa8e48921f649afe42649ce944f71c7f903d9e76e2fa8857f7a7).
- Source-verified on the BOT Chain Explorer.
- No owner, no admin key, no upgrade path and no fee.
- Covered by 41 contract tests. It has not had an independent security audit, so start with amounts you can afford to lose.

## Our first mainnet order

We ran the first order ourselves, between two of our own wallets, to prove every path of the contract on mainnet with real BOT. Order OLC-LAUNCH-001 was for 0.005 BOT with a 10/20/70 release plan: a deposit, a dispatch payment and a delivery balance.

- [Fund](https://scan.botchain.ai/tx/0xc7fa38a1e989b272612ea609502e10fabe652cbab0e156028d6beadacc1f9e65): the buyer locked 0.005 BOT, and the 0.0005 BOT deposit paid the supplier in the same transaction.
- [Ship](https://scan.botchain.ai/tx/0x1b3d40c8894ad1b5ae51f81d810c7fbe0ec17217714d986ce0637c2f6e29cdee): the supplier put the dispatch photo's fingerprint on chain, and 0.001 BOT was released.
- [Damage photo](https://scan.botchain.ai/tx/0xdb6648058342f49fc45d860e11d9baa37870192fdcf409fb49d37983fbda1799): the buyer recorded part of the delivery as damaged and anchored the photo's fingerprint.
- [Partial claim](https://scan.botchain.ai/tx/0xc745bfad13f06f90b18d5b8e46c3eed66389f9bd020f27c7ca22f607ef418699): one transaction held the disputed 0.001 BOT and paid the supplier the undisputed 0.0025 BOT.
- The [buyer](https://scan.botchain.ai/tx/0x55011ab077c7fadd3088331c81f28465ab822bd9c919753ac96b2085f80a5938) and the [supplier](https://scan.botchain.ai/tx/0x7ac48be1116c30808f71748e43300b5f2ceff70d9010e7ff4ed498374633bb7f) signed the same split.
- [Settlement](https://scan.botchain.ai/tx/0x5584e24933f4d613980589f42ea2d9a3ed9a01a0893bd9e7f5b5ba05e15599fa): the escrow returned 0.001 BOT to the buyer.

The supplier received 0.004 BOT and the buyer got 0.001 BOT back. Nobody held the money in between except the contract.

## How to use it

- Open [openlc.online](https://openlc.online) and sign in with MetaMask. Signing in is a message, not a transaction.
- Get BOT on the [BOT Chain DEX](https://dex.botchain.ai) for the order and the gas.
- Create a purchase order, set the release plan and send your supplier the confirmation link. The supplier confirms from its own wallet.
- Fund the escrow with one signature. The deposit pays your supplier at once.

## What protects each side

- The buyer's money is locked on chain before anything ships, and only proof releases it.
- If the supplier never ships, the buyer takes back everything not yet released once the delivery date has passed.
- If the buyer never inspects the delivery, the supplier can claim the balance once the inspection window closes.
- A claim holds only the disputed amount. The rest pays the supplier at once.
- An AI mediator can propose a split, quoting the policy and the evidence word for word. It holds no key and cannot move money. A split pays out only when both parties sign the same numbers.

## Links

- Website: [openlc.online](https://openlc.online)
- Contract: [BOT Chain Explorer](https://scan.botchain.ai/address/0xd35bbde52618F716597cb097Fab3E52D3605A7c6#code)
- Source code: [github.com/zghanw/openlc](https://github.com/zghanw/openlc)
- Video walkthrough: [four-part thread on X](https://x.com/OpenLCdev/status/2103245338459193723)
- Updates: [@OpenLCdev on X](https://x.com/OpenLCdev)
- [Terms of Service](/legal/terms) and [Dispute Resolution Policy](/legal/dispute-policy)
