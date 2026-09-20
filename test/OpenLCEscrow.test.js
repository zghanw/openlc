import { network } from "hardhat";
import { expect } from "chai";

/**
 * OpenLCEscrow: the BOT Chain port of payproof::escrow.
 *
 * Every test in sources/ProofPay/contracts/payproof/tests/escrow_tests.move has a
 * counterpart here, so a behaviour that held on Sui is proven to still hold on EVM:
 *
 *   milestone_plan_releases_deposit_dispatch_and_delivery_without_overpaying
 *     -> "releases deposit, dispatch and delivery without ever overpaying"
 *   opening_a_dispute_pays_the_undisputed_value_in_the_same_transaction
 *     -> "pays the undisputed value in the same transaction as the claim"
 *   arbitrator_can_execute_when_one_party_does_not_approve
 *     -> "lets the arbitrator settle when one party never approves"
 *   buyer_can_confirm_without_a_dispute      -> "lets the buyer confirm delivery without a dispute"
 *   only_buyer_can_open_a_dispute            -> "lets only the buyer open a dispute"
 *   shipment_and_evidence_are_recorded_as_events
 *     -> "records shipment and evidence as events"
 *   outsiders_cannot_anchor_evidence         -> "refuses evidence from anyone outside the trade"
 *   shipment_can_only_be_marked_once         -> "accepts shipment only once"
 *   buyer_reclaims_an_unshipped_escrow_after_the_delivery_deadline
 *     -> "lets the buyer reclaim an unshipped escrow after the delivery deadline"
 *   buyer_cannot_reclaim_before_the_delivery_deadline
 *     -> "refuses a reclaim before the delivery deadline"
 *   buyer_cannot_reclaim_a_shipped_escrow    -> "refuses a reclaim once the goods have shipped"
 *   supplier_claims_an_uninspected_escrow_after_the_window
 *     -> "lets the supplier claim an uninspected escrow after the window"
 *   supplier_cannot_claim_inside_the_inspection_window
 *     -> "refuses a supplier claim inside the inspection window"
 *   supplier_cannot_claim_without_marking_shipment
 *     -> "refuses a supplier claim when nothing was shipped"
 *   a_late_shipment_extends_the_inspection_window
 *     -> "extends the inspection window when shipment is late"
 */

const DAY = 24n * 60n * 60n;
const INSPECTION_WINDOW = 7n * DAY;
const ORDER_HASH = `0x${"11".repeat(32)}`;
const EVIDENCE_HASH = `0x${"22".repeat(32)}`;
const PROPOSAL_HASH = `0x${"33".repeat(32)}`;
const OTHER_PROPOSAL_HASH = `0x${"44".repeat(32)}`;
const ZERO_HASH = `0x${"00".repeat(32)}`;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const REFERENCE = "PP-DEMO-0905";

const STATUS = { Open: 0n, Disputed: 1n, Settled: 2n };
const MODE = {
  BuyerConfirmation: 0n,
  MutualApproval: 1n,
  Arbitrator: 2n,
  RefundUnshipped: 3n,
  ClaimUninspected: 4n,
};
/** Evidence kinds as the app records them; the contract only echoes the number. */
const KIND_DISPATCH = 2;

async function deployFixture() {
  const { ethers } = await network.create();
  const [buyer, supplier, arbitrator, outsider] = await ethers.getSigners();
  const escrow = await ethers.deployContract("OpenLCEscrow");
  await escrow.waitForDeployment();
  return { ethers, escrow, buyer, supplier, arbitrator, outsider };
}

function gasCost(receipt) {
  return receipt.gasUsed * receipt.gasPrice;
}

async function now(ethers) {
  const block = await ethers.provider.getBlock("latest");
  return BigInt(block.timestamp);
}

async function setNextTimestamp(ethers, timestamp) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [Number(timestamp)]);
}

/** Decodes one event of `name` from a receipt, so wide events don't need withArgs. */
function eventArgs(escrow, receipt, name) {
  for (const log of receipt.logs) {
    try {
      const parsed = escrow.interface.parseLog(log);
      if (parsed && parsed.name === name) return parsed.args;
    } catch {
      // a log from another contract; ignore
    }
  }
  return undefined;
}

/** A 30 BOT order on a 10/20/70 deposit/dispatch/delivery plan, the demo shape. */
async function openEscrow(context, overrides = {}) {
  const { ethers, escrow, buyer, supplier, arbitrator } = context;
  const total = overrides.total ?? ethers.parseEther("30");
  const deposit = overrides.deposit ?? total / 10n;
  const dispatch = overrides.dispatch ?? (total * 2n) / 10n;
  const delivery = overrides.delivery ?? total - deposit - dispatch;
  const deadline = overrides.deadline ?? (await now(ethers)) + 3n * DAY;
  const window = overrides.window ?? INSPECTION_WINDOW;
  const receipt = await (
    await escrow
      .connect(overrides.from ?? buyer)
      .createEscrow(
        overrides.supplier ?? supplier.address,
        overrides.arbitrator ?? arbitrator.address,
        overrides.orderHash ?? ORDER_HASH,
        overrides.reference ?? REFERENCE,
        deposit,
        dispatch,
        delivery,
        deadline,
        window,
        { value: overrides.value ?? deposit + dispatch + delivery },
      )
  ).wait();
  return { id: await escrow.escrowCount(), total, deposit, dispatch, delivery, deadline, window, receipt };
}

