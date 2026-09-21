"use client";

import { Contract, Interface, JsonRpcProvider, sha256, toUtf8Bytes, type ContractTransactionReceipt, type LogDescription } from "ethers";
import ESCROW_ABI from "@/lib/openlc-escrow.abi.json";
import { BOTCHAIN, ESCROW_ADDRESS, ESCROW_DEPLOY_BLOCK, explorerTxUrl, requireEscrowConfigured } from "@/lib/chain";
import { describeTxError, isSameAddress, shortAddress, useWallet } from "@/lib/wallet";
import type { DocumentKind, InspectionLine } from "@/lib/demo-orders";
import { confirmClaimExecution, disputeToClaim, type DisputeRecord, type EvidenceFileInput } from "@/lib/dispute-actions";
import {
  acceptLiveDelivery, type AcceptanceInput,
  ARBITRATOR_NOT_CONFIGURED_REASON, arbitratorConfigured, DEFAULT_ARBITRATOR_ADDRESS,
  type DeadlineSettlementInput, markLiveShipment, settleLiveDeadline, toUnits, viewLiveOrder,
} from "@/lib/live-orders";
import { apiRequest, loadSession, type TradeOrder } from "@/lib/payproof-api";

/** Inspection window written into every escrow, matching DP-2.1 of the Dispute Resolution Policy. */
export const INSPECTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Evidence kinds as the contract records them. */
const EVIDENCE_KIND: Record<DocumentKind, number> = {
  internal_agreement: 0, purchase_order: 1, dispatch_evidence: 2, delivery_evidence: 3, inspection_evidence: 4, claim_evidence: 5,
};

/** The delivery deadline the escrow enforces: end of the agreed delivery date in Malaysia, and
 *  never less than a day away so a same-day order can still be funded. Contract timestamps are
 *  seconds; this stays in milliseconds and callers convert at the chain-call boundary. */
export function deliveryDeadlineMs(deliveryDate: string, now = Date.now()): number {
  const endOfDay = Date.parse(`${deliveryDate}T23:59:59+08:00`);
  const floor = now + 24 * 60 * 60 * 1000;
  return Number.isFinite(endOfDay) && endOfDay > floor ? endOfDay : floor;
}

export type ClaimInput = {
  disputedValue: number; requestedValue: number; claim: string; evidence: string; files?: EvidenceFileInput[];
  inspection?: { lines: InspectionLine[]; note?: string };
};

/** A payment request as encoded in a merchant's QR code. Direct wallet-to-wallet payments outside
 *  an escrow have no BOT Chain equivalent (payproof::pay was not ported, see spec.md), so nothing
 *  in this file signs one any more - this only keeps the QR scan/preview screen's shape intact. */
export type PaymentRequest = {
  v: 1;
  network: "sui:testnet";
  to: string;
  merchant: string;
  amount: string;
  currency: string;
  coinType: string;
  reference: string;
  session: string;
};

