import { describe, expect, it } from "vitest";
import { Interface } from "ethers";
import escrowAbiJson from "../src/integrations/openlc-escrow.abi.json" with { type: "json" };
import {
  EvmFundingVerifier,
  EvmSettlementVerifier,
  type EscrowChainReader,
  type EscrowLog,
  type EscrowRecord,
  type EscrowTransaction,
  type EscrowTransactionReceipt,
} from "../src/integrations/evm-escrow.js";
import { openDispute } from "../src/domain/dispute-machine.js";
import type { FundingInput, TradeOrder } from "../src/domain/trade-types.js";
import { buyer, controlledContext, openInput } from "./fixtures.js";

const iface = new Interface(escrowAbiJson as never);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ESCROW = `0x${"1".repeat(40)}`;
const LOOKALIKE = `0x${"9".repeat(40)}`;
const BUYER_ADDR = `0x${"a".repeat(40)}`;
const SUPPLIER_ADDR = `0x${"b".repeat(40)}`;
const ARBITRATOR_ADDR = `0x${"c".repeat(40)}`;
const ORDER_HASH = "07".repeat(32);
const FILE_HASH = "03".repeat(32);
const OTHER_FILE_HASH = "04".repeat(32);
const PROPOSAL_HASH = "09".repeat(32);
const DEADLINE = 1_800_000_000; // seconds
const WINDOW = 7 * 24 * 60 * 60; // seconds

const FUNDING_TX = `0x${"1".repeat(64)}`;
const SHIPMENT_TX = `0x${"2".repeat(64)}`;
const ANCHOR_TX = `0x${"3".repeat(64)}`;
const DISPUTE_TX = `0x${"4".repeat(64)}`;
const RELEASE_TX = `0x${"5".repeat(64)}`;
const SETTLEMENT_TX = `0x${"6".repeat(64)}`;
const DEADLINE_TX = `0x${"7".repeat(64)}`;

function log(address: string, name: string, values: unknown[]): EscrowLog {
  const { data, topics } = iface.encodeEventLog(name, values);
  return { address, topics, data };
}

function receipt(logs: EscrowLog[], blockNumber = 42, status = 1): EscrowTransactionReceipt {
  return { status, blockNumber, logs };
}

/** Drives every verifier method through this fake; no network call is ever made. */
class FakeReader implements EscrowChainReader {
  private readonly receipts = new Map<string, EscrowTransactionReceipt>();
  private readonly txs = new Map<string, EscrowTransaction>();
  private readonly escrows = new Map<string, EscrowRecord>();

  setReceipt(hash: string, value: EscrowTransactionReceipt): this {
    this.receipts.set(hash, value);
    return this;
  }
  setSender(hash: string, from: string): this {
    this.txs.set(hash, { hash, from });
    return this;
  }
  setEscrow(id: string, record: EscrowRecord): this {
    this.escrows.set(id, record);
    return this;
  }
  async getTransactionReceipt(hash: string): Promise<EscrowTransactionReceipt | null> {
    return this.receipts.get(hash) ?? null;
  }
  async getTransaction(hash: string): Promise<EscrowTransaction | null> {
    return this.txs.get(hash) ?? null;
  }
  async getEscrow(id: string): Promise<EscrowRecord> {
    const record = this.escrows.get(id);
    if (!record) throw new Error(`no fake escrow registered for id ${id}`);
    return record;
  }
}

function baseEscrowRecord(overrides: Partial<EscrowRecord> = {}): EscrowRecord {
  return {
    buyer: BUYER_ADDR, supplier: SUPPLIER_ADDR, arbitrator: ARBITRATOR_ADDR,
    totalAmount: "100000", depositAmount: "10000", dispatchAmount: "20000", deliveryAmount: "70000",
    releasedAmount: "30000", balance: "70000", disputedAmount: "0", requestedBuyerRefund: "0",
    approvedBuyerRefund: "0", approvedSupplierRelease: "0", proposalHash: `0x${"0".repeat(64)}`,
    orderHash: `0x${ORDER_HASH}`, dispatchEvidenceHash: `0x${FILE_HASH}`, orderReference: "ORDER-100",
    openedAt: 1_700_000_000, deliveryDeadline: DEADLINE, inspectionWindow: WINDOW, shippedAt: 1_700_100_000, settledAt: 0,
    status: 0, mode: 0, shipped: true, undisputedReleased: false,
    buyerApproved: false, supplierApproved: false, arbitratorApproved: false,
    settledBuyerRefund: "0", settledSupplierRelease: "0",
    ...overrides,
  };
}