/**
 * The two invariants the contract documents:
 *   contract balance == the BOT still held by every escrow + everything owed
 *   per escrow: totalAmount == releasedAmount + balance + settledBuyerRefund
 */
async function expectInvariants(context, addresses = []) {
  const { ethers, escrow } = context;
  const count = await escrow.escrowCount();
  expect(count, "no escrow to check the invariants against").to.be.greaterThan(0n);
  let held = 0n;
  for (let id = 1n; id <= count; id += 1n) {
    const record = await escrow.getEscrow(id);
    expect(record.totalAmount, `escrow ${id} conservation`).to.equal(
      record.releasedAmount + record.balance + record.settledBuyerRefund,
    );
    held += record.balance;
  }
  // every address the contract ever failed to pay announced itself in an event,
  // so the owed side is scanned rather than trusted to a caller's list
  const deferred = await escrow.queryFilter(escrow.filters.PaymentDeferred());
  const owedTo = new Set([...addresses, ...deferred.map((event) => event.args.to)]);
  for (const address of owedTo) held += await escrow.owed(address);
  expect(await ethers.provider.getBalance(await escrow.getAddress()), "contract balance").to.equal(held);
}

describe("OpenLCEscrow", function () {
  describe("milestones and settlement", function () {
    it("releases deposit, dispatch and delivery without ever overpaying", async function () {
      const context = await deployFixture();
      const { ethers, escrow, buyer, supplier } = context;
      const before = await ethers.provider.getBalance(supplier.address);

      const { id, total, deposit, dispatch, delivery } = await openEscrow(context);
      expect(await ethers.provider.getBalance(supplier.address)).to.equal(before + deposit);
      let record = await escrow.getEscrow(id);
      expect(record.balance).to.equal(dispatch + delivery);
      expect(record.releasedAmount).to.equal(deposit);
      await expectInvariants(context, [supplier.address]);

      // the supplier signs this one, so its own gas comes out of the same balance
      const shipGas = gasCost(await (await escrow.connect(supplier).markShipped(id, EVIDENCE_HASH)).wait());
      expect(await ethers.provider.getBalance(supplier.address)).to.equal(before + deposit + dispatch - shipGas);
      record = await escrow.getEscrow(id);
      expect(record.balance).to.equal(delivery);
      await expectInvariants(context, [supplier.address]);

      await (await escrow.connect(buyer).releaseFull(id)).wait();
      expect(await ethers.provider.getBalance(supplier.address)).to.equal(before + total - shipGas);
      record = await escrow.getEscrow(id);
      expect(record.status).to.equal(STATUS.Settled);
      expect(record.mode).to.equal(MODE.BuyerConfirmation);
      expect(record.balance).to.equal(0n);
      expect(record.releasedAmount).to.equal(total);
      await expectInvariants(context, [supplier.address]);
    });

    it("pays the undisputed value in the same transaction as the claim", async function () {
      const context = await deployFixture();
      const { ethers, escrow, buyer, supplier } = context;
      const { id, delivery } = await openEscrow(context);
      await (await escrow.connect(supplier).markShipped(id, EVIDENCE_HASH)).wait();

      const disputed = ethers.parseEther("3.6");
      const requested = ethers.parseEther("3.6");
      const before = await ethers.provider.getBalance(supplier.address);
      const receipt = await (await escrow.connect(buyer).openDispute(id, disputed, requested)).wait();

      // the whole remaining delivery balance minus the disputed part lands immediately
      expect(await ethers.provider.getBalance(supplier.address)).to.equal(before + (delivery - disputed));
      expect(eventArgs(escrow, receipt, "UndisputedReleased").amount).to.equal(delivery - disputed);
      const record = await escrow.getEscrow(id);
      expect(record.status).to.equal(STATUS.Disputed);
      expect(record.balance).to.equal(disputed);
      expect(record.disputedAmount).to.equal(disputed);
      expect(record.requestedBuyerRefund).to.equal(requested);
      await expectInvariants(context, [supplier.address]);
    });

    it("splits the disputed amount once both parties sign the same allocation", async function () {
      const context = await deployFixture();
      const { ethers, escrow, buyer, supplier, outsider } = context;
      const { id } = await openEscrow(context);
      await (await escrow.connect(supplier).markShipped(id, EVIDENCE_HASH)).wait();
      const disputed = ethers.parseEther("3.6");
      await (await escrow.connect(buyer).openDispute(id, disputed, disputed)).wait();

      // deliberately lopsided: a swapped payout inside _settle would be visible
      const refund = ethers.parseEther("1.2");
      const release = disputed - refund; // 2.4
      expect(refund).to.not.equal(release);
      await (await escrow.connect(buyer).approveSettlement(id, refund, release, PROPOSAL_HASH)).wait();
      await (await escrow.connect(supplier).approveSettlement(id, refund, release, PROPOSAL_HASH)).wait();

      const buyerBefore = await ethers.provider.getBalance(buyer.address);
      const supplierBefore = await ethers.provider.getBalance(supplier.address);
      // anyone may execute an approved settlement
      await (await escrow.connect(outsider).executeSettlement(id)).wait();

      expect(await ethers.provider.getBalance(buyer.address)).to.equal(buyerBefore + refund);
      expect(await ethers.provider.getBalance(supplier.address)).to.equal(supplierBefore + release);
      const record = await escrow.getEscrow(id);
      expect(record.status).to.equal(STATUS.Settled);
      expect(record.mode).to.equal(MODE.MutualApproval);
      expect(record.settledBuyerRefund).to.equal(refund);
      expect(record.settledSupplierRelease).to.equal(release);
      expect(record.proposalHash).to.equal(PROPOSAL_HASH);
      await expectInvariants(context, [buyer.address, supplier.address]);
    });

    it("lets the arbitrator settle when one party never approves", async function () {
      const context = await deployFixture();
      const { ethers, escrow, buyer, supplier, arbitrator } = context;
      const { id } = await openEscrow(context);
      await (await escrow.connect(supplier).markShipped(id, EVIDENCE_HASH)).wait();
      const disputed = ethers.parseEther("3.6");
      await (await escrow.connect(buyer).openDispute(id, disputed, disputed)).wait();

      const refund = ethers.parseEther("2");
      const release = disputed - refund;
      // only the buyer signs; the arbitrator decides the rest
      await (await escrow.connect(buyer).approveSettlement(id, disputed, 0n, PROPOSAL_HASH)).wait();
      await (await escrow.connect(arbitrator).approveSettlement(id, refund, release, PROPOSAL_HASH)).wait();
      await (await escrow.connect(arbitrator).executeSettlement(id)).wait();

      const record = await escrow.getEscrow(id);
      expect(record.mode).to.equal(MODE.Arbitrator);
      expect(record.settledBuyerRefund).to.equal(refund);
      expect(record.settledSupplierRelease).to.equal(release);
      await expectInvariants(context, [buyer.address, supplier.address]);
    });

    it("lets the arbitrator override an allocation both parties already signed", async function () {
      const context = await deployFixture();
      const { ethers, escrow, buyer, supplier, arbitrator } = context;
      const { id } = await openEscrow(context);
      const disputed = ethers.parseEther("3");
      await (await escrow.connect(buyer).openDispute(id, disputed, disputed)).wait();

      const agreed = ethers.parseEther("1");
      await (await escrow.connect(buyer).approveSettlement(id, agreed, disputed - agreed, PROPOSAL_HASH)).wait();
      await (await escrow.connect(supplier).approveSettlement(id, agreed, disputed - agreed, PROPOSAL_HASH)).wait();

      const decided = ethers.parseEther("2.5");
      await (
        await escrow.connect(arbitrator).approveSettlement(id, decided, disputed - decided, OTHER_PROPOSAL_HASH)
      ).wait();
      await (await escrow.connect(buyer).executeSettlement(id)).wait();

      const record = await escrow.getEscrow(id);
      expect(record.mode).to.equal(MODE.Arbitrator);
      expect(record.settledBuyerRefund).to.equal(decided);
      expect(record.proposalHash).to.equal(OTHER_PROPOSAL_HASH);
      await expectInvariants(context, [buyer.address, supplier.address]);
    });

    it("lets the buyer confirm delivery without a dispute", async function () {
      const context = await deployFixture();
      const { ethers, escrow, buyer, supplier } = context;
      const { id, dispatch, delivery } = await openEscrow(context);
      const before = await ethers.provider.getBalance(supplier.address);

      await (await escrow.connect(buyer).releaseFull(id)).wait();

      expect(await ethers.provider.getBalance(supplier.address)).to.equal(before + dispatch + delivery);
      expect((await escrow.getEscrow(id)).mode).to.equal(MODE.BuyerConfirmation);
      await expectInvariants(context, [supplier.address]);
    });

    it("lets only the buyer open a dispute", async function () {
      const context = await deployFixture();
      const { ethers, escrow, supplier, arbitrator, outsider } = context;
      const { id } = await openEscrow(context);
      const disputed = ethers.parseEther("1");

      for (const signer of [supplier, arbitrator, outsider]) {
        await expect(
          escrow.connect(signer).openDispute(id, disputed, disputed),
        ).to.be.revertedWithCustomError(escrow, "Unauthorized");
      }
    });
  });

  describe("shipment and evidence", function () {
    it("records shipment and evidence as events", async function () {
      const context = await deployFixture();
      const { escrow, buyer, supplier } = context;
      const { id, dispatch, delivery } = await openEscrow(context);

      const shipReceipt = await (await escrow.connect(supplier).markShipped(id, EVIDENCE_HASH)).wait();
      const shipped = eventArgs(escrow, shipReceipt, "Shipped");
      expect(shipped.supplier).to.equal(supplier.address);
      expect(shipped.evidenceHash).to.equal(EVIDENCE_HASH);
      expect(shipped.releasedAmount).to.equal(dispatch);
      expect(shipped.remainingAmount).to.equal(delivery);
      const milestone = eventArgs(escrow, shipReceipt, "MilestoneReleased");
      expect(milestone.stage).to.equal(2n);
      expect(milestone.amount).to.equal(dispatch);

      // both sides of the trade may anchor a document
      const supplierAnchor = await (
        await escrow.connect(supplier).anchorEvidence(id, KIND_DISPATCH, EVIDENCE_HASH)
      ).wait();
      expect(eventArgs(escrow, supplierAnchor, "EvidenceAnchored").party).to.equal(supplier.address);

      const anchorReceipt = await (await escrow.connect(buyer).anchorEvidence(id, KIND_DISPATCH, EVIDENCE_HASH)).wait();
      const anchored = eventArgs(escrow, anchorReceipt, "EvidenceAnchored");
      expect(anchored.party).to.equal(buyer.address);
      expect(anchored.kind).to.equal(BigInt(KIND_DISPATCH));
      expect(anchored.evidenceHash).to.equal(EVIDENCE_HASH);
      expect((await escrow.getEscrow(id)).dispatchEvidenceHash).to.equal(EVIDENCE_HASH);
    });

    it("refuses evidence from anyone outside the trade", async function () {
      const context = await deployFixture();
      const { escrow, arbitrator, outsider } = context;
      const { id } = await openEscrow(context);

      for (const signer of [arbitrator, outsider]) {
        await expect(
          escrow.connect(signer).anchorEvidence(id, KIND_DISPATCH, EVIDENCE_HASH),
        ).to.be.revertedWithCustomError(escrow, "Unauthorized");
      }
      await expect(
        escrow.connect(outsider).anchorEvidence(id, KIND_DISPATCH, ZERO_HASH),
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");
    });

    it("accepts shipment only once", async function () {
      const context = await deployFixture();
      const { escrow, buyer, supplier } = context;
      const { id } = await openEscrow(context);
      await (await escrow.connect(supplier).markShipped(id, EVIDENCE_HASH)).wait();

      await expect(escrow.connect(supplier).markShipped(id, EVIDENCE_HASH)).to.be.revertedWithCustomError(
        escrow,
        "AlreadyShipped",
      );
      await expect(escrow.connect(buyer).markShipped(id, EVIDENCE_HASH)).to.be.revertedWithCustomError(
        escrow,
        "Unauthorized",
      );
    });

    it("requires a real evidence hash on shipment", async function () {
      const context = await deployFixture();
      const { escrow, supplier } = context;
      const { id } = await openEscrow(context);

      await expect(escrow.connect(supplier).markShipped(id, ZERO_HASH)).to.be.revertedWithCustomError(
        escrow,
        "InvalidEvidenceHash",
      );
    });
  });

  describe("deadline paths", function () {
    it("lets the buyer reclaim an unshipped escrow after the delivery deadline", async function () {
      const context = await deployFixture();
      const { ethers, escrow, buyer } = context;
      const { id, deadline, dispatch, delivery } = await openEscrow(context);

      await setNextTimestamp(ethers, deadline + 1n);
      const before = await ethers.provider.getBalance(buyer.address);
      const receipt = await (await escrow.connect(buyer).refundUnshipped(id)).wait();

      expect(await ethers.provider.getBalance(buyer.address)).to.equal(
        before + dispatch + delivery - gasCost(receipt),
      );
      const record = await escrow.getEscrow(id);
      expect(record.status).to.equal(STATUS.Settled);
      expect(record.mode).to.equal(MODE.RefundUnshipped);
      expect(record.settledBuyerRefund).to.equal(dispatch + delivery);
      await expectInvariants(context, [buyer.address]);
    });

    it("refuses a reclaim before the delivery deadline", async function () {
      const context = await deployFixture();
      const { ethers, escrow, buyer } = context;
      const { id, deadline } = await openEscrow(context);

      // one second early
      await setNextTimestamp(ethers, deadline - 1n);
      await expect(escrow.connect(buyer).refundUnshipped(id)).to.be.revertedWithCustomError(
        escrow,
        "DeadlineNotReached",
      );
      // and exactly on the deadline: the contract needs strictly past it
      await setNextTimestamp(ethers, deadline);
      await expect(escrow.connect(buyer).refundUnshipped(id)).to.be.revertedWithCustomError(
        escrow,
        "DeadlineNotReached",
      );
      // one second later it works
      await setNextTimestamp(ethers, deadline + 1n);
      await (await escrow.connect(buyer).refundUnshipped(id)).wait();
      expect((await escrow.getEscrow(id)).status).to.equal(STATUS.Settled);
    });

    it("refuses a reclaim once the goods have shipped", async function () {
      const context = await deployFixture();
      const { ethers, escrow, buyer, supplier } = context;
      const { id, deadline } = await openEscrow(context);
      await (await escrow.connect(supplier).markShipped(id, EVIDENCE_HASH)).wait();

      await setNextTimestamp(ethers, deadline + 1n);
      await expect(escrow.connect(buyer).refundUnshipped(id)).to.be.revertedWithCustomError(
        escrow,
        "AlreadyShipped",
      );
    });

    it("lets the supplier claim an uninspected escrow after the window", async function () {
      const context = await deployFixture();
      const { ethers, escrow, supplier } = context;
      const { id, delivery, deadline, window } = await openEscrow(context);
      await (await escrow.connect(supplier).markShipped(id, EVIDENCE_HASH)).wait();

      // shipped on time, so the window runs from the agreed delivery date, not from shipment;
      // computed here from the order's own terms rather than read back from the contract
      const closes = BigInt(await escrow.inspectionClosesAt(id));
      expect(closes).to.equal(deadline + window);
      await setNextTimestamp(ethers, closes + 1n);
      const before = await ethers.provider.getBalance(supplier.address);
      const receipt = await (await escrow.connect(supplier).claimUninspected(id)).wait();

      expect(await ethers.provider.getBalance(supplier.address)).to.equal(
        before + delivery - gasCost(receipt),
      );
      const record = await escrow.getEscrow(id);
      expect(record.mode).to.equal(MODE.ClaimUninspected);
      expect(record.settledSupplierRelease).to.equal(delivery);
      await expectInvariants(context, [supplier.address]);
    });

    it("refuses a supplier claim inside the inspection window", async function () {
      const context = await deployFixture();
      const { ethers, escrow, supplier } = context;
      const { id } = await openEscrow(context);
      await (await escrow.connect(supplier).markShipped(id, EVIDENCE_HASH)).wait();

      const closes = BigInt(await escrow.inspectionClosesAt(id));
      await setNextTimestamp(ethers, closes);
      await expect(escrow.connect(supplier).claimUninspected(id)).to.be.revertedWithCustomError(
        escrow,
        "DeadlineNotReached",
      );
      await setNextTimestamp(ethers, closes + 1n);
      await (await escrow.connect(supplier).claimUninspected(id)).wait();
      expect((await escrow.getEscrow(id)).status).to.equal(STATUS.Settled);
    });

    it("refuses a supplier claim when nothing was shipped", async function () {
      const context = await deployFixture();
      const { ethers, escrow, supplier } = context;
      const { id, deadline, window } = await openEscrow(context);

      await setNextTimestamp(ethers, deadline + window + 1n);
      await expect(escrow.connect(supplier).claimUninspected(id)).to.be.revertedWithCustomError(
        escrow,
        "NotShipped",
      );
    });

    it("extends the inspection window when shipment is late", async function () {
      const context = await deployFixture();
      const { ethers, escrow, supplier } = context;
      const { id, deadline, window } = await openEscrow(context);

      // the supplier ships two days after the agreed delivery date
      const shippedAt = deadline + 2n * DAY;
      await setNextTimestamp(ethers, shippedAt);
      await (await escrow.connect(supplier).markShipped(id, EVIDENCE_HASH)).wait();

      // the window now runs from the later shipment, not from the delivery deadline
      const closes = BigInt(await escrow.inspectionClosesAt(id));
      expect(closes).to.equal(shippedAt + window);
      await setNextTimestamp(ethers, deadline + window + 1n);
      await expect(escrow.connect(supplier).claimUninspected(id)).to.be.revertedWithCustomError(
        escrow,
        "DeadlineNotReached",
      );
      await setNextTimestamp(ethers, closes + 1n);
      await (await escrow.connect(supplier).claimUninspected(id)).wait();
      expect((await escrow.getEscrow(id)).status).to.equal(STATUS.Settled);
    });
  });

  describe("creating an escrow", function () {
    it("refuses an escrow with no money in it", async function () {
      const context = await deployFixture();
      const { escrow } = context;
      await expect(openEscrow(context, { total: 0n, deposit: 0n, dispatch: 0n, delivery: 0n })).to.be
        .revertedWithCustomError(escrow, "ZeroAmount");
    });

    const partyCases = [
      ["a supplier that is not an address", (c) => ({ supplier: ZERO_ADDRESS })],
      ["an arbitrator that is not an address", (c) => ({ arbitrator: ZERO_ADDRESS })],
      ["a supplier that is also the buyer", (c) => ({ supplier: c.buyer.address })],
      ["an arbitrator that is also the buyer", (c) => ({ arbitrator: c.buyer.address })],
      ["a supplier that is also the arbitrator", (c) => ({ supplier: c.arbitrator.address })],
      ["an arbitrator that is also the supplier", (c) => ({ arbitrator: c.supplier.address })],
    ];
    for (const [label, override] of partyCases) {
      it(`refuses ${label}`, async function () {
        const context = await deployFixture();
        await expect(openEscrow(context, override(context))).to.be.revertedWithCustomError(
          context.escrow,
          "InvalidParties",
        );
      });
    }

    it("refuses an empty order hash", async function () {
      const context = await deployFixture();
      await expect(openEscrow(context, { orderHash: ZERO_HASH })).to.be.revertedWithCustomError(
        context.escrow,
        "InvalidOrderHash",
      );
    });

    it("holds the order reference to 1-128 bytes", async function () {
      const context = await deployFixture();
      const { escrow } = context;

      await expect(openEscrow(context, { reference: "" })).to.be.revertedWithCustomError(escrow, "EmptyReference");
      await expect(openEscrow(context, { reference: "x".repeat(129) })).to.be.revertedWithCustomError(
        escrow,
        "ReferenceTooLong",
      );
      const { id } = await openEscrow(context, { reference: "x".repeat(128) });
      expect((await escrow.getEscrow(id)).orderReference).to.have.length(128);
    });

    it("refuses a delivery deadline that is not in the future, or a zero inspection window", async function () {
      const context = await deployFixture();
      const { ethers, escrow } = context;
      const current = await now(ethers);

      await expect(openEscrow(context, { deadline: current - 1n })).to.be.revertedWithCustomError(
        escrow,
        "InvalidDeadline",
      );
      await expect(openEscrow(context, { window: 0n })).to.be.revertedWithCustomError(escrow, "InvalidDeadline");
    });

    it("refuses a release plan that does not add up to the payment", async function () {
      const context = await deployFixture();
      const { ethers, escrow } = context;
      const total = ethers.parseEther("10");

      await expect(
        openEscrow(context, { total, deposit: 1n, dispatch: 1n, delivery: 1n, value: total }),
      ).to.be.revertedWithCustomError(escrow, "InvalidReleasePlan");
    });

    it("numbers escrows from 1 and refuses unknown ids", async function () {
      const context = await deployFixture();
      const { escrow, buyer } = context;

      expect(await escrow.escrowCount()).to.equal(0n);
      const { id } = await openEscrow(context);
      expect(id).to.equal(1n);

      await expect(escrow.getEscrow(0)).to.be.revertedWithCustomError(escrow, "UnknownEscrow");
      await expect(escrow.getEscrow(2)).to.be.revertedWithCustomError(escrow, "UnknownEscrow");
      await expect(escrow.connect(buyer).releaseFull(99)).to.be.revertedWithCustomError(escrow, "UnknownEscrow");
    });
  });

  describe("approving a settlement", function () {
    async function disputedEscrow() {
      const context = await deployFixture();
      const { ethers, escrow, buyer, supplier } = context;
      const opened = await openEscrow(context);
      await (await escrow.connect(supplier).markShipped(opened.id, EVIDENCE_HASH)).wait();
      const disputed = ethers.parseEther("4");
      const requested = ethers.parseEther("3");
      await (await escrow.connect(buyer).openDispute(opened.id, disputed, requested)).wait();
      return { context, id: opened.id, disputed, requested };
    }

    it("refuses approvals from outside the trade", async function () {
      const { context, id, disputed } = await disputedEscrow();
      const { escrow, outsider } = context;

      await expect(
        escrow.connect(outsider).approveSettlement(id, 0n, disputed, PROPOSAL_HASH),
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");
    });

    it("refuses approvals before a dispute exists", async function () {
      const context = await deployFixture();
      const { ethers, escrow, buyer, outsider } = context;
      const { id } = await openEscrow(context);

      await expect(
        escrow.connect(buyer).approveSettlement(id, 0n, ethers.parseEther("1"), PROPOSAL_HASH),
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
      // an outsider is turned away before the state is even considered
      await expect(
        escrow.connect(outsider).approveSettlement(id, 0n, ethers.parseEther("1"), PROPOSAL_HASH),
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");
    });

    it("requires the second signature to match the first", async function () {
      const { context, id, disputed, requested } = await disputedEscrow();
      const { ethers, escrow, buyer, supplier } = context;

      await (await escrow.connect(buyer).approveSettlement(id, requested, disputed - requested, PROPOSAL_HASH)).wait();
      // different split
      await expect(
        escrow.connect(supplier).approveSettlement(id, ethers.parseEther("1"), disputed - ethers.parseEther("1"), PROPOSAL_HASH),
      ).to.be.revertedWithCustomError(escrow, "ApprovalMismatch");
      // same split, different proposal
      await expect(
        escrow.connect(supplier).approveSettlement(id, requested, disputed - requested, OTHER_PROPOSAL_HASH),
      ).to.be.revertedWithCustomError(escrow, "ApprovalMismatch");
    });

    it("caps the buyer refund at the remedy the buyer asked for and conserves the disputed amount", async function () {
      const { context, id, disputed, requested } = await disputedEscrow();
      const { ethers, escrow, buyer } = context;

      await expect(
        escrow.connect(buyer).approveSettlement(id, disputed, 0n, PROPOSAL_HASH),
      ).to.be.revertedWithCustomError(escrow, "InvalidAllocation");
      await expect(
        escrow.connect(buyer).approveSettlement(id, requested, ethers.parseEther("0.5"), PROPOSAL_HASH),
      ).to.be.revertedWithCustomError(escrow, "InvalidAllocation");
    });

    it("refuses an allocation with no proposal behind it", async function () {
      const { context, id, disputed } = await disputedEscrow();
      const { escrow, buyer } = context;

      await expect(
        escrow.connect(buyer).approveSettlement(id, 0n, disputed, ZERO_HASH),
      ).to.be.revertedWithCustomError(escrow, "InvalidProposalHash");
    });

    it("refuses to execute a settlement nobody has approved", async function () {
      const { context, id, disputed, requested } = await disputedEscrow();
      const { escrow, buyer, supplier } = context;

      await expect(escrow.connect(buyer).executeSettlement(id)).to.be.revertedWithCustomError(
        escrow,
        "ApprovalRequired",
      );
      // one signature is not enough either
      await (await escrow.connect(buyer).approveSettlement(id, requested, disputed - requested, PROPOSAL_HASH)).wait();
      await expect(escrow.connect(supplier).executeSettlement(id)).to.be.revertedWithCustomError(
        escrow,
        "ApprovalRequired",
      );
    });
  });

  describe("a settled escrow", function () {
    it("refuses every further action", async function () {
      const context = await deployFixture();
      const { ethers, escrow, buyer, supplier } = context;
      const { id } = await openEscrow(context);
      await (await escrow.connect(buyer).releaseFull(id)).wait();

      const one = ethers.parseEther("1");
      await expect(escrow.connect(supplier).markShipped(id, EVIDENCE_HASH)).to.be.revertedWithCustomError(
        escrow,
        "InvalidState",
      );
      await expect(escrow.connect(buyer).anchorEvidence(id, KIND_DISPATCH, EVIDENCE_HASH)).to.be.revertedWithCustomError(
        escrow,
        "InvalidState",
      );
      await expect(escrow.connect(buyer).openDispute(id, one, one)).to.be.revertedWithCustomError(
        escrow,
        "InvalidState",
      );
      await expect(
        escrow.connect(buyer).approveSettlement(id, 0n, one, PROPOSAL_HASH),
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
      await expect(escrow.connect(buyer).executeSettlement(id)).to.be.revertedWithCustomError(escrow, "InvalidState");
      await expect(escrow.connect(buyer).releaseFull(id)).to.be.revertedWithCustomError(escrow, "InvalidState");
      await expect(escrow.connect(buyer).refundUnshipped(id)).to.be.revertedWithCustomError(escrow, "InvalidState");
      await expect(escrow.connect(supplier).claimUninspected(id)).to.be.revertedWithCustomError(
        escrow,
        "InvalidState",
      );
    });
  });

  describe("recipients that refuse payment", function () {
    it("cannot block a dispute, and can collect later through withdraw", async function () {
      const context = await deployFixture();
      const { ethers, escrow, buyer } = context;
      const hostile = await ethers.deployContract("RevertingReceiver");
      await hostile.waitForDeployment();
      const hostileAddress = await hostile.getAddress();

      const { id, deposit, delivery, dispatch } = await openEscrow(context, { supplier: hostileAddress });
      // the deposit could not be pushed, so it is credited instead
      expect(await escrow.owed(hostileAddress)).to.equal(deposit);
      await expectInvariants(context, [hostileAddress]);

      // the buyer can still open a dispute; the undisputed value is credited too
      const disputed = ethers.parseEther("4");
      const receipt = await (await escrow.connect(buyer).openDispute(id, disputed, disputed)).wait();
      const undisputed = dispatch + delivery - disputed;
      expect(eventArgs(escrow, receipt, "PaymentDeferred").amount).to.equal(undisputed);
      expect(await escrow.owed(hostileAddress)).to.equal(deposit + undisputed);
      expect((await escrow.getEscrow(id)).status).to.equal(STATUS.Disputed);
      await expectInvariants(context, [hostileAddress]);

      // while it still refuses BOT, withdraw fails and the credit survives
      const withdrawData = escrow.interface.encodeFunctionData("withdraw");
      await expect(hostile.execute(await escrow.getAddress(), withdrawData)).to.be.revertedWithCustomError(
        escrow,
        "WithdrawFailed",
      );
      expect(await escrow.owed(hostileAddress)).to.equal(deposit + undisputed);

      // once it accepts BOT, it collects everything at once
      await (await hostile.setAccepting(true)).wait();
      await (await hostile.execute(await escrow.getAddress(), withdrawData)).wait();
      expect(await ethers.provider.getBalance(hostileAddress)).to.equal(deposit + undisputed);
      expect(await escrow.owed(hostileAddress)).to.equal(0n);
      await expectInvariants(context, [hostileAddress]);

      // and cannot collect twice
      await expect(hostile.execute(await escrow.getAddress(), withdrawData)).to.be.revertedWithCustomError(
        escrow,
        "NothingToWithdraw",
      );
    });

    it("cannot re-enter through the capped-gas payout push", async function () {
      const context = await deployFixture();
      const { ethers, escrow, buyer } = context;
      const escrowAddress = await escrow.getAddress();
      const attacker = await ethers.deployContract("ReentrantReceiver", [escrowAddress]);
      await attacker.waitForDeployment();
      const attackerAddress = await attacker.getAddress();

      // the supplier tries to release its own dispatch milestone from inside the
      // deposit payout: a call it is genuinely entitled to make, just not re-entrantly
      await (
        await attacker.setReentryCall(escrow.interface.encodeFunctionData("markShipped", [1n, EVIDENCE_HASH]))
      ).wait();

      const { id, deposit, dispatch, delivery } = await openEscrow(context, { supplier: attackerAddress });
      expect(await attacker.reentered()).to.equal(false);
      expect((await escrow.getEscrow(id)).shipped).to.equal(false);
      expect(await ethers.provider.getBalance(attackerAddress)).to.equal(deposit);
      await expectInvariants(context);

      // same again on the undisputed payout during a claim
      const disputed = ethers.parseEther("4");
      await (await escrow.connect(buyer).openDispute(id, disputed, disputed)).wait();
      expect(await attacker.reentered()).to.equal(false);
      expect(await ethers.provider.getBalance(attackerAddress)).to.equal(deposit + dispatch + delivery - disputed);
      await expectInvariants(context);
    });

    it("cannot re-enter the escrow while a withdrawal is in flight", async function () {
      const context = await deployFixture();
      const { ethers, escrow } = context;
      const escrowAddress = await escrow.getAddress();
      const attacker = await ethers.deployContract("ReentrantReceiver", [escrowAddress]);
      await attacker.waitForDeployment();
      const attackerAddress = await attacker.getAddress();

      // Refuse the deposit first so the escrow owes it: withdraw() forwards ALL remaining
      // gas, unlike the 50,000-gas payout push, so the re-entered call below would really
      // succeed here if nonReentrant were absent. This is the test that pins the guard.
      await (await attacker.setRejecting(true)).wait();
      const { id, deposit, dispatch, delivery } = await openEscrow(context, { supplier: attackerAddress });
      expect(await escrow.owed(attackerAddress)).to.equal(deposit);

      await (await attacker.setRejecting(false)).wait();
      await (
        await attacker.setReentryCall(escrow.interface.encodeFunctionData("markShipped", [id, EVIDENCE_HASH]))
      ).wait();

      await (await attacker.execute(escrowAddress, escrow.interface.encodeFunctionData("withdraw"))).wait();

      // the withdrawal paid out, but the re-entered markShipped was refused,
      // so no dispatch milestone was released early
      expect(await attacker.reentered()).to.equal(false);
      const record = await escrow.getEscrow(id);
      expect(record.shipped).to.equal(false);
      expect(record.balance).to.equal(dispatch + delivery);
      expect(record.releasedAmount).to.equal(deposit);
      expect(await escrow.owed(attackerAddress)).to.equal(0n);
      expect(await ethers.provider.getBalance(attackerAddress)).to.equal(deposit);
      await expectInvariants(context);
    });
  });

  describe("the full lifecycle", function () {
    it("keeps both invariants true after every step", async function () {
      const context = await deployFixture();
      const { ethers, escrow, buyer, supplier } = context;
      const parties = [buyer.address, supplier.address];

      const { id, total } = await openEscrow(context);
      await expectInvariants(context, parties);

      await (await escrow.connect(supplier).markShipped(id, EVIDENCE_HASH)).wait();
      await expectInvariants(context, parties);

      await (await escrow.connect(buyer).anchorEvidence(id, KIND_DISPATCH, EVIDENCE_HASH)).wait();
      await expectInvariants(context, parties);

      const disputed = ethers.parseEther("3.6");
      await (await escrow.connect(buyer).openDispute(id, disputed, disputed)).wait();
      await expectInvariants(context, parties);

      const refund = ethers.parseEther("1.8");
      const release = disputed - refund;
      await (await escrow.connect(buyer).approveSettlement(id, refund, release, PROPOSAL_HASH)).wait();
      await expectInvariants(context, parties);

      await (await escrow.connect(supplier).approveSettlement(id, refund, release, PROPOSAL_HASH)).wait();
      await expectInvariants(context, parties);

      await (await escrow.connect(buyer).executeSettlement(id)).wait();
      await expectInvariants(context, parties);

      const record = await escrow.getEscrow(id);
      expect(record.status).to.equal(STATUS.Settled);
      expect(record.releasedAmount).to.equal(total - refund);
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(0n);
    });
  });
});
