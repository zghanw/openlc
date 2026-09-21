"use client";

import { Contract, sha256, toUtf8Bytes } from "ethers";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  Copy,
  ExternalLink,
  FileCheck2,
  Landmark,
  Link2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  apiRequest,
  demoGoogleLogin,
  loadSession,
  restoreSupabaseSession,
  signOutSession,
  type DemoSession,
  type Dispute,
  type TradeOrder,
} from "@/lib/payproof-api";
import {
  ESCROW_ADDRESS,
  escrowConfigured,
  ESCROW_NOT_CONFIGURED_REASON,
  explorerTxUrl,
  parseBot,
} from "@/lib/chain";
import ESCROW_ABI from "@/lib/openlc-escrow.abi.json";
import { describeTxError, shortAddress, useWallet } from "@/lib/wallet";
import { INSPECTION_WINDOW_MS, deliveryDeadlineMs } from "@/lib/escrow-actions";

const DEMO_ARBITRATOR_ID = "99999999-9999-4999-8999-999999999999";
const DEFAULT_SUPPLIER_ADDRESS = `0x${"b".repeat(40)}`;
const DEFAULT_ARBITRATOR_ADDRESS = `0x${"c".repeat(40)}`;

type Role = "buyer" | "supplier";

/** A generic decimal-string <-> integer-units converter (exact BigInt string math, never
 *  Math.round(value * 10 ** decimals)). Kept local since this demo console predates chain.ts's
 *  parseBot/formatBot, which now do the same thing fixed at BOT's 18 decimals. */
function unitsFor(value: string, decimals: number): string {
  const clean = value.trim();
  if (!/^\d+(\.\d+)?$/.test(clean)) throw new Error("Enter a positive amount");
  const [whole, fraction = ""] = clean.split(".");
  if (fraction.length > decimals)
    throw new Error(`Amount supports up to ${decimals} decimal places`);
  return `${BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0")}`;
}

function displayUnits(value: string, decimals: number): string {
  const units = BigInt(value || "0");
  const scale = 10n ** BigInt(decimals);
  const whole = units / scale;
  const fraction = (units % scale)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The action could not be completed.";
}