function order(overrides: Partial<TradeOrder> = {}): TradeOrder {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", reference: "ORDER-100",
    buyerId: "11111111-1111-4111-8111-111111111111", supplierId: "22222222-2222-4222-8222-222222222222",
    arbitratorId: "33333333-3333-4333-8333-333333333333", supplierEmail: "s@example.com", supplierName: "Supplier",
    assetType: "BOT", amountUnits: "100000", orderHash: ORDER_HASH, description: "Industrial pump",
    deliveryDate: "2026-09-04", deliveryLocation: "PJ",
    lineItems: [{ id: "1", description: "Pump", quantity: "1", unit: "unit", unitPriceUnits: "100000" }],
    releasePlan: { depositUnits: "10000", dispatchUnits: "20000", deliveryUnits: "70000" },
    status: "supplier_confirmed", version: 0,
    createdAt: "2026-08-31T00:00:00.000Z", updatedAt: "2026-08-31T00:00:00.000Z",
    ...overrides,
  };
}

function fundedOrder(overrides: Partial<TradeOrder> = {}): TradeOrder {
  return order({
    status: "funded",
    funding: {
      packageId: ESCROW, escrowObjectId: "1", transactionDigest: FUNDING_TX,
      buyerAddress: BUYER_ADDR, supplierAddress: SUPPLIER_ADDR, arbitratorAddress: ARBITRATOR_ADDR,
      verificationStatus: "verified_on_chain", fundedAt: "2026-08-31T00:00:00.000Z",
      deliveryDeadlineMs: DEADLINE * 1000, inspectionWindowMs: WINDOW * 1000,
    },
    ...overrides,
  });
}

const funding: FundingInput = {
  packageId: ESCROW, escrowObjectId: "1", transactionDigest: FUNDING_TX,
  buyerAddress: BUYER_ADDR, supplierAddress: SUPPLIER_ADDR, arbitratorAddress: ARBITRATOR_ADDR,
  deliveryDeadlineMs: DEADLINE * 1000, inspectionWindowMs: WINDOW * 1000,
};

function escrowCreatedLog(addr: string, overrides: Record<string, unknown> = {}) {
  const v = {
    id: "1", buyer: BUYER_ADDR, supplier: SUPPLIER_ADDR, arbitrator: ARBITRATOR_ADDR,
    amount: "100000", orderHash: `0x${ORDER_HASH}`, orderReference: "ORDER-100",
    deliveryDeadline: DEADLINE, inspectionWindow: WINDOW, deposit: "10000", dispatch: "20000", delivery: "70000",
    ...overrides,
  };
  return log(addr, "EscrowCreated", [v.id, v.buyer, v.supplier, v.arbitrator, v.amount, v.orderHash, v.orderReference, v.deliveryDeadline, v.inspectionWindow, v.deposit, v.dispatch, v.delivery]);
}

function fundingReader(overrides: Record<string, unknown> = {}, addr: string = ESCROW): FakeReader {
  return new FakeReader()
    .setReceipt(FUNDING_TX, receipt([escrowCreatedLog(addr, overrides)]))
    .setSender(FUNDING_TX, BUYER_ADDR);
}

// ---------------------------------------------------------------------------
// EvmFundingVerifier.verify (funding)
// ---------------------------------------------------------------------------