const WALLET_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Parses the text behind a payment QR and rejects anything that is not a well-formed request. */
export function parsePaymentRequest(text: string): PaymentRequest {
  let raw: Partial<PaymentRequest>;
  try { raw = JSON.parse(text.trim()) as Partial<PaymentRequest>; } catch { throw new Error("That is not a PayProof payment request."); }
  if (raw.v !== 1 || raw.network !== "sui:testnet") throw new Error("This payment request is for a different network or version.");
  if (typeof raw.to !== "string" || !WALLET_ADDRESS.test(raw.to)) throw new Error("The payment request has no valid recipient address.");
  const amount = Number(raw.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("The payment request has no valid amount.");
  if (typeof raw.coinType !== "string" || !raw.coinType.includes("::")) throw new Error("The payment request has no valid coin type.");
  const reference = String(raw.reference ?? "").trim();
  if (!reference || new TextEncoder().encode(reference).length > 128) throw new Error("The payment reference must be between 1 and 128 bytes.");
  return {
    v: 1, network: "sui:testnet", to: raw.to, merchant: String(raw.merchant ?? "").slice(0, 120), amount: String(raw.amount), currency: String(raw.currency ?? ""),
    coinType: raw.coinType, reference, session: String(raw.session ?? "").slice(0, 64),
  };
}

function asBytes32(hex: string, what = "The value"): string {
  const clean = hex.replace(/^0x/, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) throw new Error(`${what} must be a 32-byte hex value.`);
  return `0x${clean}`;
}

/** One plain-English sentence per custom error the contract can revert with, replacing the old
 *  Move abort-code table. Keys are exactly the error names in web/lib/openlc-escrow.abi.json. */
const CUSTOM_ERROR_MESSAGES: Record<string, string> = {
  Unauthorized: "You are not authorized to perform this action on this escrow.",
  InvalidState: "This escrow is not in a state that allows this action right now — it may already be disputed or settled. Refresh the order and try again.",
  AlreadyShipped: "Shipment was already marked on-chain for this escrow. This order is behind the chain — refresh and try again.",
  DeadlineNotReached: "The delivery deadline written into the escrow has not passed yet.",
  NotShipped: "Shipment was never marked on-chain, so this escrow cannot be claimed as uninspected.",
  InvalidDispute: "The disputed amount must be greater than zero and cannot exceed the escrow's remaining balance.",
  InvalidAllocation: "The buyer refund cannot exceed the requested amount, and the buyer refund plus supplier release must add up to the disputed amount exactly.",
  ApprovalMismatch: "Your approval does not match the allocation the other party or the arbitrator already signed. Confirm the exact same split before signing.",
  ApprovalRequired: "This settlement needs either the arbitrator's approval, or both the buyer's and the supplier's approval, before it can execute.",
  FundsNotReady: "The escrow's on-chain balance does not match what this action expects. Refresh the order and try again.",
  InvalidReleasePlan: "The deposit, dispatch and delivery amounts must add up to the full escrow value.",
  InvalidParties: "The buyer, supplier and arbitrator must be three different wallet addresses, and none can be the zero address.",
  InvalidDeadline: "The delivery deadline must be in the future and the inspection window must be greater than zero.",
  InvalidEvidenceHash: "The evidence hash cannot be empty.",
  InvalidProposalHash: "The settlement proposal hash cannot be empty.",
  UnknownEscrow: "No escrow exists with this ID on BOT Chain. Refresh and try again.",
  NothingToWithdraw: "There are no deferred funds for this wallet to withdraw.",
  WithdrawFailed: "The withdrawal transfer failed. Try again, or contact support if this persists.",
  ZeroAmount: "The escrow amount must be greater than zero.",
  EmptyReference: "The order reference cannot be empty.",
  ReferenceTooLong: "The order reference is too long (128 bytes maximum).",
  InvalidOrderHash: "The order hash cannot be empty.",
  ReentrancyGuardReentrantCall: "The contract rejected an overlapping call. Wait for the current transaction to finish, then try again.",
};

const escrowInterface = new Interface(ESCROW_ABI);

/** Extracts a decoded custom-error name from a failed call, trying ethers' own decoding first
 *  (populated on CALL_EXCEPTION when the Contract's ABI recognizes the revert) and falling back
 *  to decoding the raw revert data ourselves, wherever the provider tucked it away. */
function decodedErrorName(err: unknown): string | undefined {
  const anyErr = err as { revert?: { name?: string } | null; data?: unknown; info?: { error?: { data?: unknown } }; error?: { data?: unknown } };
  if (anyErr?.revert?.name) return anyErr.revert.name;
  const data = anyErr?.data ?? anyErr?.info?.error?.data ?? anyErr?.error?.data;
  if (typeof data === "string" && /^0x[0-9a-fA-F]{8,}$/.test(data)) {
    try {
      const parsed = escrowInterface.parseError(data);
      if (parsed) return parsed.name;
    } catch {
      /* not one of this contract's custom errors */
    }
  }
  return undefined;
}

export function describeEscrowError(err: unknown): string {
  const name = decodedErrorName(err);
  if (name && CUSTOM_ERROR_MESSAGES[name]) return CUSTOM_ERROR_MESSAGES[name];
  return describeTxError(err);
}

/** Thrown by sendTx: carries both the human message (for display) and the raw decoded error name
 *  (so callers like withRecording can tell "already moved on-chain" apart from other failures). */
class EscrowTxError extends Error {
  constructor(message: string, public readonly errorName?: string) {
    super(message);
  }
}

function findEvent(receipt: ContractTransactionReceipt, name: string): LogDescription | undefined {
  for (const log of receipt.logs) {
    try {
      const parsed = escrowInterface.parseLog(log);
      if (parsed?.name === name) return parsed;
    } catch {
      /* a log from another contract in the same block; skip */
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Chain-succeeded-but-recording-failed recovery.
//
// Several actions call the contract and then POST the result to the API to "record" it. If that
// POST fails after the chain call already confirmed, retrying the button would normally re-sign
// the same contract call - which reverts once the chain has already moved past that step
// (AlreadyShipped, InvalidState, ...), so the order could never be recorded from the UI at all.
//
// The fix: immediately after the chain call confirms and before the POST, save a pending record
// to localStorage keyed by order + action. The next attempt checks for that record FIRST and, if
// present, skips the contract call entirely and only retries the POST - no re-signing.
// ---------------------------------------------------------------------------

type PendingAction = "markShipped" | "acceptDelivery" | "refundUnshipped" | "claimUninspected" | "openClaim";
type PendingRecord = { orderId: string; action: PendingAction; txHash: string; payload: unknown };

const PENDING_PREFIX = "openlc_pending_action:";
const pendingKey = (orderId: string, action: PendingAction) => `${PENDING_PREFIX}${orderId}:${action}`;

function loadPending(orderId: string, action: PendingAction): PendingRecord | null {
  try {
    const raw = localStorage.getItem(pendingKey(orderId, action));
    return raw ? (JSON.parse(raw) as PendingRecord) : null;
  } catch {
    return null;
  }
}

function savePending(record: PendingRecord): void {
  try {
    localStorage.setItem(pendingKey(record.orderId, record.action), JSON.stringify(record));
  } catch {
    /* localStorage unavailable (private browsing, quota) - the recovery net just won't persist */
  }
}

function clearPending(orderId: string, action: PendingAction): void {
  try {
    localStorage.removeItem(pendingKey(orderId, action));
  } catch {
    /* ignore */
  }
}

function recordingFailedError(txHash: string, cause: unknown): Error {
  const reason = cause instanceof Error ? cause.message : String(cause);
  return new Error(
    `This step completed on BOT Chain in transaction ${txHash} (${explorerTxUrl(txHash)}), but recording it here failed: ${reason}. Nothing is lost — press this action again to finish recording it, without signing again.`,
  );
}

function stuckNoRecordError(escrowId: string): Error {
  return new Error(
    `Escrow #${escrowId} may have already moved on BOT Chain, but this device has no local record of it to finish recording automatically (perhaps this step was done on a different browser or device). Do not sign this step again. Contact support with the escrow id above so it can be recorded from the chain directly.`,
  );
}

/** Runs one "chain call, then record it with the API" action with the recovery net described
 *  above. The pending-record check runs FIRST, before `preflight` (so a retry recovers even if,
 *  say, the wallet is no longer connected - finishing the recording never needs a signature).
 *  `preflight` only runs on a fresh attempt and should throw for any precondition a real contract
 *  call needs (a connected wallet, required inputs, ...). `alreadyMovedErrorNames` names the
 *  custom error(s) that mean "this step already happened on-chain" for this action, so a revert
 *  with no local record produces a clear explanation instead of the generic (and, here,
 *  misleading - "refresh and try again" does not help) decoded message. */
async function withRecording<T, P>(
  orderId: string,
  action: PendingAction,
  escrowId: string,
  preflight: () => void,
  runChain: () => Promise<string>,
  buildPayload: (txHash: string) => P,
  post: (payload: P) => Promise<T>,
  alreadyMovedErrorNames: string[],
): Promise<T> {
  const pending = loadPending(orderId, action);
  if (pending) {
    try {
      const result = await post(pending.payload as P);
      clearPending(orderId, action);
      return result;
    } catch (cause) {
      throw recordingFailedError(pending.txHash, cause);
    }
  }

  preflight();
  let txHash: string;
  try {
    txHash = await runChain();
  } catch (chainError) {
    const name = chainError instanceof EscrowTxError ? chainError.errorName : undefined;
    if (name && alreadyMovedErrorNames.includes(name)) throw stuckNoRecordError(escrowId);
    throw chainError;
  }

  const payload = buildPayload(txHash);
  savePending({ orderId, action, txHash, payload });
  try {
    const result = await post(payload);
    clearPending(orderId, action);
    return result;
  } catch (cause) {
    throw recordingFailedError(txHash, cause);
  }
}

/** A read-only escrow contract against the public RPC - works with no wallet connected, for the
 *  on-chain recovery lookups below (they must succeed even if MetaMask is briefly unavailable). */
function readOnlyEscrow(): Contract {
  return new Contract(ESCROW_ADDRESS, ESCROW_ABI, new JsonRpcProvider(BOTCHAIN.rpcUrl));
}

/** openClaim's fallback when there is no local pending record but openDispute reverted
 *  InvalidState: read the escrow straight from the chain, and if it is genuinely Disputed,
 *  search backwards for the DisputeOpened transaction (RPC log ranges are capped, so this scans
 *  bounded 5,000-block windows and gives up after 40 of them - about 200,000 blocks). Returns the
 *  ON-CHAIN disputed/requested amounts, never the user's freshly typed numbers, since the backend
 *  verifier checks the POST against the chain and a mismatch there would reject the recording. */
async function recoverDisputeOpened(escrowId: bigint): Promise<{ txHash: string; disputedUnits: string; requestedUnits: string } | null> {
  try {
    const contract = readOnlyEscrow();
    const escrow = await contract.getEscrow(escrowId);
    if (Number(escrow.status) !== 1) return null; // Status: Open=0, Disputed=1, Settled=2 - not actually disputed
    const provider = contract.runner as JsonRpcProvider;
    const latest = await provider.getBlockNumber();
    const filter = contract.filters.DisputeOpened(escrowId);
    const WINDOW = 5000;
    const MAX_WINDOWS = 40;
    let to = latest;
    for (let i = 0; i < MAX_WINDOWS && to >= ESCROW_DEPLOY_BLOCK; i++) {
      const from = Math.max(ESCROW_DEPLOY_BLOCK, to - WINDOW + 1);
      const logs = await contract.queryFilter(filter, from, to);
      if (logs.length > 0) {
        const log = logs[logs.length - 1];
        return { txHash: log.transactionHash, disputedUnits: escrow.disputedAmount.toString(), requestedUnits: escrow.requestedBuyerRefund.toString() };
      }
      to = from - 1;
    }
    return null;
  } catch {
    return null;
  }
}

function disputePostPayload(txHash: string, disputedUnits: string, requestedUnits: string, input: ClaimInput) {
  return {
    disputeTransactionDigest: txHash, disputedUnits, requestedBuyerUnits: requestedUnits,
    claim: input.claim, evidenceStatement: input.evidence, evidenceFiles: input.files,
    negotiationDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), maxHumanRounds: 3,
    inspection: input.inspection ? { lines: input.inspection.lines.map((line) => ({ lineId: line.lineId, accepted: String(line.accepted), missing: String(line.missing), damaged: String(line.damaged) })), note: input.inspection.note } : undefined,
  };
}

/**
 * Every escrow action that sends a transaction, on ethers against BOT Chain. Same hook name and
 * function signatures as the Sui version so every caller keeps compiling.
 */
export function useEscrowActions() {
  const wallet = useWallet();

  // True once a connected wallet stops matching the address that signed the API session in - the
  // UI uses this to disable chain-action buttons up front, on top of the fail-closed throw below.
  const sessionAddress = loadSession()?.suiAddress;
  const sessionMismatch = Boolean(wallet.account && sessionAddress) && !isSameAddress(wallet.account, sessionAddress);

  /** Fails closed if the connected wallet no longer matches the wallet that signed the API
   *  session in (switching MetaMask accounts after sign-in must not let a transaction go out
   *  signed by the wrong party while the backend still thinks the old address is acting). */
  function requireWalletMatchesSession(account: string): void {
    if (sessionAddress && !isSameAddress(account, sessionAddress)) {
      throw new Error(`You switched wallets. Sign in again as ${shortAddress(account)} to continue.`);
    }
  }

  async function contract(): Promise<Contract> {
    requireEscrowConfigured();
    const signer = await wallet.getSigner();
    requireWalletMatchesSession(wallet.account!);
    return new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
  }

  /** Sends one write call, waits for the receipt, and turns a revert into a plain-English message. */
  async function sendTx(method: string, args: unknown[], value?: bigint): Promise<ContractTransactionReceipt> {
    try {
      const c = await contract();
      const tx = value !== undefined ? await c[method](...args, { value }) : await c[method](...args);
      const receipt = await tx.wait();
      if (!receipt) throw new Error("The transaction did not confirm. Check your wallet and try again.");
      return receipt as ContractTransactionReceipt;
    } catch (cause) {
      throw new EscrowTxError(describeEscrowError(cause), decodedErrorName(cause));
    }
  }

  async function fundEscrow(order: TradeOrder): Promise<TradeOrder> {
    if (!wallet.account) throw new Error("Connect MetaMask before funding escrow.");
    if (!order.supplierId || !order.buyerId) throw new Error("Both parties must confirm the order before it can be funded.");
    if (!order.supplierWalletAddress) throw new Error("The supplier has not attached a payout address yet.");
    // Orders created before the arbitrator wallet was recorded fall back to the configured arbitrator.
    if (!order.arbitratorWalletAddress && !arbitratorConfigured) throw new Error(ARBITRATOR_NOT_CONFIGURED_REASON);
    const arbitrator = order.arbitratorWalletAddress || DEFAULT_ARBITRATOR_ADDRESS;
    const deadlineMs = deliveryDeadlineMs(order.deliveryDate);
    // Seconds on-chain, milliseconds everywhere else - converted exactly once, here.
    const deadlineSec = BigInt(Math.floor(deadlineMs / 1000));
    const inspectionSec = BigInt(Math.floor(INSPECTION_WINDOW_MS / 1000));
    const total = BigInt(order.amountUnits);
    const releasePlan = order.releasePlan;
    const deposit = releasePlan ? BigInt(releasePlan.depositUnits) : 0n;
    const dispatch = releasePlan ? BigInt(releasePlan.dispatchUnits) : 0n;
    const delivery = releasePlan ? BigInt(releasePlan.deliveryUnits) : total;

    const receipt = await sendTx(
      "createEscrow",
      [order.supplierWalletAddress, arbitrator, order.orderHash, order.reference, deposit, dispatch, delivery, deadlineSec, inspectionSec],
      total,
    );
    const created = findEvent(receipt, "EscrowCreated");
    const escrowId = created?.args.id as bigint | undefined;
    if (escrowId === undefined)
      throw new Error("Escrow funded, but the EscrowCreated event was not found in the transaction receipt. Refresh and try again.");

    // fundEscrow keeps its own bespoke "do not fund again" message rather than the generic
    // recovery net above: retrying createEscrow would create a SECOND escrow and pay again,
    // not revert, so the fix here is "never retry the chain call", not "skip it and retry the POST".
    try {
      return await apiRequest<TradeOrder>(`/v1/orders/${order.id}/funding`, {
        method: "POST",
        body: JSON.stringify({
          // packageId/escrowObjectId/transactionDigest keep their old field names (a later task
          // renames them); the values are now EVM-shaped: a contract address, a decimal escrow id,
          // and a 0x tx hash. Deadlines stay in milliseconds in the API payload.
          packageId: ESCROW_ADDRESS, escrowObjectId: escrowId.toString(), transactionDigest: receipt.hash,
          buyerAddress: wallet.account, supplierAddress: order.supplierWalletAddress, arbitratorAddress: arbitrator,
          deliveryDeadlineMs: deadlineMs, inspectionWindowMs: INSPECTION_WINDOW_MS,
        }),
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`Your funds are secured on BOT Chain in escrow #${escrowId.toString()}, transaction ${receipt.hash}, but recording it here failed: ${reason}. Do not fund again, that would lock a second payment. Keep these two references.`);
    }
  }

  /** Supplier marks shipment on the escrow, then records the shipment (carrier/tracking) against
   *  the order. A retry after the chain call succeeds but the recording fails does NOT re-sign -
   *  see withRecording above. */
  async function markShipped(
    order: TradeOrder,
    evidenceSha256: string,
    shipment: { carrier: string; trackingNumber: string; dispatchedAt: string; expectedAt?: string },
  ) {
    if (!order.funding) throw new Error("Only a funded order can be shipped.");
    const escrowId = order.funding.escrowObjectId;
    return withRecording(
      order.id, "markShipped", escrowId,
      () => {
        if (!wallet.account) throw new Error("Connect MetaMask before marking shipment.");
        if (!evidenceSha256) throw new Error("Attach a carrier receipt or dispatch note before releasing the dispatch payment.");
      },
      async () => (await sendTx("markShipped", [BigInt(escrowId), asBytes32(evidenceSha256, "The evidence hash")])).hash,
      (txHash): typeof shipment & { transactionDigest: string; evidenceSha256: string } => ({ ...shipment, transactionDigest: txHash, evidenceSha256 }),
      (payload) => markLiveShipment(order.id, payload),
      ["AlreadyShipped"],
    );
  }

  /** Either party binds a file's SHA-256 to the escrow. Returns the transaction to record with the upload. */
  async function anchorEvidence(order: TradeOrder, kind: DocumentKind, sha256Hex: string): Promise<string> {
    if (!wallet.account) throw new Error("Connect MetaMask before anchoring evidence.");
    if (!order.funding) throw new Error("Evidence can only be anchored to a funded order.");
    const receipt = await sendTx("anchorEvidence", [BigInt(order.funding.escrowObjectId), EVIDENCE_KIND[kind] ?? 5, asBytes32(sha256Hex, "The evidence hash")]);
    return receipt.hash;
  }

  /** Buyer releases the whole escrow to the supplier after accepting the delivery in full. */
  async function acceptDelivery(order: TradeOrder, inspection?: { lines: InspectionLine[]; note?: string }) {
    if (!order.funding) throw new Error("Only a funded order can be accepted.");
    const escrowId = order.funding.escrowObjectId;
    return withRecording(
      order.id, "acceptDelivery", escrowId,
      () => { if (!wallet.account) throw new Error("Connect MetaMask before releasing payment."); },
      async () => (await sendTx("releaseFull", [BigInt(escrowId)])).hash,
      (txHash): AcceptanceInput => ({ transactionDigest: txHash, inspection }),
      (payload) => acceptLiveDelivery(order.id, payload),
      ["InvalidState"],
    );
  }

  /** The claim transaction locks only the disputed value; the contract pays the rest to the
   *  supplier in the same call. If a retry finds openDispute already reverted InvalidState with no
   *  local record, it reads the real disputed/requested amounts and transaction back off the
   *  chain (searching bounded log windows) rather than trusting the user's re-typed numbers, since
   *  the backend verifier checks the POST against what actually happened on-chain. */
  async function openClaim(order: TradeOrder, input: ClaimInput) {
    if (!order.funding) throw new Error("Only a funded order can be disputed.");
    const escrowId = order.funding.escrowObjectId;

    const postDispute = async (payload: ReturnType<typeof disputePostPayload>) => {
      const response = await apiRequest<{ order: TradeOrder; dispute: DisputeRecord }>(`/v1/orders/${order.id}/dispute`, {
        method: "POST", body: JSON.stringify(payload),
      });
      return { order: await viewLiveOrder(response.order), claim: disputeToClaim(response.dispute) };
    };

    // Checked before anything else, including the wallet-connected guard below: finishing a
    // recording that already succeeded on-chain never needs a signature, so it should not need a
    // connected wallet either.
    const pending = loadPending(order.id, "openClaim");
    if (pending) {
      try {
        const result = await postDispute(pending.payload as ReturnType<typeof disputePostPayload>);
        clearPending(order.id, "openClaim");
        return result;
      } catch (cause) {
        throw recordingFailedError(pending.txHash, cause);
      }
    }

    if (!wallet.account) throw new Error("Connect MetaMask before opening a claim.");
    const disputedUnits = toUnits(input.disputedValue);
    const requestedUnits = toUnits(input.requestedValue);
    let txHash: string;
    try {
      txHash = (await sendTx("openDispute", [BigInt(escrowId), BigInt(disputedUnits), BigInt(requestedUnits)])).hash;
    } catch (chainError) {
      const name = chainError instanceof EscrowTxError ? chainError.errorName : undefined;
      if (name !== "InvalidState") throw chainError;
      const recovered = await recoverDisputeOpened(BigInt(escrowId));
      if (!recovered) throw stuckNoRecordError(escrowId);
      try {
        return await postDispute(disputePostPayload(recovered.txHash, recovered.disputedUnits, recovered.requestedUnits, input));
      } catch (cause) {
        throw recordingFailedError(recovered.txHash, cause);
      }
    }

    const payload = disputePostPayload(txHash, disputedUnits, requestedUnits, input);
    savePending({ orderId: order.id, action: "openClaim", txHash, payload });
    try {
      const result = await postDispute(payload);
      clearPending(order.id, "openClaim");
      return result;
    } catch (cause) {
      throw recordingFailedError(txHash, cause);
    }
  }

  /** Buyer takes the whole escrow back: the supplier never marked shipment and the delivery deadline passed. */
  async function refundUnshipped(order: TradeOrder) {
    if (!order.funding) throw new Error("The order has no escrow funding.");
    const escrowId = order.funding.escrowObjectId;
    return withRecording(
      order.id, "refundUnshipped", escrowId,
      () => { if (!wallet.account) throw new Error("Connect MetaMask before reclaiming the escrow."); },
      async () => (await sendTx("refundUnshipped", [BigInt(escrowId)])).hash,
      (txHash): DeadlineSettlementInput => ({ kind: "refund_unshipped", transactionDigest: txHash }),
      (payload) => settleLiveDeadline(order.id, payload),
      ["InvalidState"],
    );
  }

  /** Supplier claims the whole escrow: shipment was marked and the buyer let the inspection window close. */
  async function claimUninspected(order: TradeOrder) {
    if (!order.funding) throw new Error("The order has no escrow funding.");
    const escrowId = order.funding.escrowObjectId;
    return withRecording(
      order.id, "claimUninspected", escrowId,
      () => { if (!wallet.account) throw new Error("Connect MetaMask before claiming the escrow."); },
      async () => (await sendTx("claimUninspected", [BigInt(escrowId)])).hash,
      (txHash): DeadlineSettlementInput => ({ kind: "claim_uninspected", transactionDigest: txHash }),
      (payload) => settleLiveDeadline(order.id, payload),
      ["InvalidState"],
    );
  }

  /** One party signs the agreed allocation on BOT Chain. The contract reads the role from
   *  msg.sender, so `side` only picks which local UI copy to show - it is not sent on-chain. */
  async function approveSettlement(order: TradeOrder, side: "buyer" | "supplier", allocation: { buyerValue: number; supplierValue: number; proposalId: string }): Promise<string> {
    void side;
    if (!wallet.account) throw new Error("Connect the wallet for the approving party first.");
    if (!order.funding) throw new Error("The order has no escrow funding.");
    const proposalHash = sha256(toUtf8Bytes(allocation.proposalId));
    const receipt = await sendTx("approveSettlement", [
      BigInt(order.funding.escrowObjectId), toUnits(allocation.buyerValue), toUnits(allocation.supplierValue), proposalHash,
    ]);
    return receipt.hash;
  }

  async function executeSettlement(order: TradeOrder, disputeId: string) {
    if (!wallet.account) throw new Error("Connect a wallet before executing the settlement.");
    if (!order.funding) throw new Error("The order has no escrow funding.");
    const receipt = await sendTx("executeSettlement", [BigInt(order.funding.escrowObjectId)]);
    // executeSettlement consumes the escrow, so this transaction can never be replayed. Record it
    // even though recording can still fail independently of the chain call succeeding.
    try {
      return await confirmClaimExecution(disputeId, { transactionDigest: receipt.hash, packageId: ESCROW_ADDRESS, escrowObjectId: order.funding.escrowObjectId });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`The settlement completed on BOT Chain in transaction ${receipt.hash}, but recording it here failed: ${reason}. Do not run the settlement again, the escrow is already closed. Keep this reference.`);
    }
  }

  return { signingAddress: wallet.account, sessionMismatch, fundEscrow, markShipped, anchorEvidence, acceptDelivery, openClaim, refundUnshipped, claimUninspected, approveSettlement, executeSettlement };
}
