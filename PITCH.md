# OpenLC: Video 2 script (presentation and demo)

About 9 minutes. Record on https://openlc.vercel.app (sign-in doesn't work on a local server).
Plain text is what you say. *Italic lines in brackets* are what you do. Cut the waiting for MetaMask and the AI in the edit.

**Before you record**

- Two browser profiles: **Buyer** (the wallet with the most test BOT, 6.5 BOT or more) and **Supplier** (a second wallet with 0.1 BOT or more for gas).
- In each profile, sign in once and set the company name (account menu → Edit company name): Buyer = **Choong Trading Sdn. Bhd.**, Supplier = **FreshSource Foods Sdn. Bhd.**
- Prepare the Scenario B order off camera: same order, reference **OLC-DEMO-0906**, release plan 10 / 20 / 70, taken as far as **Check the delivery**.
- Have ready: `docs/demo/OLC-DEMO-0905-purchase-order.pdf`, `supplier-dispatch.png`, `receiving-damage.png`.
- Pages don't refresh by themselves, so **reload** each time you switch windows. Never click the "Skip to …" buttons.

---

## 1. The landing page

*[Top of the landing page. Let the tunnel animation play for a second.]*

Across Asia, almost half of all business-to-business sales on credit get paid late, and about one in twenty never get paid at all.

Think about what that means for a small supplier. They ship the goods, and then they wait. Thirty days. Sixty days. They're basically lending money to a stranger.

The usual fix is a bank letter of credit. But banks turn down about four in ten small businesses that ask for trade finance.

So I built OpenLC, the open letter of credit, on BOT Chain. The idea is simple. The buyer's money is locked before the goods ship, and it's released as the supplier proves they've delivered.

*[Scroll to "Sixty days of credit, or paid on proof." Scroll slowly so the light moves down the line.]*

Here's the same three-BOT sale, done two ways.

On the left is normal credit. On day zero the goods ship, and nothing gets paid. On day thirty the invoice is still sitting there. On day sixty it's finally due, and that's if the buyer pays on time.

On the right is OpenLC, and these are real transactions from an order I ran on BOT Chain testnet. On day zero, the buyer locks all three BOT before anything ships, and the deposit goes to the supplier straight away. On day one, the supplier ships with a photo of the dispatch. That photo's fingerprint goes on chain, and the next payment is released. On day three, the buyer accepts, and the rest is paid.

So the supplier is paid in full on day three, while the credit side is still waiting.

*[Scroll to "When part of it goes wrong, only that part waits." Pause while the bar splits.]*

But the part I'm most proud of is what happens when something goes wrong.

In this order, one carton arrived damaged. With OpenLC, the buyer doesn't freeze the whole payment. They claim just the damaged part, zero point one five BOT here, and in that same transaction the supplier is paid for everything else.

Then both sides sign the split on chain. If they can't agree, an AI mediator reads the evidence and the policy and suggests a fair split. But it's only a suggestion. The AI can't move any money.

*[Scroll to "Try it in four steps".]*

If you only have one wallet, you can try this yourself right now. Sign in with MetaMask, grab some test BOT from the faucet, and create an order with the OpenLC demo supplier. It confirms instantly, so you can lock BOT on chain in about a minute.

*[Scroll to "What stays true".]*

And a few things are always true. The contract has no owner, no admin and no fee. Every step is checked on chain before it counts. And money only moves when the buyer and the supplier both sign.

Now let me show you two real orders.

---

## 2. Signing in

*[Buyer window. Click **Sign in**, then **Sign** in MetaMask.]*

First, I sign in. There's no password. My wallet is my account. MetaMask just asks me to sign a message. It's not a transaction, and it costs nothing.

On this side I'm Choong Trading, the buyer. In the other window I'm FreshSource Foods, the supplier. Two different wallets.

---

## 3. Scenario A: everything goes right

*[Buyer: click **New order**.]*

Let's say Choong Trading wants to buy some fruit from FreshSource. I'll create a new purchase order.