describe("EvmFundingVerifier.verify (funding)", () => {
  it("verifies EscrowCreated end to end and returns the deadlines in milliseconds", async () => {
    const verifier = new EvmFundingVerifier({ escrowAddress: ESCROW, reader: fundingReader() });
    await expect(verifier.verify(order(), funding)).resolves.toMatchObject({
      checkpoint: "42", deliveryDeadlineMs: DEADLINE * 1000, inspectionWindowMs: WINDOW * 1000,
    });
  });

  it("rejects a receipt that failed on-chain (status 0)", async () => {
    const reader = new FakeReader().setReceipt(FUNDING_TX, receipt([escrowCreatedLog(ESCROW)], 42, 0)).setSender(FUNDING_TX, BUYER_ADDR);
    const verifier = new EvmFundingVerifier({ escrowAddress: ESCROW, reader });
    await expect(verifier.verify(order(), funding)).rejects.toMatchObject({ code: "ESCROW_FUNDING_VERIFICATION_FAILED" });
  });

  it("rejects when tx.from is not the buyer", async () => {
    const reader = fundingReader().setSender(FUNDING_TX, SUPPLIER_ADDR);
    const verifier = new EvmFundingVerifier({ escrowAddress: ESCROW, reader });
    await expect(verifier.verify(order(), funding)).rejects.toMatchObject({ code: "ESCROW_FUNDING_VERIFICATION_FAILED" });
  });

  it("refuses a correctly-shaped EscrowCreated log emitted by a lookalike contract", async () => {
    const reader = new FakeReader().setReceipt(FUNDING_TX, receipt([escrowCreatedLog(LOOKALIKE)])).setSender(FUNDING_TX, BUYER_ADDR);
    const verifier = new EvmFundingVerifier({ escrowAddress: ESCROW, reader });
    await expect(verifier.verify(order(), funding)).rejects.toMatchObject({ code: "ESCROW_FUNDING_VERIFICATION_FAILED" });
  });

  it("rejects a wrong amount, a release plan that disagrees with the order, a wrong order hash, or a wrong order reference", async () => {
    const verify = (overrides: Record<string, unknown>) => new EvmFundingVerifier({ escrowAddress: ESCROW, reader: fundingReader(overrides) }).verify(order(), funding);
    await expect(verify({ amount: "999" })).rejects.toMatchObject({ code: "ESCROW_FUNDING_VERIFICATION_FAILED" });
    await expect(verify({ deposit: "5000", dispatch: "25000" })).rejects.toMatchObject({ code: "ESCROW_FUNDING_VERIFICATION_FAILED" });
    await expect(verify({ orderHash: `0x${"ff".repeat(32)}` })).rejects.toMatchObject({ code: "ESCROW_FUNDING_VERIFICATION_FAILED" });
    await expect(verify({ orderReference: "SOME-OTHER-ORDER" })).rejects.toMatchObject({ code: "ESCROW_FUNDING_VERIFICATION_FAILED" });
  });
});

// ---------------------------------------------------------------------------
// EvmFundingVerifier.verifyShipment
// ---------------------------------------------------------------------------

function shippedLog(addr: string, overrides: Record<string, unknown> = {}) {
  const v = { id: "1", supplier: SUPPLIER_ADDR, evidenceHash: `0x${FILE_HASH}`, releasedAmount: "20000", remainingAmount: "70000", ...overrides };
  return log(addr, "Shipped", [v.id, v.supplier, v.evidenceHash, v.releasedAmount, v.remainingAmount]);
}

describe("EvmFundingVerifier.verifyShipment", () => {
  it("verifies the supplier's Shipped event and rejects a mismatched evidence hash or an unsigned-by-supplier sender", async () => {
    const okReader = new FakeReader().setReceipt(SHIPMENT_TX, receipt([shippedLog(ESCROW)])).setSender(SHIPMENT_TX, SUPPLIER_ADDR);
    const verifier = new EvmFundingVerifier({ escrowAddress: ESCROW, reader: okReader });
    await expect(verifier.verifyShipment(fundedOrder(), SHIPMENT_TX, FILE_HASH)).resolves.toMatchObject({ checkpoint: "42", releasedUnits: "20000", remainingUnits: "70000" });

    const wrongHashReader = new FakeReader().setReceipt(SHIPMENT_TX, receipt([shippedLog(ESCROW)])).setSender(SHIPMENT_TX, SUPPLIER_ADDR);
    await expect(new EvmFundingVerifier({ escrowAddress: ESCROW, reader: wrongHashReader }).verifyShipment(fundedOrder(), SHIPMENT_TX, OTHER_FILE_HASH))
      .rejects.toMatchObject({ code: "ESCROW_FUNDING_VERIFICATION_FAILED" });

    const wrongSignerReader = new FakeReader().setReceipt(SHIPMENT_TX, receipt([shippedLog(ESCROW)])).setSender(SHIPMENT_TX, BUYER_ADDR);
    await expect(new EvmFundingVerifier({ escrowAddress: ESCROW, reader: wrongSignerReader }).verifyShipment(fundedOrder(), SHIPMENT_TX, FILE_HASH))
      .rejects.toMatchObject({ code: "ESCROW_FUNDING_VERIFICATION_FAILED" });
  });
});