function short(value?: string): string {
  if (!value) return "—";
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

/** Every escrow amount here is native BOT, 18 decimals. */
const decimals = 18;

export function LiveTradeConsole() {
  const wallet = useWallet();
  const [session, setSession] = useState<DemoSession | null>(null);
  const [role, setRole] = useState<Role>("buyer");
  const [orders, setOrders] = useState<TradeOrder[]>([]);
  const [activeOrder, setActiveOrder] = useState<TradeOrder | null>(null);
  const [inviteToken, setInviteToken] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [mediation, setMediation] = useState<Dispute | null>(null);
  const [undisputedReleased, setUndisputedReleased] = useState(false);
  const [balance, setBalance] = useState("0.00");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [orderForm, setOrderForm] = useState({
    reference: "PO-2475",
    supplierEmail: "supplier@freshsource.demo",
    supplierName: "FreshSource Foods Sdn. Bhd.",
    amount: "30000",
    asset: "BOT",
    description: "Premium cooking oils, 100 cartons",
    deliveryDate: "08 Sep 2026",
    deliveryLocation: "GreenBite Receiving Bay · PJ",
    supplierAddress: DEFAULT_SUPPLIER_ADDRESS,
    arbitratorAddress: DEFAULT_ARBITRATOR_ADDRESS,
  });
  const [inviteInput, setInviteInput] = useState("");
  const [disputeForm, setDisputeForm] = useState({
    disputed: "3900",
    requested: "3900",
    claim: "13 cartons arrived damaged and cannot be sold.",
    evidence:
      "Receiving photos and the signed delivery order show damaged cartons at handover.",
  });
  const [supplierEvidence, setSupplierEvidence] = useState(
    "Dispatch photos show the cartons left our warehouse intact; the damage likely occurred after handover.",
  );

  const signingAddress = wallet.account;
  const latestProposal =
    dispute?.proposals.find((proposal) => proposal.status === "open") ??
    dispute?.proposals.at(-1);
  const settlementTarget = latestProposal
    ? {
        proposalId: latestProposal.id,
        buyerUnits: latestProposal.buyerUnits,
        supplierUnits: latestProposal.supplierUnits,
      }
    : dispute?.settlement
      ? {
          proposalId: dispute.settlement.agreementId,
          buyerUnits: dispute.settlement.buyerUnits,
          supplierUnits: dispute.settlement.supplierUnits,
        }
      : undefined;

  useEffect(() => {
    const current = loadSession();
    if (current) {
      setSession(current);
      setRole(current.user.email.startsWith("supplier") ? "supplier" : "buyer");
      return;
    }
    void restoreSupabaseSession().then((restored) => {
      if (restored) {
        setSession(restored);
        setRole(
          restored.user.email.startsWith("supplier") ? "supplier" : "buyer",
        );
      }
    });
  }, []);

  /** Sends one write call against the escrow contract, waits for the receipt, and turns a revert
   *  into a plain-English message the same way escrow-actions.ts does. */
  async function sendTx(method: string, args: unknown[], value?: bigint) {
    if (!escrowConfigured) throw new Error(ESCROW_NOT_CONFIGURED_REASON);
    const signer = await wallet.getSigner();
    const contract = new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = value !== undefined ? await (contract as any)[method](...args, { value }) : await (contract as any)[method](...args);
      const receipt = await tx.wait();
      if (!receipt) throw new Error("The transaction did not confirm.");
      return { receipt, contract };
    } catch (cause) {
      throw new Error(describeTxError(cause));
    }
  }

  useEffect(() => {
    if (!session) return;
    void refreshOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    setUndisputedReleased(Boolean(activeOrder?.undisputedRelease));
    setDispute(null);
    setMediation(null);
    if (!activeOrder?.disputeId) return;
    void apiRequest<Dispute>(`/v1/disputes/${activeOrder.disputeId}`)
      .then((loaded) => {
        setDispute(loaded);
        if (loaded.mediationRuns.length > 0) setMediation(loaded);
      })
      .catch((caught) => setError(errorText(caught)));
  }, [activeOrder?.id, activeOrder?.disputeId]);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("invite");
    if (token) {
      setInviteToken(token);
      setInviteInput(token);
      setNotice(
        "Invitation link detected. Sign in as the supplier to accept it.",
      );
    }
  }, []);

  async function refreshOrders() {
    try {
      const result = await apiRequest<TradeOrder[]>("/v1/orders");
      setOrders(result);
      // Opened from an order page: select that order straight away.
      const requested = new URLSearchParams(window.location.search).get("order");
      const preselected = !activeOrder && requested ? result.find((order) => order.id === requested) : undefined;
      if (preselected) setActiveOrder(preselected);
      if (activeOrder) {
        const next = result.find((order) => order.id === activeOrder.id);
        if (next) setActiveOrder(next);
      }
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  async function refreshOrder(orderId: string): Promise<TradeOrder> {
    const updated = await apiRequest<TradeOrder>(`/v1/orders/${orderId}`);
    setActiveOrder(updated);
    setOrders((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
    return updated;
  }

  async function signIn(nextRole: Role) {
    if (session?.mode === "supabase") {
      setRole(nextRole);
      setActiveOrder(null);
      setDispute(null);
      setMediation(null);
      setNotice(
        `Viewing ${nextRole} orders. Your verified identity stays the same.`,
      );
      return;
    }
    setBusy("signin");
    setError("");
    try {
      const next =
        nextRole === "buyer"
          ? await demoGoogleLogin("buyer@greenbite.demo", "Shen En")
          : await demoGoogleLogin(
              "supplier@freshsource.demo",
              "FreshSource Foods",
            );
      if (nextRole !== role) {
        const nextOrder =
          nextRole === "supplier"
            ? undefined
            : orders.find((item) => item.buyerId === next.user.id);
        setActiveOrder(nextOrder ?? null);
        setDispute(null);
        setMediation(null);
      }
      setSession(next);
      setRole(nextRole);
      setNotice(
        `Signed in as ${next.user.name}. This is a simulated demo session for the testnet demo.`,
      );
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy("");
    }
  }

  async function signOut() {
    setBusy("signout");
    setError("");
    try {
      await signOutSession();
      setSession(null);
      setOrders([]);
      setActiveOrder(null);
      setDispute(null);
      setMediation(null);
      setNotice("Signed out. No browser session remains active.");
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy("");
    }
  }

  async function createTrade() {
    if (!session) return;
    setBusy("create");
    setError("");
    try {
      const amountUnits = unitsFor(orderForm.amount, decimals);
      const order = await apiRequest<TradeOrder>("/v1/orders", {
        method: "POST",
        body: JSON.stringify({
          reference: orderForm.reference,
          supplierEmail: orderForm.supplierEmail,
          supplierName: orderForm.supplierName,
          supplierWalletAddress: orderForm.supplierAddress,
          arbitratorWalletAddress: orderForm.arbitratorAddress,
          arbitratorId: DEMO_ARBITRATOR_ID,
          assetType: "BOT",
          amountUnits,
          description: orderForm.description,
          deliveryDate: orderForm.deliveryDate,
          deliveryLocation: orderForm.deliveryLocation,
          lineItems: [
            {
              id: "line-1",
              description: orderForm.description,
              quantity: "100",
              unit: "Carton",
              unitPriceUnits: unitsFor(
                (Number(orderForm.amount) / 100).toFixed(2),
                decimals,
              ),
            },
          ],
        }),
      });
      const invited = await apiRequest<
        TradeOrder & { inviteToken?: string; inviteUrl?: string }
      >(`/v1/orders/${order.id}/invite`, { method: "POST" });
      setActiveOrder(invited);
      setOrders((current) => [
        invited,
        ...current.filter((item) => item.id !== invited.id),
      ]);
      setInviteToken(invited.inviteToken ?? "");
      setInviteUrl(invited.inviteUrl ?? "");
      setInviteInput(invited.inviteUrl ?? invited.inviteToken ?? "");
      setNotice(
        "Order created and invitation generated. Share the link with the supplier.",
      );
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy("");
    }
  }

  async function resendInvite() {
    if (!activeOrder) return;
    setBusy("invite");
    setError("");
    try {
      const invited = await apiRequest<
        TradeOrder & { inviteToken?: string; inviteUrl?: string }
      >(`/v1/orders/${activeOrder.id}/invite`, { method: "POST" });
      setActiveOrder(invited);
      setOrders((current) => [
        invited,
        ...current.filter((item) => item.id !== invited.id),
      ]);
      setInviteToken(invited.inviteToken ?? "");
      setInviteUrl(invited.inviteUrl ?? "");
      setInviteInput(invited.inviteUrl ?? invited.inviteToken ?? "");
      setNotice(
        "A fresh supplier invitation was generated. The previous link is no longer valid.",
      );
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy("");
    }
  }

  async function acceptInvite() {
    if (!session) return;
    const token = inviteInput.trim() || inviteToken.trim();
    if (!token) {
      setError("Paste the supplier invitation token or full link first.");
      return;
    }
    const extracted = token.includes("invite=")
      ? (new URL(token, window.location.origin).searchParams.get("invite") ??
        "")
      : token;
    setBusy("accept");
    setError("");
    try {
      const order = await apiRequest<TradeOrder>(
        `/v1/invites/${encodeURIComponent(extracted)}/accept`,
        {
          method: "POST",
          body: JSON.stringify({
            email: session.user.email,
            name: session.user.name,
            supplierWalletAddress: signingAddress,
          }),
        },
      );
      setActiveOrder(order);
      setOrders((current) => [
        order,
        ...current.filter((item) => item.id !== order.id),
      ]);
      setInviteToken(extracted);
      setNotice("Supplier accepted the order. The buyer can now fund escrow.");
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy("");
    }
  }

  async function fundEscrow() {
    if (!activeOrder || !signingAddress) {
      setError("Connect the buyer wallet before funding escrow.");
      return;
    }
    if (!activeOrder.supplierId) {
      setError("The supplier must accept the invitation first.");
      return;
    }
    setBusy("fund");
    setError("");
    try {
      const supplierAddress =
        activeOrder.supplierWalletAddress || orderForm.supplierAddress;
      const arbitratorAddress =
        activeOrder.arbitratorWalletAddress || orderForm.arbitratorAddress;
      const total = BigInt(activeOrder.amountUnits);
      const deadlineMs = deliveryDeadlineMs(activeOrder.deliveryDate);
      const { receipt, contract } = await sendTx(
        "createEscrow",
        [
          supplierAddress,
          arbitratorAddress,
          activeOrder.orderHash,
          activeOrder.reference,
          0n,
          0n,
          total,
          BigInt(Math.floor(deadlineMs / 1000)),
          BigInt(Math.floor(INSPECTION_WINDOW_MS / 1000)),
        ],
        total,
      );
      let escrowId: bigint | undefined;
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed?.name === "EscrowCreated") {
            escrowId = parsed.args.id as bigint;
            break;
          }
        } catch {
          /* not our event, skip */
        }
      }
      if (escrowId === undefined)
        throw new Error(
          "Escrow funded, but the EscrowCreated event was not found in the transaction receipt.",
        );
      const updated = await apiRequest<TradeOrder>(
        `/v1/orders/${activeOrder.id}/funding`,
        {
          method: "POST",
          body: JSON.stringify({
            packageId: ESCROW_ADDRESS,
            escrowObjectId: escrowId.toString(),
            transactionDigest: receipt.hash,
            buyerAddress: signingAddress,
            supplierAddress,
            arbitratorAddress,
            deliveryDeadlineMs: deadlineMs,
            inspectionWindowMs: INSPECTION_WINDOW_MS,
          }),
        },
      );
      setActiveOrder(updated);
      setOrders((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice(
        "Escrow funded and independently verified against the BOT Chain transaction.",
      );
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy("");
    }
  }

  async function markShipment() {
    if (!activeOrder) return;
    setBusy("shipment");
    setError("");
    try {
      const updated = await apiRequest<TradeOrder>(
        `/v1/orders/${activeOrder.id}/shipment`,
        { method: "POST" },
      );
      setActiveOrder(updated);
      setOrders((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice("Supplier marked the order in transit.");
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy("");
    }
  }

  async function releaseUndisputed() {
    if (!activeOrder?.funding || !signingAddress) {
      setError(
        "Connect the supplier wallet before releasing the undisputed balance.",
      );
      return;
    }
    if (!dispute) return;
    // The escrow contract pays the undisputed value inside the buyer's open_dispute
    // transaction, so there is no separate supplier release to sign any more.
    setError("");
    setUndisputedReleased(Boolean(activeOrder.undisputedRelease));
    setNotice(
      activeOrder.undisputedRelease
        ? "The undisputed value was paid to the supplier by the claim transaction itself. Only the disputed portion remains held."
        : "This order predates the current escrow contract. Its claim transaction did not carry the undisputed release, so refresh the order to see its current state.",
    );
  }

  async function markDelivered() {
    if (!activeOrder) return;
    setBusy("delivery");
    setError("");
    try {
      const updated = await apiRequest<TradeOrder>(
        `/v1/orders/${activeOrder.id}/delivery`,
        { method: "POST" },
      );
      setActiveOrder(updated);
      setOrders((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice(
        "Delivery recorded. The buyer can open a claim for exceptions.",
      );
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy("");
    }
  }

  async function openDispute() {
    if (!activeOrder || !signingAddress || !activeOrder.funding) {
      setError(
        "Fund the escrow and connect the buyer wallet before opening a dispute.",
      );
      return;
    }
    setBusy("dispute");
    setError("");
    try {
      const disputedUnits = unitsFor(disputeForm.disputed, decimals);
      const requestedUnits = unitsFor(disputeForm.requested, decimals);
      const { receipt } = await sendTx("openDispute", [
        BigInt(activeOrder.funding.escrowObjectId),
        BigInt(disputedUnits),
        BigInt(requestedUnits),
      ]);
      const resultData = await apiRequest<{
        order: TradeOrder;
        dispute: Dispute;
      }>(`/v1/orders/${activeOrder.id}/dispute`, {
        method: "POST",
        body: JSON.stringify({
          disputeTransactionDigest: receipt.hash,
          disputedUnits,
          requestedBuyerUnits: requestedUnits,
          claim: disputeForm.claim,
          evidenceStatement: disputeForm.evidence,
          negotiationDeadline: new Date(
            Date.now() + 60 * 60 * 1000,
          ).toISOString(),
          maxHumanRounds: 3,
        }),
      });
      setActiveOrder(resultData.order);
      setDispute(resultData.dispute);
      setNotice(
        "Dispute opened. Only the disputed balance is held; the undisputed amount can release to the supplier.",
      );
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy("");
    }
  }

  async function supplierCounter() {
    if (!dispute) return;
    setBusy("counter");
    setError("");
    try {
      const updated = await apiRequest<Dispute>(
        `/v1/disputes/${dispute.id}/supplier-response`,
        {
          method: "POST",
          body: JSON.stringify({
            agrees: false,
            statement: supplierEvidence,
          }),
        },
      );
      setDispute(updated);
      await refreshOrder(activeOrder!.id);
      setNotice(
        "Supplier counter-evidence submitted. Negotiation is now open.",
      );
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy("");
    }
  }

  async function supplierAgree() {
    if (!dispute) return;
    setBusy("supplier-agree");
    setError("");
    try {
      const updated = await apiRequest<Dispute>(
        `/v1/disputes/${dispute.id}/supplier-response`,
        {
          method: "POST",
          body: JSON.stringify({
            agrees: true,
            statement:
              "Supplier agrees to settle the buyer's requested refund.",
          }),
        },
      );
      setDispute(updated);
      await refreshOrder(activeOrder!.id);
      setNotice(
        "Supplier agreement recorded. Both parties must now sign the exact allocation on-chain.",
      );
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy("");
    }
  }

  async function runMediation() {
    if (!dispute) return;
    setBusy("mediate");
    setError("");
    try {
      const response = await apiRequest<{ dispute: Dispute }>(
        `/v1/disputes/${dispute.id}/mediate`,
        { method: "POST" },
      );
      setDispute(response.dispute);
      setMediation(response.dispute);
      await refreshOrder(activeOrder!.id);
      setNotice(
        "Live Gemini legal-RAG mediation completed. The proposal is non-binding until both parties accept.",
      );
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy("");
    }
  }

  async function acceptProposal() {
    if (!dispute || !latestProposal) return;
    setBusy("accept");
    setError("");
    try {
      const updated = await apiRequest<Dispute>(
        `/v1/disputes/${dispute.id}/proposals/${latestProposal.id}/accept`,
        { method: "POST" },
      );
      setDispute(updated);
      await refreshOrder(activeOrder!.id);
      setNotice(
        "Human acceptance recorded. The other party must accept the exact same allocation before on-chain execution.",
      );
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy("");
    }
  }

  async function rejectProposal() {
    if (!dispute || !latestProposal) return;
    setBusy("reject");
    setError("");
    try {
      const updated = await apiRequest<Dispute>(
        `/v1/disputes/${dispute.id}/proposals/${latestProposal.id}/reject`,
        { method: "POST" },
      );
      setDispute(updated);
      await refreshOrder(activeOrder!.id);
      setNotice(
        updated.status === "arbitration_pending"
          ? "Negotiation rounds are exhausted. The case is ready for the designated arbitrator."
          : "Proposal rejected. The next negotiation round is open.",
      );
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy("");
    }
  }

  async function counterProposal() {
    if (!dispute || !latestProposal) return;
    setBusy("counter-proposal");
    setError("");
    try {
      const disputed = BigInt(dispute.disputedUnits);
      const requested = BigInt(dispute.requestedBuyerUnits);
      const currentBuyer = BigInt(latestProposal.buyerUnits);
      const step = disputed / 10n || 1n;
      const buyerUnits =
        role === "supplier"
          ? currentBuyer > step
            ? currentBuyer - step
            : 0n
          : currentBuyer + step > requested
            ? requested
            : currentBuyer + step;
      const updated = await apiRequest<Dispute>(
        `/v1/disputes/${dispute.id}/proposals/${latestProposal.id}/counter`,
        {
          method: "POST",
          body: JSON.stringify({
            buyerUnits: buyerUnits.toString(),
            supplierUnits: (disputed - buyerUnits).toString(),
            summary: `${role === "supplier" ? "Supplier" : "Buyer"} counteroffer with a revised allocation.`,
            reasoning:
              "Human counteroffer; the parties retain final decision authority.",
          }),
        },
      );
      setDispute(updated);
      await refreshOrder(activeOrder!.id);
      setNotice(
        "Human counteroffer recorded. The other party can accept, reject, or counter it.",
      );
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy("");
    }
  }

  async function approveOnChain(side: Role) {
    if (!activeOrder?.funding || !settlementTarget || !signingAddress) {
      setError("Connect the wallet for the approving party first.");
      return;
    }
    if (!dispute) return;
    if (dispute.status !== "settlement_pending") {
      setError("The off-chain agreement must be pending before on-chain approvals.");
      return;
    }
    setBusy(`approve-${side}`);
    setError("");
    try {
      const hash = sha256(toUtf8Bytes(settlementTarget.proposalId));
      await sendTx("approveSettlement", [
        BigInt(activeOrder.funding.escrowObjectId),
        BigInt(settlementTarget.buyerUnits),
        BigInt(settlementTarget.supplierUnits),
        hash,
      ]);
      await refreshOrder(activeOrder!.id);
      setNotice(
        `${side === "buyer" ? "Buyer" : "Supplier"} approval recorded on BOT Chain.`,
      );
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy("");
    }
  }

  async function executeSettlement() {
    if (!activeOrder?.funding || !settlementTarget || !dispute || !signingAddress) {
      setError(
        "Both approvals and a connected wallet are required before settlement execution.",
      );
      return;
    }
    setBusy("settle");
    setError("");
    try {
      const { receipt } = await sendTx("executeSettlement", [
        BigInt(activeOrder.funding.escrowObjectId),
      ]);
      const updated = await apiRequest<Dispute>(
        `/v1/disputes/${dispute.id}/settlement-execution`,
        {
          method: "POST",
          body: JSON.stringify({
            transactionDigest: receipt.hash,
            packageId: ESCROW_ADDRESS,
            escrowObjectId: activeOrder.funding.escrowObjectId,
          }),
        },
      );
      setDispute(updated);
      await refreshOrder(activeOrder!.id);
      setNotice(
        "Settlement verified on BOT Chain. The immutable record is ready to inspect.",
      );
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy("");
    }
  }

  function copyInvite() {
    if (!inviteUrl) return;
    void navigator.clipboard?.writeText(inviteUrl);
    setNotice("Invitation link copied.");
  }

  const fundingReady = Boolean(activeOrder?.funding);
  const hasDispute = Boolean(dispute);

  return (
    <section className="live-trade-console" aria-labelledby="live-trade-title">
      <div className="live-console-header">
        <div>
          <span className="card-label">CONNECTED TRADE DEMO</span>
          <h2 id="live-trade-title">One order, every proof point.</h2>
          <p>
            Google-style demo identity, real backend state, wallet-signed Sui
            escrow, and live legal mediation in one controlled flow.
          </p>
        </div>
        <span className="live-console-badge">
          <i />
          Testnet + demo rails
        </span>
      </div>
      {!session ? (
        <div className="live-signin-grid">
          <button
            type="button"
            className="live-signin-card"
            onClick={() => void signIn("buyer")}
            disabled={busy === "signin"}
          >
            <span className="google-mark">G</span>
            <strong>Continue with Google</strong>
            <small>Buyer · GreenBite Foods · simulated session</small>
            <ArrowRight size={16} />
          </button>
          <button
            type="button"
            className="live-signin-card supplier"
            onClick={() => void signIn("supplier")}
            disabled={busy === "signin"}
          >
            <span className="live-avatar">FS</span>
            <strong>Continue as supplier</strong>
            <small>Supplier · FreshSource Foods · simulated session</small>
            <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <>
          <div className="live-session-bar">
            <span className="live-avatar">
              {session.user.name
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)}
            </span>
            <div>
              <strong>{session.user.name}</strong>
              <small>
                {session.user.email} · {role} session
              </small>
            </div>
            <button
              type="button"
              onClick={() =>
                void signIn(role === "buyer" ? "supplier" : "buyer")
              }
            >
              Switch to {role === "buyer" ? "supplier" : "buyer"}
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={busy === "signout"}
            >
              Sign out
            </button>
            <button
              type="button"
              className="live-refresh"
              onClick={() => void refreshOrders()}
              aria-label="Refresh orders"
            >
              <RefreshCw size={15} />
            </button>
          </div>
          <div className="live-console-grid">
            <div className="live-console-main">
              {role === "buyer" && !activeOrder && (
                <div className="live-step-panel">
                  <span className="card-label">STEP 1 · BUYER</span>
                  <h3>Start a protected trade</h3>
                  <div className="live-form-grid">
                    <label>
                      <span>PO reference</span>
                      <Input
                        value={orderForm.reference}
                        onChange={(event) =>
                          setOrderForm({
                            ...orderForm,
                            reference: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>Supplier email</span>
                      <Input
                        value={orderForm.supplierEmail}
                        onChange={(event) =>
                          setOrderForm({
                            ...orderForm,
                            supplierEmail: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>Order value</span>
                      <div className="live-input-with-suffix">
                        <Input
                          type="number"
                          min="1"
                          value={orderForm.amount}
                          onChange={(event) =>
                            setOrderForm({
                              ...orderForm,
                              amount: event.target.value,
                            })
                          }
                        />
                        <b>{orderForm.asset}</b>
                      </div>
                    </label>
                    <label>
                      <span>Settlement asset</span>
                      <select value={orderForm.asset} disabled>
                        <option value="BOT">BOT</option>
                      </select>
                    </label>
                    <label className="live-field-wide">
                      <span>Order details</span>
                      <Input
                        value={orderForm.description}
                        onChange={(event) =>
                          setOrderForm({
                            ...orderForm,
                            description: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>Delivery date</span>
                      <Input
                        value={orderForm.deliveryDate}
                        onChange={(event) =>
                          setOrderForm({
                            ...orderForm,
                            deliveryDate: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>Delivery location</span>
                      <Input
                        value={orderForm.deliveryLocation}
                        onChange={(event) =>
                          setOrderForm({
                            ...orderForm,
                            deliveryLocation: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="live-field-wide">
                      <span>Supplier payout wallet</span>
                      <Input
                        value={orderForm.supplierAddress}
                        onChange={(event) =>
                          setOrderForm({
                            ...orderForm,
                            supplierAddress: event.target.value,
                          })
                        }
                        placeholder="0x…"
                      />
                    </label>
                    <label className="live-field-wide">
                      <span>Arbitrator wallet</span>
                      <Input
                        value={orderForm.arbitratorAddress}
                        onChange={(event) =>
                          setOrderForm({
                            ...orderForm,
                            arbitratorAddress: event.target.value,
                          })
                        }
                        placeholder="0x…"
                      />
                    </label>
                  </div>
                  <div className="live-console-note">
                    <ShieldCheck size={15} />
                    <span>
                      Order details are hashed for the Sui record. Supplier sees
                      the commercial terms before funding.
                    </span>
                  </div>
                  <Button
                    className="app-primary"
                    onClick={() => void createTrade()}
                    disabled={busy === "create"}
                  >
                    <Link2 size={15} />
                    Create order and invite supplier
                  </Button>
                </div>
              )}
              {role === "supplier" && !activeOrder && (
                <div className="live-step-panel">
                  <span className="card-label">STEP 1 · SUPPLIER</span>
                  <h3>Accept a buyer invitation</h3>
                  <p>
                    Use the full link copied from the buyer’s workspace.
                    Acceptance is persisted by the backend and can be completed
                    from another browser.
                  </p>
                  <label>
                    <span>Invitation link or token</span>
                    <Input
                      value={inviteInput}
                      onChange={(event) => setInviteInput(event.target.value)}
                      placeholder="http://localhost:3000/workspace?invite=…"
                    />
                  </label>
                  <Button
                    className="app-primary"
                    onClick={() => void acceptInvite()}
                    disabled={busy === "accept"}
                  >
                    <Check size={15} />
                    Accept invitation
                  </Button>
                </div>
              )}
              {activeOrder && (
                <div className="live-step-panel live-order-panel">
                  <div className="live-order-head">
                    <div>
                      <span className="card-label">
                        ORDER {activeOrder.reference}
                      </span>
                      <h3>{activeOrder.description}</h3>
                      <p>
                        {activeOrder.supplierName} ·{" "}
                        {displayUnits(activeOrder.amountUnits, decimals)}{" "}
                        BOT
                      </p>
                    </div>
                    <span
                      className={`live-status live-status-${activeOrder.status}`}
                    >
                      {activeOrder.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <div className="live-flow">
                    <span
                      className={
                        activeOrder.status !== "awaiting_supplier"
                          ? "done"
                          : "current"
                      }
                    >
                      Invite
                    </span>
                    <i />
                    <span
                      className={
                        [
                          "supplier_confirmed",
                          "funded",
                          "in_transit",
                          "delivered",
                          "dispute_open",
                          "negotiation_open",
                          "arbitration_pending",
                          "settlement_pending",
                          "settled",
                        ].includes(activeOrder.status)
                          ? "done"
                          : "current"
                      }
                    >
                      Accepted
                    </span>
                    <i />
                    <span className={fundingReady ? "done" : "current"}>
                      Funded
                    </span>
                    <i />
                    <span className={hasDispute ? "done" : "current"}>
                      Resolve
                    </span>
                  </div>
                  <div className="live-action-row">
                    {inviteUrl &&
                      activeOrder.status === "awaiting_supplier" && (
                        <div className="live-invite-box">
                          <Link2 size={15} />
                          <span>
                            <strong>Invite ready</strong>
                            <small>{inviteUrl}</small>
                          </span>
                          <button
                            type="button"
                            onClick={copyInvite}
                            aria-label="Copy invite link"
                          >
                            <Copy size={15} />
                          </button>
                        </div>
                      )}
                    {role === "buyer" &&
                      activeOrder.status === "awaiting_supplier" && (
                        <span className="live-muted-action">
                          Waiting for supplier acceptance.
                        </span>
                      )}
                    {role === "buyer" &&
                      activeOrder.status === "awaiting_supplier" &&
                      !inviteUrl && (
                        <Button
                          variant="outline"
                          onClick={() => void resendInvite()}
                          disabled={busy === "invite"}
                        >
                          <Link2 size={15} />
                          Generate supplier invite
                        </Button>
                      )}
                    {role === "buyer" &&
                      activeOrder.status === "supplier_confirmed" && (
                        <>
                          <div className="live-topup-box">
                            <Landmark size={15} />
                            <span>
                              <strong>
                                Available balance {balance} BOT
                              </strong>
                              <small>
                                Card top-up is simulated for this demo.
                              </small>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setBalance((current) =>
                                  (Number(current) + 30000).toFixed(2),
                                )
                              }
                            >
                              Simulate card top-up
                            </button>
                          </div>
                          <div className="live-wallet-box">
                            <WalletCards size={15} />
                            <span>
                              <strong>Fund escrow from Sui wallet</strong>
                              <small>
                                Requires a real testnet wallet and asset
                                balance.
                              </small>
                            </span>
                            {signingAddress ? (
                              <span className="wallet-connect-label">{shortAddress(signingAddress)}</span>
                            ) : (
                              <button type="button" className="wallet-connect-label" onClick={() => void wallet.connect()} disabled={wallet.connecting}>
                                {wallet.connecting ? "Connecting…" : "Connect wallet"}
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    {role === "buyer" &&
                      activeOrder.status === "supplier_confirmed" && (
                        <Button
                          className="app-primary"
                          onClick={() => void fundEscrow()}
                          disabled={busy === "fund" || !signingAddress || !escrowConfigured}
                        >
                          <LockKeyhole size={15} />
                          Fund escrow
                        </Button>
                      )}
                    {role === "supplier" && activeOrder.status === "funded" && (
                      <Button
                        className="app-primary"
                        onClick={() => void markShipment()}
                        disabled={busy === "shipment"}
                      >
                        <ArrowRight size={15} />
                        Mark shipped
                      </Button>
                    )}
                    {(role === "buyer" || role === "supplier") &&
                      activeOrder.status === "in_transit" && (
                        <Button
                          className="app-primary"
                          onClick={() => void markDelivered()}
                          disabled={busy === "delivery"}
                        >
                          <Check size={15} />
                          Record delivery
                        </Button>
                      )}
                  </div>
                  {fundingReady && (
                    <div className="live-proof-box">
                      <ShieldCheck size={16} />
                      <span>
                        <strong>Escrow proof recorded on Sui</strong>
                        <small>
                          {short(activeOrder.funding?.escrowObjectId)} ·{" "}
                          {short(activeOrder.funding?.transactionDigest)} ·{" "}
                          {activeOrder.funding?.verificationStatus}
                        </small>
                      </span>
                      <a
                        href={explorerTxUrl(
                          activeOrder.funding!.transactionDigest,
                        )}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink size={14} />
                        Explorer
                      </a>
                    </div>
                  )}
                </div>
              )}
              {activeOrder &&
                dispute &&
                role === "supplier" &&
                activeOrder.funding &&
                dispute.undisputedReleasedUnits !== "0" &&
                !undisputedReleased && (
                  <div className="live-step-panel live-release-panel">
                    <span className="card-label">STEP 3A · SUPPLIER</span>
                    <h3>Release the undisputed balance</h3>
                    <p>
                      The accepted portion is released immediately; only the
                      disputed amount stays in escrow while both parties resolve
                      the claim.
                    </p>
                    <Button
                      className="app-primary"
                      onClick={() => void releaseUndisputed()}
                      disabled={busy === "release-undisputed" || !signingAddress}
                    >
                      <ArrowRight size={15} />
                      Release undisputed funds on Sui
                    </Button>
                    <small>
                      Requires the supplier wallet used in the escrow.
                    </small>
                  </div>
                )}
              {activeOrder &&
                role === "buyer" &&
                ["funded", "in_transit", "delivered"].includes(
                  activeOrder.status,
                ) &&
                !dispute && (
                  <div className="live-step-panel">
                    <span className="card-label">STEP 3 · BUYER CLAIM</span>
                    <h3>Open an evidence-backed dispute</h3>
                    <div className="live-form-grid">
                      <label>
                        <span>Disputed amount</span>
                        <div className="live-input-with-suffix">
                          <Input
                            value={disputeForm.disputed}
                            onChange={(event) =>
                              setDisputeForm({
                                ...disputeForm,
                                disputed: event.target.value,
                              })
                            }
                          />
                          <b>BOT</b>
                        </div>
                      </label>
                      <label>
                        <span>Requested refund</span>
                        <div className="live-input-with-suffix">
                          <Input
                            value={disputeForm.requested}
                            onChange={(event) =>
                              setDisputeForm({
                                ...disputeForm,
                                requested: event.target.value,
                              })
                            }
                          />
                          <b>BOT</b>
                        </div>
                      </label>
                      <label className="live-field-wide">
                        <span>Claim</span>
                        <Input
                          value={disputeForm.claim}
                          onChange={(event) =>
                            setDisputeForm({
                              ...disputeForm,
                              claim: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="live-field-wide">
                        <span>Evidence statement</span>
                        <Input
                          value={disputeForm.evidence}
                          onChange={(event) =>
                            setDisputeForm({
                              ...disputeForm,
                              evidence: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="live-console-note">
                      <FileCheck2 size={15} />
                      <span>
                        Evidence text is stored off-chain. The dispute
                        transaction binds this claim to the funded escrow.
                      </span>
                    </div>
                    <Button
                      className="app-primary"
                      onClick={() => void openDispute()}
                      disabled={busy === "dispute"}
                    >
                      <FileCheck2 size={15} />
                      Open dispute on Sui
                    </Button>
                  </div>
                )}
              {activeOrder && dispute && (
                <div className="live-step-panel live-resolution-panel">
                  <div className="live-order-head">
                    <div>
                      <span className="card-label">
                        STEP 4 · DISPUTE RESOLUTION
                      </span>
                      <h3>AI proposal, human decision, on-chain receipt</h3>
                      <p>
                        Dispute {short(dispute.id)} ·{" "}
                        {dispute.status.replaceAll("_", " ")}
                      </p>
                    </div>
                    <Sparkles size={19} />
                  </div>
                  {role === "supplier" &&
                    dispute.status === "supplier_review" && (
                      <>
                        <label className="live-field-wide live-counter-evidence">
                          <span>Supplier counter-evidence</span>
                          <Input
                            value={supplierEvidence}
                            onChange={(event) =>
                              setSupplierEvidence(event.target.value)
                            }
                          />
                        </label>
                        <div className="live-action-row">
                          <Button
                            className="app-primary"
                            onClick={() => void supplierAgree()}
                            disabled={busy === "supplier-agree"}
                          >
                            <Check size={15} />
                            Agree and settle
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => void supplierCounter()}
                            disabled={busy === "counter"}
                          >
                            Submit counter-evidence
                          </Button>
                        </div>
                      </>
                    )}
                  {role === "buyer" &&
                    dispute.status === "negotiation_open" && (
                      <Button
                        className="app-primary"
                        onClick={() => void runMediation()}
                        disabled={busy === "mediate"}
                      >
                        <Sparkles size={15} />
                        Run live AI mediation
                      </Button>
                    )}
                  {mediation && latestProposal && (
                    <>
                      <div className="live-proposal">
                        <div>
                          <span>NON-BINDING AI PROPOSAL</span>
                          <strong>
                            {displayUnits(
                              latestProposal.buyerUnits,
                              decimals,
                            )}{" "}
                            refund ·{" "}
                            {displayUnits(
                              latestProposal.supplierUnits,
                              decimals,
                            )}{" "}
                            release
                          </strong>
                        </div>
                        <p>{latestProposal.summary}</p>
                        <small>
                          {latestProposal.citations.length} legal citations ·{" "}
                          {mediation.mediationRuns.at(-1)?.debateRounds ?? 0}{" "}
                          debate rounds ·{" "}
                          {mediation.mediationRuns.at(-1)?.modelCalls ?? 0}{" "}
                          model calls
                        </small>
                      </div>
                      <div className="live-agent-finals">
                        <div>
                          <span>BUYER AGENT</span>
                          <p>
                            {String(
                              (
                                mediation.mediationRuns.at(-1)
                                  ?.buyerFinal as any
                              )?.inferences?.[0] ??
                                "Reviewed buyer evidence and requested remedy.",
                            )}
                          </p>
                        </div>
                        <div>
                          <span>SUPPLIER AGENT</span>
                          <p>
                            {String(
                              (
                                mediation.mediationRuns.at(-1)
                                  ?.supplierFinal as any
                              )?.inferences?.[0] ??
                                "Reviewed supplier evidence and delivery terms.",
                            )}
                          </p>
                        </div>
                        <div>
                          <span>MEDIATOR</span>
                          <p>
                            {String(
                              (
                                mediation.mediationRuns.at(-1)
                                  ?.mediatorFinal as any
                              )?.unresolvedQuestions?.[0] ??
                                "Balanced the evidence against the retrieved legal context.",
                            )}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                  {dispute.status === "negotiation_open" &&
                    latestProposal?.status === "open" && (
                      <div className="live-action-row">
                        {!latestProposal.acceptances.includes(role) && (
                          <Button
                            className="app-primary"
                            onClick={() => void acceptProposal()}
                            disabled={busy === "accept"}
                          >
                            <Check size={15} />
                            {role === "buyer" ? "Buyer" : "Supplier"} accept
                            proposal
                          </Button>
                        )}
                        {latestProposal.proposerSide !== role && (
                          <>
                            <Button
                              variant="outline"
                              onClick={() => void counterProposal()}
                              disabled={busy === "counter-proposal"}
                            >
                              Counteroffer
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => void rejectProposal()}
                              disabled={busy === "reject"}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  {dispute.status === "arbitration_pending" && (
                    <div className="live-proposal">
                      <div>
                        <span>ARBITRATION ESCALATION</span>
                        <strong>
                          Negotiation closed · disputed funds remain held
                        </strong>
                      </div>
                      <p>
                        The structured case package now contains both evidence
                        sets, legal context, AI analysis, and negotiation
                        history for the designated human arbitrator.
                      </p>
                    </div>
                  )}
                  {dispute.status === "settlement_pending" &&
                    !mediation &&
                    settlementTarget && (
                      <div className="live-proposal">
                        <div>
                          <span>SUPPLIER AGREEMENT</span>
                          <strong>
                            {displayUnits(
                              settlementTarget.buyerUnits,
                              decimals,
                            )}{" "}
                            refund ·{" "}
                            {displayUnits(
                              settlementTarget.supplierUnits,
                              decimals,
                            )}{" "}
                            release
                          </strong>
                        </div>
                        <p>
                          The supplier accepted the buyer's requested remedy.
                          Both wallets still sign the exact allocation before
                          the escrow executes.
                        </p>
                      </div>
                    )}
                  {dispute.status === "settlement_pending" &&
                    settlementTarget && (
                      <div className="live-settlement-actions">
                        <p>
                          <ShieldCheck size={15} />
                          Both parties must sign the exact allocation with their
                          Sui wallets.
                        </p>
                        <div>
                          <Button
                            variant="outline"
                            onClick={() => void approveOnChain("buyer")}
                            disabled={busy === "approve-buyer"}
                          >
                            <WalletCards size={14} />
                            Buyer on-chain approval
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => void approveOnChain("supplier")}
                            disabled={busy === "approve-supplier"}
                          >
                            <WalletCards size={14} />
                            Supplier on-chain approval
                          </Button>
                          <Button
                            className="app-primary"
                            onClick={() => void executeSettlement()}
                            disabled={busy === "settle"}
                          >
                            <Check size={14} />
                            Execute settlement
                          </Button>
                        </div>
                      </div>
                    )}
                  {dispute.status === "settled" &&
                    dispute.settlement?.execution && (
                      <div className="live-proof-box success">
                        <Check size={16} />
                        <span>
                          <strong>Immutable settlement receipt verified</strong>
                          <small>
                            {short(
                              dispute.settlement.execution.receiptObjectId,
                            )}{" "}
                            ·{" "}
                            {short(
                              dispute.settlement.execution.transactionDigest,
                            )}
                          </small>
                        </span>
                        <a
                          href={explorerTxUrl(
                            dispute.settlement.execution.transactionDigest,
                          )}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink size={14} />
                          View receipt
                        </a>
                      </div>
                    )}
                </div>
              )}
            </div>
            <aside className="live-console-side">
              <div className="live-side-block">
                <span className="card-label">YOUR ORDERS</span>
                {orders.length ? (
                  orders.map((order) => (
                    <button
                      type="button"
                      key={order.id}
                      className={activeOrder?.id === order.id ? "active" : ""}
                      onClick={() => setActiveOrder(order)}
                    >
                      <span>
                        <strong>{order.reference}</strong>
                        <small>{order.supplierName}</small>
                      </span>
                      <b>{order.status.replaceAll("_", " ")}</b>
                    </button>
                  ))
                ) : (
                  <p>No orders yet. Create one to begin the demo.</p>
                )}
              </div>
              <div className="live-side-block">
                <span className="card-label">DEMO DISCLOSURE</span>
                <p>
                  <CircleAlert size={14} />
                  Google identity and card top-up are simulated. Wallet
                  signatures, Sui escrow events, backend dispute state, legal
                  retrieval and AI mediation are real when the corresponding
                  service is running.
                </p>
              </div>
            </aside>
          </div>
        </>
      )}
      {(notice || error) && (
        <div
          className={error ? "live-console-error" : "live-console-notice"}
          role="status"
        >
          {error ? <CircleAlert size={15} /> : <Check size={15} />}
          <span>{error || notice}</span>
          <button
            type="button"
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </section>
  );
}