*[Click **Import from file** and pick the purchase order PDF. If import isn't set up, type the three lines instead.]*

I'll upload the purchase order, and the lines fill themselves in. Strawberries, blueberries and avocados, three BOT in total.

*[Type "FreshSource Foods Sdn. Bhd." as the supplier, leave the demo supplier unticked, click **Set release plan**.]*

The supplier is FreshSource Foods.

*[Set the plan to 10%, 20%, 70%.]*

Now the release plan. This decides when the supplier gets paid: ten percent when I fund, twenty percent when they ship, and seventy percent only after I've checked the delivery. So most of the money stays protected until I'm happy.

*[Tick the terms, click **Send for supplier confirmation**, then **Copy link**.]*

I accept the terms and send it. OpenLC gives me a link to send to my supplier.

*[Supplier window: paste the link, sign in, tick both boxes, click **Confirm and accept terms**.]*

Now I'm the supplier. I open the link, sign in with my own wallet, check the order, and confirm.

Notice I never typed a wallet address. The wallet that accepts the order becomes the payout address, so nobody can swap it.

*[Buyer window: reload, click **Fund escrow**, then **Sign and fund escrow**, and confirm in MetaMask.]*

Back to the buyer. The supplier has confirmed, so now I fund the order. One transaction locks the three BOT in the escrow contract.

*[Scroll down to the **On BOT Chain** panel.]*

And this is the important bit. This panel reads straight from the contract on BOT Chain, not from our database. Three BOT locked, and zero point three already paid to the supplier as the deposit.

*[Supplier window: reload. Carrier **DHL Express**, tracking **DHL-OLC-0905-MY**, attach the dispatch photo, **Mark as shipped**, then **Sign and mark as shipped**.]*

Now the supplier ships. They pick the carrier, add the tracking number and attach a photo of the goods going out. When they sign, the photo's fingerprint is saved on chain, and the dispatch payment, zero point six BOT, is released.

*[Buyer window: reload, click **The goods have arrived**, then **Record delivery**.]*

The goods arrive at the buyer's warehouse, and I record the delivery. No money moves yet. Now I get to check.

*[Choose **Yes, everything intact**, click **Accept delivery**, then **Release payment**, and confirm in MetaMask.]*

Everything's here and nothing's damaged. So I accept, and the remaining two point one BOT goes to the supplier.

*[Show the **Settled** status and the explorer link.]*

And that's it, settled. The supplier was paid when they shipped and when the goods were accepted, not sixty days later. And every payment is a transaction you can check on the explorer.

---

## 4. Scenario B: damaged goods

*[Buyer window: open order **OLC-DEMO-0906**, which is waiting at **Check the delivery**.]*

Now the more interesting case. Same buyer, same supplier, same order. I've already taken this one up to delivery so we don't repeat the same steps. But this time, when I open the boxes, two cartons of strawberries are crushed.

*[Choose **Some items missing or damaged**. Type **2** under **Damaged** on the strawberries line.]*

So I say some items are damaged, and I put two cartons in the damaged column. OpenLC works out what they're worth, zero point two four BOT.

*[Write a short note, attach the damage photo, click **Open claim**, and confirm in MetaMask.]*

I write what went wrong, attach my photo from the receiving bay, and open a claim.

*[Scroll to the **On BOT Chain** panel. It now shows **Disputed**.]*

This is the key moment. In that one transaction, only the zero point two four BOT in dispute stays locked. Everything else is paid to the supplier right now. The supplier isn't punished on the whole order because of two boxes.

*[Supplier window: reload, click **Dispute with evidence**, write a statement, **Submit response**.]*

Now the supplier sees the claim, and they disagree. They say the cartons were fine when they left, and the damage happened on the road. So they respond with their side of the story.

*[Click **Request AI mediation**. Cut the wait in the edit.]*

So now we're stuck, and this is where the AI mediator comes in.

*[The proposal card appears.]*

Two AI advocates argue each side, and a neutral mediator reads both of them, plus the policy, and suggests a split. Here it's suggesting *[read the two numbers on screen]* back to the buyer and to the supplier.

Every quote it uses is checked word for word against the evidence and the policy. And it's clearly marked: an AI proposal, not binding.

*[Click **View mediation report** for a few seconds.]*

You can open the full report and see exactly how it got to that number.

*[Supplier: **Accept proposal**. Buyer window: reload, **Accept proposal**.]*

The supplier accepts, and so does the buyer. Both sides agree.

*[Buyer: **Sign as buyer**, confirm in MetaMask.]*

Now we make it real. The buyer signs the split on BOT Chain.

*[Supplier window: reload, **Sign as supplier**, confirm, then **Execute settlement** and confirm.]*

The supplier signs the same numbers. With both signatures on chain, the settlement can run.

*[Show **Settled** and the On BOT Chain panel.]*

Done. The buyer got money back for the crushed cartons, the supplier got paid for everything they delivered, and nobody waited sixty days or called a lawyer.

> **If the AI doesn't propose a split,** say: "Sometimes the evidence isn't clear enough, and the mediator says so instead of guessing. Then either side can just propose a split themselves." Then click **Propose a split**, have the other side accept, and carry on from "Now we make it real."
>
> **If the AI is busy,** wait a minute and click again. Cut the wait in the edit.

---

## 5. Proof and close

*[Open the settlement's **View on BOT Chain Testnet Explorer** link.]*

Everything you just saw is on BOT Chain. Here's the settlement on the explorer: the contract, the event and the exact amounts. The contract's source code is verified, and it has no owner and no admin key.

*[Go back to the landing page and scroll to the bottom: "Lock the payment. Ship on proof."]*

So that's OpenLC. Suppliers get paid on proof instead of lending to strangers. Buyers only pay for what actually arrives. And when something goes wrong, only that part waits.

OpenLC, the open letter of credit, built on BOT Chain. Thanks for watching.