// ---------------------------------------------------------------------------
// EvmFundingVerifier.verifyEvidenceAnchor
// ---------------------------------------------------------------------------

function evidenceAnchoredLog(addr: string, overrides: Record<string, unknown> = {}) {
  const v = { id: "1", party: BUYER_ADDR, kind: 2, evidenceHash: `0x${FILE_HASH}`, ...overrides };
  return log(addr, "EvidenceAnchored", [v.id, v.party, v.kind, v.evidenceHash]);
}

describe("EvmFundingVerifier.verifyEvidenceAnchor", () => {
  it("verifies an anchor only when an event for this escrow carries the file's hash", async () => {
    const reader = new FakeReader().setReceipt(ANCHOR_TX, receipt([evidenceAnchoredLog(ESCROW)])).setSender(ANCHOR_TX, BUYER_ADDR);
    const verifier = new EvmFundingVerifier({ escrowAddress: ESCROW, reader });
    await expect(verifier.verifyEvidenceAnchor(fundedOrder(), ANCHOR_TX, FILE_HASH)).resolves.toMatchObject({ checkpoint: "42" });
    // The anchor transaction happened, but no event in it carries this particular file's hash.
    await expect(verifier.verifyEvidenceAnchor(fundedOrder(), ANCHOR_TX, OTHER_FILE_HASH)).rejects.toMatchObject({ code: "ESCROW_FUNDING_VERIFICATION_FAILED" });
  });
});

// ---------------------------------------------------------------------------
// EvmFundingVerifier.verifyDisputeOpened
// ---------------------------------------------------------------------------

function disputeOpenedLog(addr: string, overrides: Record<string, unknown> = {}) {
  const v = { id: "1", disputedAmount: "30000", requestedBuyerRefund: "20000", ...overrides };
  return log(addr, "DisputeOpened", [v.id, v.disputedAmount, v.requestedBuyerRefund]);
}
function undisputedReleasedLog(addr: string, overrides: Record<string, unknown> = {}) {
  const v = { id: "1", supplier: SUPPLIER_ADDR, amount: "40000", ...overrides };
  return log(addr, "UndisputedReleased", [v.id, v.supplier, v.amount]);
}

describe("EvmFundingVerifier.verifyDisputeOpened", () => {
  it("confirms the undisputed value paid to the supplier, rejects a wrong amount, and requires a distinct funding hash", async () => {
    const input = { disputeTransactionDigest: DISPUTE_TX, disputedUnits: "30000", requestedBuyerUnits: "20000" };
    const okReader = new FakeReader()
      .setReceipt(DISPUTE_TX, receipt([disputeOpenedLog(ESCROW), undisputedReleasedLog(ESCROW, { amount: "40000" })]))
      .setSender(DISPUTE_TX, BUYER_ADDR);
    const verifier = new EvmFundingVerifier({ escrowAddress: ESCROW, reader: okReader });
    await expect(verifier.verifyDisputeOpened(fundedOrder(), input)).resolves.toMatchObject({ checkpoint: "42", undisputedUnits: "40000" });

    const wrongReader = new FakeReader()
      .setReceipt(DISPUTE_TX, receipt([disputeOpenedLog(ESCROW), undisputedReleasedLog(ESCROW, { amount: "1" })]))
      .setSender(DISPUTE_TX, BUYER_ADDR);
    await expect(new EvmFundingVerifier({ escrowAddress: ESCROW, reader: wrongReader }).verifyDisputeOpened(fundedOrder(), input))
      .rejects.toMatchObject({ code: "ESCROW_FUNDING_VERIFICATION_FAILED" });

    // The dispute transaction must be distinct from the funding transaction.
    await expect(verifier.verifyDisputeOpened(fundedOrder(), { ...input, disputeTransactionDigest: FUNDING_TX }))
      .rejects.toMatchObject({ code: "ESCROW_FUNDING_VERIFICATION_FAILED" });
  });
});

