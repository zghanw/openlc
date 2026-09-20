import { Contract, Interface, JsonRpcProvider, getAddress } from "ethers";
import { DomainError, type DisputeAggregate, type SettlementExecution } from "../domain/types.js";
import type { AcceptDeliveryInput, DeadlineSettlementInput, FundingInput, TradeOrder, TradeReleasePlan } from "../domain/trade-types.js";
import escrowAbiJson from "./openlc-escrow.abi.json" with { type: "json" };

const ESCROW_ABI = escrowAbiJson as unknown[];
const escrowInterface = new Interface(ESCROW_ABI as never);

/** Contract enum values (OpenLCEscrow.sol). */
const STATUS_SETTLED = 2;
const MODE_BUYER_CONFIRMATION = 0;
const MODE_REFUND_UNSHIPPED = 3;
const MODE_CLAIM_UNINSPECTED = 4;

const FUNDING_FAILED = "ESCROW_FUNDING_VERIFICATION_FAILED";
const FUNDING_UNAVAILABLE = "ESCROW_FUNDING_UNAVAILABLE";
const SETTLEMENT_FAILED = "ESCROW_SETTLEMENT_VERIFICATION_FAILED";
const SETTLEMENT_UNAVAILABLE = "ESCROW_SETTLEMENT_UNAVAILABLE";
const SETTLEMENT_INVALID = "INVALID_SETTLEMENT_EXECUTION";

// ---------------------------------------------------------------------------
// EscrowChainReader: a deliberately narrow read-only surface. It is the only
// way either verifier touches the network, so tests can swap in a fake and
// production wires the real RPC client below.
// ---------------------------------------------------------------------------

export interface EscrowLog {
  address: string;
  topics: readonly string[];
  data: string;
}

export interface EscrowTransactionReceipt {
  /** 1 success, 0 failure, matching eth_getTransactionReceipt. */
  status: number | null;
  blockNumber: number;
  logs: readonly EscrowLog[];
}

export interface EscrowTransaction {
  hash: string;
  from: string;
}

/** Mirrors OpenLCEscrow.Escrow (getEscrow output), amounts as decimal strings and seconds as numbers. */
export interface EscrowRecord {
  buyer: string;
  supplier: string;
  arbitrator: string;
  totalAmount: string;
  depositAmount: string;
  dispatchAmount: string;
  deliveryAmount: string;
  releasedAmount: string;
  balance: string;
  disputedAmount: string;
  requestedBuyerRefund: string;
  approvedBuyerRefund: string;
  approvedSupplierRelease: string;
  proposalHash: string;
  orderHash: string;
  dispatchEvidenceHash: string;
  orderReference: string;
  openedAt: number;
  deliveryDeadline: number;
  inspectionWindow: number;
  shippedAt: number;
  settledAt: number;
  status: number;
  mode: number;
  shipped: boolean;
  undisputedReleased: boolean;
  buyerApproved: boolean;
  supplierApproved: boolean;
  arbitratorApproved: boolean;
  settledBuyerRefund: string;
  settledSupplierRelease: string;
}

export interface EscrowChainReader {
  getTransactionReceipt(hash: string): Promise<EscrowTransactionReceipt | null>;
  getTransaction(hash: string): Promise<EscrowTransaction | null>;
  getEscrow(id: string): Promise<EscrowRecord>;
}

/** Reads BOT Chain directly. The only implementation that ever touches a real network. */
export class RpcEscrowChainReader implements EscrowChainReader {
  private readonly provider: JsonRpcProvider;
  private readonly contract: Contract;

  constructor(options: { rpcUrl: string; escrowAddress: string }) {
    this.provider = new JsonRpcProvider(options.rpcUrl);
    this.contract = new Contract(getAddress(options.escrowAddress), ESCROW_ABI as never, this.provider);
  }

  async getTransactionReceipt(hash: string): Promise<EscrowTransactionReceipt | null> {
    const receipt = await this.provider.getTransactionReceipt(hash);
    if (!receipt) return null;
    return {
      status: receipt.status,
      blockNumber: receipt.blockNumber,
      logs: receipt.logs.map((log) => ({ address: log.address, topics: log.topics, data: log.data })),
    };
  }