// ---------------------------------------------------------------------------
// EvmFundingVerifier.verifyFullRelease
// ---------------------------------------------------------------------------

describe("EvmFundingVerifier.verifyFullRelease", () => {
  it("confirms the release via getEscrow and rejects a wrong signer or an escrow that isn't settled yet", async () => {
    const settled = baseEscrowRecord({ status: 2, mode: 0, settledBuyerRefund: "0", settledSupplierRelease: "70000" });
    const okReader = new FakeReader().setReceipt(RELEASE_TX, receipt([])).setSender(RELEASE_TX, BUYER_ADDR).setEscrow("1", settled);
    await expect(new EvmFundingVerifier({ escrowAddress: ESCROW, reader: okReader }).verifyFullRelease(fundedOrder(), { transactionDigest: RELEASE_TX }))
      .resolves.toMatchObject({ checkpoint: "42" });

    const wrongSignerReader = new FakeReader().setReceipt(RELEASE_TX, receipt([])).setSender(RELEASE_TX, SUPPLIER_ADDR).setEscrow("1", settled);
    await expect(new EvmFundingVerifier({ escrowAddress: ESCROW, reader: wrongSignerReader }).verifyFullRelease(fundedOrder(), { transactionDigest: RELEASE_TX }))
      .rejects.toMatchObject({ code: "ESCROW_FUNDING_VERIFICATION_FAILED" });

    const stillOpenReader = new FakeReader().setReceipt(RELEASE_TX, receipt([])).setSender(RELEASE_TX, BUYER_ADDR).setEscrow("1", baseEscrowRecord({ status: 0 }));
    await expect(new EvmFundingVerifier({ escrowAddress: ESCROW, reader: stillOpenReader }).verifyFullRelease(fundedOrder(), { transactionDigest: RELEASE_TX }))
      .rejects.toMatchObject({ code: "ESCROW_FUNDING_VERIFICATION_FAILED" });
  });
});

// ---------------------------------------------------------------------------
// EvmFundingVerifier.verifyDeadlineSettlement
// ---------------------------------------------------------------------------

function settlementExecutedLog(addr: string, overrides: Record<string, unknown> = {}) {
  const v = { id: "1", buyer: BUYER_ADDR, supplier: SUPPLIER_ADDR, buyerRefund: "0", supplierRelease: "70000", proposalHash: `0x${"0".repeat(64)}`, mode: 4, ...overrides };
  return log(addr, "SettlementExecuted", [v.id, v.buyer, v.supplier, v.buyerRefund, v.supplierRelease, v.proposalHash, v.mode]);
}

describe("EvmFundingVerifier.verifyDeadlineSettlement", () => {
  it("verifies a supplier claim or a buyer refund via getEscrow, and rejects the wrong mode or a signer who isn't entitled", async () => {
    const claimSettled = baseEscrowRecord({ status: 2, mode: 4, settledBuyerRefund: "0", settledSupplierRelease: "70000" });
    const claimReader = new FakeReader()
      .setReceipt(DEADLINE_TX, receipt([settlementExecutedLog(ESCROW, { mode: 4, buyerRefund: "0", supplierRelease: "70000" })]))
      .setSender(DEADLINE_TX, SUPPLIER_ADDR)
      .setEscrow("1", claimSettled);
    await expect(new EvmFundingVerifier({ escrowAddress: ESCROW, reader: claimReader }).verifyDeadlineSettlement(fundedOrder(), { kind: "claim_uninspected", transactionDigest: DEADLINE_TX }))
      .resolves.toMatchObject({ checkpoint: "42" });

    // dispatch (20000) + delivery (70000) return to the buyer on an unshipped refund.
    const refundSettled = baseEscrowRecord({ status: 2, mode: 3, settledBuyerRefund: "90000", settledSupplierRelease: "0" });
    const refundReader = new FakeReader()
      .setReceipt(DEADLINE_TX, receipt([settlementExecutedLog(ESCROW, { mode: 3, buyerRefund: "90000", supplierRelease: "0" })]))
      .setSender(DEADLINE_TX, BUYER_ADDR)
      .setEscrow("1", refundSettled);
    await expect(new EvmFundingVerifier({ escrowAddress: ESCROW, reader: refundReader }).verifyDeadlineSettlement(fundedOrder(), { kind: "refund_unshipped", transactionDigest: DEADLINE_TX }))
      .resolves.toMatchObject({ checkpoint: "42" });

    // ClaimUninspected (mode 4) presented as a refund_unshipped (which expects mode 3).
    const wrongModeReader = new FakeReader()
      .setReceipt(DEADLINE_TX, receipt([settlementExecutedLog(ESCROW, { mode: 4, buyerRefund: "0", supplierRelease: "70000" })]))
      .setSender(DEADLINE_TX, BUYER_ADDR)
      .setEscrow("1", claimSettled);
    await expect(new EvmFundingVerifier({ escrowAddress: ESCROW, reader: wrongModeReader }).verifyDeadlineSettlement(fundedOrder(), { kind: "refund_unshipped", transactionDigest: DEADLINE_TX }))
      .rejects.toMatchObject({ code: "ESCROW_FUNDING_VERIFICATION_FAILED" });

    // claim_uninspected must be signed by the supplier, not the buyer.
    const wrongSignerReader = new FakeReader()
      .setReceipt(DEADLINE_TX, receipt([settlementExecutedLog(ESCROW, { mode: 4, buyerRefund: "0", supplierRelease: "70000" })]))
      .setSender(DEADLINE_TX, BUYER_ADDR)
      .setEscrow("1", claimSettled);
    await expect(new EvmFundingVerifier({ escrowAddress: ESCROW, reader: wrongSignerReader }).verifyDeadlineSettlement(fundedOrder(), { kind: "claim_uninspected", transactionDigest: DEADLINE_TX }))
      .rejects.toMatchObject({ code: "ESCROW_FUNDING_VERIFICATION_FAILED" });
  });
});

// ---------------------------------------------------------------------------
// EvmSettlementVerifier.verify (dispute settlement execution)
// ---------------------------------------------------------------------------

function settlementFundingLog(addr: string = ESCROW) {
  return log(addr, "EscrowCreated", ["1", BUYER_ADDR, SUPPLIER_ADDR, ARBITRATOR_ADDR, "100000", `0x${ORDER_HASH}`, "ORDER-100", DEADLINE, WINDOW, "10000", "20000", "70000"]);
}
function settlementDisputeLog(addr: string = ESCROW) {
  return log(addr, "DisputeOpened", ["1", "30000", "20000"]);
}
function settlementExecutedLogFor(addr: string, buyerRefund: string, supplierRelease: string, proposalHash: string) {
  return log(addr, "SettlementExecuted", ["1", BUYER_ADDR, SUPPLIER_ADDR, buyerRefund, supplierRelease, proposalHash, 1]);
}

function fullSettlementReader(options: { buyerRefund?: string; supplierRelease?: string; proposalHash?: string; escrowStatus?: number } = {}): FakeReader {
  const buyerRefund = options.buyerRefund ?? "12000";
  const supplierRelease = options.supplierRelease ?? "18000";
  const proposalHash = options.proposalHash ?? `0x${PROPOSAL_HASH}`;
  return new FakeReader()
    .setReceipt(FUNDING_TX, receipt([settlementFundingLog()]))
    .setSender(FUNDING_TX, BUYER_ADDR)
    .setReceipt(DISPUTE_TX, receipt([settlementDisputeLog()]))
    .setSender(DISPUTE_TX, BUYER_ADDR)
    .setReceipt(SETTLEMENT_TX, receipt([settlementExecutedLogFor(ESCROW, buyerRefund, supplierRelease, proposalHash)]))
    .setEscrow("1", baseEscrowRecord({ status: options.escrowStatus ?? 2, settledBuyerRefund: buyerRefund, settledSupplierRelease: supplierRelease }));
}