  async getTransaction(hash: string): Promise<EscrowTransaction | null> {
    const tx = await this.provider.getTransaction(hash);
    if (!tx) return null;
    return { hash: tx.hash, from: tx.from };
  }

  async getEscrow(id: string): Promise<EscrowRecord> {
    const raw = await this.contract.getFunction("getEscrow")(BigInt(id));
    return {
      buyer: raw.buyer, supplier: raw.supplier, arbitrator: raw.arbitrator,
      totalAmount: raw.totalAmount.toString(), depositAmount: raw.depositAmount.toString(),
      dispatchAmount: raw.dispatchAmount.toString(), deliveryAmount: raw.deliveryAmount.toString(),
      releasedAmount: raw.releasedAmount.toString(), balance: raw.balance.toString(),
      disputedAmount: raw.disputedAmount.toString(), requestedBuyerRefund: raw.requestedBuyerRefund.toString(),
      approvedBuyerRefund: raw.approvedBuyerRefund.toString(), approvedSupplierRelease: raw.approvedSupplierRelease.toString(),
      proposalHash: raw.proposalHash, orderHash: raw.orderHash, dispatchEvidenceHash: raw.dispatchEvidenceHash,
      orderReference: raw.orderReference,
      openedAt: Number(raw.openedAt), deliveryDeadline: Number(raw.deliveryDeadline), inspectionWindow: Number(raw.inspectionWindow),
      shippedAt: Number(raw.shippedAt), settledAt: Number(raw.settledAt),
      status: Number(raw.status), mode: Number(raw.mode),
      shipped: raw.shipped, undisputedReleased: raw.undisputedReleased,
      buyerApproved: raw.buyerApproved, supplierApproved: raw.supplierApproved, arbitratorApproved: raw.arbitratorApproved,
      settledBuyerRefund: raw.settledBuyerRefund.toString(), settledSupplierRelease: raw.settledSupplierRelease.toString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Shared low-level helpers. Each throws with the caller's DomainError code so
// one implementation can serve both verifiers below.
// ---------------------------------------------------------------------------

function address(value: string, field: string, code: string): string {
  try {
    return getAddress(value);
  } catch {
    throw new DomainError(code, `${field} is not a valid EVM address`, 400);
  }
}

function escrowIdOf(value: string, field: string, code: string): string {
  if (!/^[0-9]{1,78}$/.test(value)) throw new DomainError(code, `${field} is not a valid escrow id`, 400);
  return value;
}

function txHashOf(value: string, field: string, code: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new DomainError(code, `${field} is not a valid transaction hash`, 400);
  return value;
}

/** bytes32 fields decode from ethers as 0x-prefixed hex; the domain stores the bare hex digest. Compare on the same footing. */
function stripHexPrefix(value: string): string {
  return value.toLowerCase().replace(/^0x/, "");
}

function sameId(left: unknown, right: string): boolean {
  try {
    return BigInt(left as never) === BigInt(right);
  } catch {
    return false;
  }
}

/**
 * Finds the first log emitted by the configured escrow contract that decodes to the named event.
 * A log from any other address is skipped before it is ever parsed, so a correctly shaped event
 * from a lookalike contract can never satisfy a check.
 */
function decodeEvent(logs: readonly EscrowLog[], escrowAddress: string, name: string): any {
  for (const log of logs) {
    let logAddress: string;
    try {
      logAddress = getAddress(log.address);
    } catch {
      continue;
    }
    if (logAddress !== escrowAddress) continue;
    let parsed;
    try {
      parsed = escrowInterface.parseLog({ topics: log.topics, data: log.data });
    } catch {
      continue;
    }
    if (parsed && parsed.name === name) return parsed.args;
  }
  return undefined;
}

function defaultPlan(order: TradeOrder): TradeReleasePlan {
  return order.releasePlan ?? { depositUnits: "0", dispatchUnits: "0", deliveryUnits: order.amountUnits };
}

// ---------------------------------------------------------------------------
// EscrowFundingVerifier: same shape as the former SuiFundingVerifier, so
// TradeService and the trade routes need no changes beyond the import.
// ---------------------------------------------------------------------------

export interface FundingVerification {
  checkpoint?: string;
  deliveryDeadlineMs?: number;
  inspectionWindowMs?: number;
}

export interface DisputeOpenedInput {
  disputeTransactionDigest: string;
  disputedUnits: string;
  requestedBuyerUnits: string;
}

export interface EscrowFundingVerifier {
  verify(order: TradeOrder, funding: FundingInput): Promise<FundingVerification>;
  /** Confirms the supplier's markShipped transaction on the order's escrow. */
  verifyShipment?(order: TradeOrder, transactionDigest: string, evidenceSha256: string): Promise<{ checkpoint?: string; releasedUnits: string; remainingUnits: string }>;
  /** Confirms an anchorEvidence transaction carrying exactly this file hash. */
  verifyEvidenceAnchor?(order: TradeOrder, transactionDigest: string, sha256Hex: string): Promise<{ checkpoint?: string }>;
  /** Confirms the buyer's openDispute transaction, including the undisputed value it paid out. */
  verifyDisputeOpened?(order: TradeOrder, input: DisputeOpenedInput): Promise<{ checkpoint?: string; undisputedUnits: string }>;
  /** Confirms a releaseFull transaction paid the whole escrow to the supplier. */
  verifyFullRelease?(order: TradeOrder, acceptance: AcceptDeliveryInput): Promise<{ checkpoint?: string }>;
  /** Confirms a refundUnshipped or claimUninspected transaction settled the escrow. */
  verifyDeadlineSettlement?(order: TradeOrder, input: DeadlineSettlementInput): Promise<{ checkpoint?: string }>;
}

function failFunding(message: string, status = 422): never {
  throw new DomainError(FUNDING_FAILED, message, status);
}

export class EvmFundingVerifier implements EscrowFundingVerifier {
  private readonly escrowAddress: string;
  private readonly reader: EscrowChainReader;

  constructor(options: { escrowAddress: string; reader: EscrowChainReader }) {
    this.escrowAddress = address(options.escrowAddress, "escrowAddress", FUNDING_FAILED);
    this.reader = options.reader;
  }

  private async receiptOf(hash: string, what: string): Promise<EscrowTransactionReceipt> {
    let receipt: EscrowTransactionReceipt | null;
    try {
      receipt = await this.reader.getTransactionReceipt(hash);
    } catch {
      throw new DomainError(FUNDING_UNAVAILABLE, `Unable to read the ${what} transaction`, 502);
    }
    if (!receipt || receipt.status !== 1) failFunding(`The ${what} transaction was not successful`);
    return receipt;
  }

  private async senderOf(hash: string, what: string): Promise<string> {
    let tx: EscrowTransaction | null;
    try {
      tx = await this.reader.getTransaction(hash);
    } catch {
      throw new DomainError(FUNDING_UNAVAILABLE, `Unable to read the ${what} transaction`, 502);
    }
    if (!tx) failFunding(`The ${what} transaction was not found`);
    return address(tx.from, "tx.from", FUNDING_FAILED);
  }

  private event(receipt: EscrowTransactionReceipt, name: string): any {
    const found = decodeEvent(receipt.logs, this.escrowAddress, name);
    if (!found) failFunding(`${name} event is missing from the transaction`);
    return found;
  }

  private async confirmSettled(id: string, expectedMode: number, expectedBuyerRefund: string, expectedSupplierRelease: string): Promise<void> {
    let record: EscrowRecord;
    try {
      record = await this.reader.getEscrow(id);
    } catch {
      throw new DomainError(FUNDING_UNAVAILABLE, "Unable to read the escrow record", 502);
    }
    if (
      record.status !== STATUS_SETTLED ||
      record.mode !== expectedMode ||
      record.settledBuyerRefund !== expectedBuyerRefund ||
      record.settledSupplierRelease !== expectedSupplierRelease
    ) {
      failFunding("The escrow record does not confirm this settlement");
    }
  }

  private funded(order: TradeOrder) {
    if (!order.funding) failFunding("The order has no verified escrow funding", 409);
    return {
      escrowId: escrowIdOf(order.funding.escrowObjectId, "escrowObjectId", FUNDING_FAILED),
      buyer: address(order.funding.buyerAddress, "buyerAddress", FUNDING_FAILED),
      supplier: address(order.funding.supplierAddress, "supplierAddress", FUNDING_FAILED),
      // Only ever compared for equality against a fresh digest, so it is not reformatted here.
      fundingHash: order.funding.transactionDigest,
    };
  }

  async verify(order: TradeOrder, funding: FundingInput): Promise<FundingVerification> {
    const hash = txHashOf(funding.transactionDigest, "transactionDigest", FUNDING_FAILED);
    const id = escrowIdOf(funding.escrowObjectId, "escrowObjectId", FUNDING_FAILED);
    const buyer = address(funding.buyerAddress, "buyerAddress", FUNDING_FAILED);
    const supplier = address(funding.supplierAddress, "supplierAddress", FUNDING_FAILED);
    const arbitrator = address(funding.arbitratorAddress, "arbitratorAddress", FUNDING_FAILED);
    if (address(funding.packageId, "packageId", FUNDING_FAILED) !== this.escrowAddress) {
      failFunding("The escrow contract is not the configured deployment", 400);
    }

    const receipt = await this.receiptOf(hash, "funding");
    const sender = await this.senderOf(hash, "funding");
    if (sender !== buyer) failFunding("Funding sender does not match the buyer wallet");

    const created = this.event(receipt, "EscrowCreated");
    if (
      !sameId(created.id, id) ||
      address(created.buyer, "EscrowCreated.buyer", FUNDING_FAILED) !== buyer ||
      address(created.supplier, "EscrowCreated.supplier", FUNDING_FAILED) !== supplier ||
      address(created.arbitrator, "EscrowCreated.arbitrator", FUNDING_FAILED) !== arbitrator
    ) {
      failFunding("EscrowCreated parties or object do not match the order");
    }
    if (
      created.amount.toString() !== order.amountUnits ||
      created.orderReference !== order.reference ||
      stripHexPrefix(created.orderHash) !== stripHexPrefix(order.orderHash)
    ) {
      failFunding("EscrowCreated amount, order reference, or order hash does not match the order");
    }
    const plan = defaultPlan(order);
    if (
      created.deposit.toString() !== plan.depositUnits ||
      created.dispatch.toString() !== plan.dispatchUnits ||
      created.delivery.toString() !== plan.deliveryUnits
    ) {
      failFunding("EscrowCreated release plan does not match the confirmed order");
    }
    const deliveryDeadlineMs = Number(created.deliveryDeadline) * 1000;
    const inspectionWindowMs = Number(created.inspectionWindow) * 1000;
    if (funding.deliveryDeadlineMs !== undefined && deliveryDeadlineMs !== funding.deliveryDeadlineMs) {
      failFunding("EscrowCreated delivery deadline does not match the recorded deadline");
    }
    if (funding.inspectionWindowMs !== undefined && inspectionWindowMs !== funding.inspectionWindowMs) {
      failFunding("EscrowCreated inspection window does not match the recorded window");
    }
    return { checkpoint: String(receipt.blockNumber), deliveryDeadlineMs, inspectionWindowMs };
  }

  async verifyShipment(order: TradeOrder, transactionDigest: string, evidenceSha256: string): Promise<{ checkpoint?: string; releasedUnits: string; remainingUnits: string }> {
    const { escrowId: id, supplier, fundingHash } = this.funded(order);
    const hash = txHashOf(transactionDigest, "transactionDigest", FUNDING_FAILED);
    if (hash === fundingHash) failFunding("The shipment transaction must be distinct from the funding transaction");
    const receipt = await this.receiptOf(hash, "shipment");
    const sender = await this.senderOf(hash, "shipment");
    if (sender !== supplier) failFunding("Shipment was not signed by the supplier wallet");
    const shipped = this.event(receipt, "Shipped");
    if (!sameId(shipped.id, id) || address(shipped.supplier, "Shipped.supplier", FUNDING_FAILED) !== supplier) {
      failFunding("Shipped event does not match the order's escrow");
    }
    const plan = defaultPlan(order);
    const expectedHash = stripHexPrefix(evidenceSha256);
    if (stripHexPrefix(shipped.evidenceHash) !== expectedHash) failFunding("Shipment evidence does not match the anchored dispatch document");
    if (shipped.releasedAmount.toString() !== plan.dispatchUnits || shipped.remainingAmount.toString() !== plan.deliveryUnits) {
      failFunding("Shipment release does not match the confirmed release plan");
    }
    return { checkpoint: String(receipt.blockNumber), releasedUnits: plan.dispatchUnits, remainingUnits: plan.deliveryUnits };
  }

  async verifyEvidenceAnchor(order: TradeOrder, transactionDigest: string, sha256Hex: string): Promise<{ checkpoint?: string }> {
    const { escrowId: id, buyer, supplier } = this.funded(order);
    const hash = txHashOf(transactionDigest, "anchorTransactionDigest", FUNDING_FAILED);
    const receipt = await this.receiptOf(hash, "evidence anchor");
    const sender = await this.senderOf(hash, "evidence anchor");
    if (sender !== buyer && sender !== supplier) failFunding("The evidence was not anchored by a party to the escrow");
    const expectedHash = stripHexPrefix(sha256Hex);
    const anchored = decodeEvent(receipt.logs, this.escrowAddress, "EvidenceAnchored");
    const anchorMatch = Boolean(anchored && sameId(anchored.id, id) && stripHexPrefix(anchored.evidenceHash) === expectedHash);
    let shippedMatch = false;
    if (!anchorMatch) {
      const shipped = decodeEvent(receipt.logs, this.escrowAddress, "Shipped");
      shippedMatch = Boolean(shipped && sameId(shipped.id, id) && stripHexPrefix(shipped.evidenceHash) === expectedHash);
    }
    if (!anchorMatch && !shippedMatch) failFunding("No shipment or evidence event in that transaction carries this file's hash for the order's escrow");
    return { checkpoint: String(receipt.blockNumber) };
  }

  async verifyDisputeOpened(order: TradeOrder, input: DisputeOpenedInput): Promise<{ checkpoint?: string; undisputedUnits: string }> {
    const { escrowId: id, buyer, supplier, fundingHash } = this.funded(order);
    const hash = txHashOf(input.disputeTransactionDigest, "disputeTransactionDigest", FUNDING_FAILED);
    if (hash === fundingHash) failFunding("The dispute transaction must be distinct from the funding transaction");
    const receipt = await this.receiptOf(hash, "dispute");
    const sender = await this.senderOf(hash, "dispute");
    if (sender !== buyer) failFunding("The dispute was not signed by the buyer wallet");
    const opened = this.event(receipt, "DisputeOpened");
    if (
      !sameId(opened.id, id) ||
      opened.disputedAmount.toString() !== input.disputedUnits ||
      opened.requestedBuyerRefund.toString() !== input.requestedBuyerUnits
    ) {
      failFunding("DisputeOpened amounts do not match the claim");
    }
    const released = this.event(receipt, "UndisputedReleased");
    const remaining = BigInt(order.releasePlan?.deliveryUnits ?? order.amountUnits);
    const expected = (remaining - BigInt(input.disputedUnits)).toString();
    if (
      !sameId(released.id, id) ||
      address(released.supplier, "UndisputedReleased.supplier", FUNDING_FAILED) !== supplier ||
      released.amount.toString() !== expected
    ) {
      failFunding("The claim transaction did not release the undisputed value to the supplier");
    }
    return { checkpoint: String(receipt.blockNumber), undisputedUnits: expected };
  }

  async verifyFullRelease(order: TradeOrder, acceptance: AcceptDeliveryInput): Promise<{ checkpoint?: string }> {
    const { escrowId: id, buyer, fundingHash } = this.funded(order);
    const hash = txHashOf(acceptance.transactionDigest, "transactionDigest", FUNDING_FAILED);
    if (hash === fundingHash) failFunding("The release transaction must be distinct from the funding transaction");
    const receipt = await this.receiptOf(hash, "release");
    const sender = await this.senderOf(hash, "release");
    if (sender !== buyer) failFunding("The release was not signed by the buyer wallet");
    // releaseFull shares the contract's private _settle helper with every other settlement path, so
    // it unconditionally emits SettlementExecuted too. Decoding it from this specific receipt (via
    // decodeEvent, so the lookalike-address guard applies) proves this transaction hash is the one
    // that actually released the funds, not merely some other buyer-signed transaction.
    const executed = this.event(receipt, "SettlementExecuted");
    if (!sameId(executed.id, id) || Number(executed.mode) !== MODE_BUYER_CONFIRMATION || executed.buyerRefund.toString() !== "0") {
      failFunding("SettlementExecuted does not describe a full release to the supplier");
    }
    // releaseFull is legal before or after shipment, so the amount released varies with how much was
    // already paid out in milestones; anchor the event's own figure against the escrow record instead
    // of hardcoding an expected total.
    await this.confirmSettled(id, MODE_BUYER_CONFIRMATION, "0", executed.supplierRelease.toString());
    return { checkpoint: String(receipt.blockNumber) };
  }

  async verifyDeadlineSettlement(order: TradeOrder, input: DeadlineSettlementInput): Promise<{ checkpoint?: string }> {
    const { escrowId: id, buyer, supplier, fundingHash } = this.funded(order);
    const hash = txHashOf(input.transactionDigest, "transactionDigest", FUNDING_FAILED);
    if (hash === fundingHash) failFunding("The settlement transaction must be distinct from the funding transaction");
    const receipt = await this.receiptOf(hash, "deadline settlement");
    const refund = input.kind === "refund_unshipped";
    const expectedMode = refund ? MODE_REFUND_UNSHIPPED : MODE_CLAIM_UNINSPECTED;
    const expectedSigner = refund ? buyer : supplier;
    const sender = await this.senderOf(hash, "deadline settlement");
    if (sender !== expectedSigner) failFunding(`The ${input.kind} transaction was not signed by the ${refund ? "buyer" : "supplier"} wallet`);
    const executed = this.event(receipt, "SettlementExecuted");
    if (!sameId(executed.id, id) || Number(executed.mode) !== expectedMode) failFunding("SettlementExecuted does not describe this deadline settlement");
    const plan = defaultPlan(order);
    // Refunding an unshipped order returns dispatch+delivery (deposit was already paid at funding
    // time); claiming an uninspected delivery pays only delivery (dispatch already paid at shipment).
    // Using the always-defaulted plan for both branches folds the no-releasePlan case in automatically.
    const total = refund
      ? (BigInt(plan.dispatchUnits) + BigInt(plan.deliveryUnits)).toString()
      : plan.deliveryUnits;
    const expectedBuyerRefund = refund ? total : "0";
    const expectedSupplierRelease = refund ? "0" : total;
    if (executed.buyerRefund.toString() !== expectedBuyerRefund || executed.supplierRelease.toString() !== expectedSupplierRelease) {
      failFunding("The deadline settlement did not move the whole escrow to the entitled party");
    }
    await this.confirmSettled(id, expectedMode, expectedBuyerRefund, expectedSupplierRelease);
    return { checkpoint: String(receipt.blockNumber) };
  }
}

// ---------------------------------------------------------------------------
// EscrowSettlementVerifier: same shape as the former SuiSettlementVerifier,
// used by the dispute settlement-execution route.
// ---------------------------------------------------------------------------

export interface SettlementExecutionProof {
  transactionDigest: string;
  packageId: string;
  escrowObjectId: string;
  receiptObjectId?: string;
}

export interface EscrowSettlementVerifier {
  verify(dispute: DisputeAggregate, proof: SettlementExecutionProof): Promise<Omit<SettlementExecution, "verifiedAt">>;
}

function failSettlement(code: string, message: string, status = 422): never {
  throw new DomainError(code, message, status);
}

export class EvmSettlementVerifier implements EscrowSettlementVerifier {
  private readonly escrowAddress: string;
  private readonly reader: EscrowChainReader;

  constructor(options: { escrowAddress: string; reader: EscrowChainReader }) {
    this.escrowAddress = address(options.escrowAddress, "escrowAddress", SETTLEMENT_INVALID);
    this.reader = options.reader;
  }

  private async receiptOf(hash: string, what: string): Promise<EscrowTransactionReceipt> {
    let receipt: EscrowTransactionReceipt | null;
    try {
      receipt = await this.reader.getTransactionReceipt(hash);
    } catch {
      throw new DomainError(SETTLEMENT_UNAVAILABLE, `Unable to read the ${what} transaction`, 502);
    }
    if (!receipt || receipt.status !== 1) failSettlement(SETTLEMENT_FAILED, `The ${what} transaction was not successful`);
    return receipt;
  }

  private async senderOf(hash: string, what: string): Promise<string> {
    let tx: EscrowTransaction | null;
    try {
      tx = await this.reader.getTransaction(hash);
    } catch {
      throw new DomainError(SETTLEMENT_UNAVAILABLE, `Unable to read the ${what} transaction`, 502);
    }
    if (!tx) failSettlement(SETTLEMENT_FAILED, `The ${what} transaction was not found`);
    return address(tx.from, "tx.from", SETTLEMENT_INVALID);
  }

  async verify(dispute: DisputeAggregate, proof: SettlementExecutionProof): Promise<Omit<SettlementExecution, "verifiedAt">> {
    const binding = dispute.onchainEscrow;
    if (!binding) failSettlement("ONCHAIN_BINDING_REQUIRED", "The dispute is not bound to a verified escrow", 409);
    const agreement = dispute.settlement;
    if (!agreement || agreement.executionStatus !== "pending_on_chain") {
      failSettlement(SETTLEMENT_FAILED, "The dispute has no pending off-chain settlement agreement");
    }

    const contractAddress = address(proof.packageId, "packageId", SETTLEMENT_INVALID);
    const bindingContractAddress = address(binding.packageId, "onchainEscrow.packageId", SETTLEMENT_INVALID);
    const id = escrowIdOf(proof.escrowObjectId, "escrowObjectId", SETTLEMENT_INVALID);
    const bindingId = escrowIdOf(binding.escrowObjectId, "onchainEscrow.escrowObjectId", SETTLEMENT_INVALID);
    if (contractAddress !== this.escrowAddress || contractAddress !== bindingContractAddress) {
      failSettlement(SETTLEMENT_FAILED, "The proof references a contract outside the configured escrow deployment", 400);
    }
    if (!sameId(id, bindingId)) failSettlement(SETTLEMENT_FAILED, "The proof escrow does not match the dispute binding", 400);

    const settlementHash = txHashOf(proof.transactionDigest, "transactionDigest", SETTLEMENT_INVALID);
    const fundingHash = binding.fundingTransactionDigest;
    const disputeHash = binding.disputeTransactionDigest;
    if (new Set([fundingHash, disputeHash, settlementHash]).size !== 3) {
      failSettlement(SETTLEMENT_FAILED, "Funding, dispute, and settlement transactions must be distinct");
    }

    const buyer = address(binding.buyerAddress, "onchainEscrow.buyerAddress", SETTLEMENT_INVALID);
    const supplier = address(binding.supplierAddress, "onchainEscrow.supplierAddress", SETTLEMENT_INVALID);
    const arbitrator = address(binding.arbitratorAddress, "onchainEscrow.arbitratorAddress", SETTLEMENT_INVALID);
    if (new Set([buyer, supplier, arbitrator]).size !== 3) {
      failSettlement(SETTLEMENT_FAILED, "The bound escrow parties must be distinct");
    }

    const fundingReceipt = await this.receiptOf(fundingHash, "funding");
    const fundingSender = await this.senderOf(fundingHash, "funding");
    const created = decodeEvent(fundingReceipt.logs, this.escrowAddress, "EscrowCreated");
    if (
      !created ||
      !sameId(created.id, id) ||
      address(created.buyer, "EscrowCreated.buyer", SETTLEMENT_INVALID) !== buyer ||
      address(created.supplier, "EscrowCreated.supplier", SETTLEMENT_INVALID) !== supplier ||
      address(created.arbitrator, "EscrowCreated.arbitrator", SETTLEMENT_INVALID) !== arbitrator ||
      fundingSender !== buyer ||
      created.orderReference !== dispute.tradeTerms.orderReference ||
      created.amount.toString() !== dispute.totalEscrowUnits
    ) {
      failSettlement(SETTLEMENT_FAILED, "The funding transaction does not match the dispute escrow binding");
    }

    const disputeReceipt = await this.receiptOf(disputeHash, "dispute");
    const disputeSender = await this.senderOf(disputeHash, "dispute");
    const opened = decodeEvent(disputeReceipt.logs, this.escrowAddress, "DisputeOpened");
    if (
      !opened ||
      !sameId(opened.id, id) ||
      disputeSender !== buyer ||
      opened.disputedAmount.toString() !== dispute.disputedUnits ||
      opened.requestedBuyerRefund.toString() !== dispute.requestedBuyerUnits
    ) {
      failSettlement(SETTLEMENT_FAILED, "The dispute transaction does not match the off-chain dispute");
    }

    // executeSettlement may be called by anyone once both approvals are in, so unlike the other
    // steps there is no single expected signer for the settlement transaction itself.
    const settlementReceipt = await this.receiptOf(settlementHash, "settlement");
    const executed = decodeEvent(settlementReceipt.logs, this.escrowAddress, "SettlementExecuted");
    if (
      !executed ||
      !sameId(executed.id, id) ||
      address(executed.buyer, "SettlementExecuted.buyer", SETTLEMENT_INVALID) !== buyer ||
      address(executed.supplier, "SettlementExecuted.supplier", SETTLEMENT_INVALID) !== supplier
    ) {
      failSettlement(SETTLEMENT_FAILED, "The settlement transaction does not reference the bound escrow");
    }
    const buyerRefund = BigInt(executed.buyerRefund);
    const supplierRelease = BigInt(executed.supplierRelease);
    const disputedUnits = BigInt(dispute.disputedUnits);
    const requestedBuyerUnits = BigInt(dispute.requestedBuyerUnits);
    const agreedBuyerRefund = BigInt(agreement.buyerUnits);
    const agreedSupplierRelease = BigInt(agreement.supplierUnits);
    const expectedProposalHash = agreement.proposalHash ? stripHexPrefix(agreement.proposalHash) : undefined;
    if (
      buyerRefund !== agreedBuyerRefund ||
      supplierRelease !== agreedSupplierRelease ||
      buyerRefund > requestedBuyerUnits ||
      buyerRefund + supplierRelease !== disputedUnits ||
      (expectedProposalHash !== undefined && stripHexPrefix(executed.proposalHash) !== expectedProposalHash)
    ) {
      failSettlement(SETTLEMENT_FAILED, "The settlement transaction does not conserve or bind the disputed funds");
    }

    let record: EscrowRecord;
    try {
      record = await this.reader.getEscrow(id);
    } catch {
      throw new DomainError(SETTLEMENT_UNAVAILABLE, "Unable to read the escrow record", 502);
    }
    if (
      record.status !== STATUS_SETTLED ||
      record.settledBuyerRefund !== buyerRefund.toString() ||
      record.settledSupplierRelease !== supplierRelease.toString()
    ) {
      failSettlement(SETTLEMENT_FAILED, "The escrow record does not confirm this settlement");
    }

    return {
      transactionDigest: settlementHash,
      packageId: contractAddress,
      escrowObjectId: id,
      // The settled escrow record itself is the receipt on EVM; its id stands in for the object
      // Sui used to create separately (SettlementExecution.receiptObjectId is dropped in a later rename).
      receiptObjectId: id,
      checkpoint: String(settlementReceipt.blockNumber),
    };
  }
}