function settlementDispute(overrides: { buyerUnits?: string; supplierUnits?: string; proposalHash?: string } = {}) {
  const control = controlledContext();
  const dispute = openDispute(openInput({
    onchainEscrow: {
      packageId: ESCROW, escrowObjectId: "1", fundingTransactionDigest: FUNDING_TX, disputeTransactionDigest: DISPUTE_TX,
      buyerAddress: BUYER_ADDR, supplierAddress: SUPPLIER_ADDR, arbitratorAddress: ARBITRATOR_ADDR,
    },
  }), buyer, control.ctx);
  dispute.status = "settlement_pending";
  dispute.settlement = {
    buyerUnits: overrides.buyerUnits ?? "12000", supplierUnits: overrides.supplierUnits ?? "18000",
    source: "mutual_proposal", proposalId: "00000000-0000-4000-8000-000000000099",
    agreementId: "00000000-0000-4000-8000-000000000098", evidenceBundleHash: "a".repeat(64),
    agreedAt: "2026-08-31T00:00:00.000Z", executionStatus: "pending_on_chain",
    proposalHash: overrides.proposalHash ?? PROPOSAL_HASH,
  };
  return dispute;
}

const settlementProof = { transactionDigest: SETTLEMENT_TX, packageId: ESCROW, escrowObjectId: "1" };

describe("EvmSettlementVerifier.verify (dispute settlement)", () => {
  it("verifies the complete escrow lifecycle and the exact allocation", async () => {
    const verifier = new EvmSettlementVerifier({ escrowAddress: ESCROW, reader: fullSettlementReader() });
    await expect(verifier.verify(settlementDispute(), settlementProof)).resolves.toMatchObject({
      transactionDigest: SETTLEMENT_TX, packageId: ESCROW, escrowObjectId: "1", checkpoint: "42",
    });
  });

  it("requires an on-chain binding before allowing settlement confirmation", async () => {
    const dispute = { ...settlementDispute(), onchainEscrow: undefined };
    const verifier = new EvmSettlementVerifier({ escrowAddress: ESCROW, reader: fullSettlementReader() });
    await expect(verifier.verify(dispute, settlementProof)).rejects.toMatchObject({ code: "ONCHAIN_BINDING_REQUIRED" });
  });

  it("rejects a settlement whose split does not conserve the disputed amount", async () => {
    // 12000 + 17000 = 29000, but the dispute holds 30000 — both the agreement and the (matching) on-chain event fail to conserve it.
    const dispute = settlementDispute({ buyerUnits: "12000", supplierUnits: "17000" });
    const reader = fullSettlementReader({ buyerRefund: "12000", supplierRelease: "17000" });
    const verifier = new EvmSettlementVerifier({ escrowAddress: ESCROW, reader });
    await expect(verifier.verify(dispute, settlementProof)).rejects.toMatchObject({ code: "ESCROW_SETTLEMENT_VERIFICATION_FAILED" });
  });

  it("rejects a settlement whose proposalHash differs from the agreed one", async () => {
    const dispute = settlementDispute({ proposalHash: "ff".repeat(32) });
    const verifier = new EvmSettlementVerifier({ escrowAddress: ESCROW, reader: fullSettlementReader() });
    await expect(verifier.verify(dispute, settlementProof)).rejects.toMatchObject({ code: "ESCROW_SETTLEMENT_VERIFICATION_FAILED" });
  });

  it("rejects when the escrow record does not yet report status Settled", async () => {
    const verifier = new EvmSettlementVerifier({ escrowAddress: ESCROW, reader: fullSettlementReader({ escrowStatus: 1 }) });
    await expect(verifier.verify(settlementDispute(), settlementProof)).rejects.toMatchObject({ code: "ESCROW_SETTLEMENT_VERIFICATION_FAILED" });
  });

  it("rejects funding, dispute, and settlement transactions that are not all distinct", async () => {
    const dispute = settlementDispute();
    dispute.onchainEscrow!.disputeTransactionDigest = FUNDING_TX;
    const verifier = new EvmSettlementVerifier({ escrowAddress: ESCROW, reader: fullSettlementReader() });
    await expect(verifier.verify(dispute, settlementProof)).rejects.toMatchObject({ code: "ESCROW_SETTLEMENT_VERIFICATION_FAILED" });
  });
});
