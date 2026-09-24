"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Check, ClipboardCopy, ExternalLink, LockKeyhole, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AppShell, HelpHint, Notice, PageTitle } from "@/app/components/app-shell";
import { type DemoOrder, formatOrderMoney as money } from "@/lib/demo-orders";
import { describeEscrowError, requireBotChainSigner, useEscrowActions } from "@/lib/escrow-actions";
import { type ReleaseStageKey, releaseProgress } from "@/app/components/release-plan";
import { BOTCHAIN, ESCROW_ADDRESS, escrowConfigured, explorerAddressUrl, explorerTxUrl, formatBot } from "@/lib/chain";
import { useWallet } from "@/lib/wallet";
import { useWorkspace } from "@/lib/use-workspace";
import ESCROW_ABI from "@/lib/openlc-escrow.abi.json";
import { Contract, JsonRpcProvider } from "ethers";

import { AnimatedAmount, LiftCard } from "@/app/components/motion";

/** "in" and "out" change the wallet balance. "escrow" moves money the contract holds, so it
 *  is shown without a sign: the buyer already paid it in when the order was funded. */
type Movement = { id: string; type: "in" | "out" | "escrow"; title: string; detail: string; amount: number; currency?: string; at: string; state: "pending" | "complete"; transactionDigest?: string; stage?: ReleaseStageKey | "escrow"; orderId?: string };
type Balances = { bot: number };

function sumOrders(orders: DemoOrder[], pick: (order: DemoOrder) => number = (order) => order.value): string {
  return `${money(orders.reduce((total, order) => total + pick(order), 0))} BOT`;
}

/** Escrow movements are derived from the orders themselves rather than stored, so the trail is
 *  complete for every path the contract can take, including deadline settlements. */
function escrowMovements(orders: DemoOrder[]): Movement[] {
  const out: Movement[] = [];
  for (const order of orders) {
    const progress = releaseProgress(order);
    if (!progress) continue;
    const supplying = order.role === "SUPPLIER";
    const plan = order.releasePlan ?? { depositValue: 0, dispatchValue: 0, deliveryValue: order.value };
    const settledAt = order.raw?.updatedAt ?? order.events.at(-1)?.at ?? order.funding?.fundedAt ?? "";
    const base = { detail: `${order.reference} with ${order.counterparty}`, currency: order.currency, state: "complete" as const, orderId: order.id };
    const toSupplier = supplying ? "in" as const : "escrow" as const;
    const suffix = supplying ? "" : " to supplier";

    if (!supplying) {
      out.push({ ...base, id: `${order.id}-escrow`, type: "out", title: "Escrow funded", amount: order.value,
        at: order.funding?.fundedAt ?? settledAt, transactionDigest: order.funding?.transactionDigest, stage: "escrow" });
    }
    if (progress.deposit > 0) {
      out.push({ ...base, id: `${order.id}-deposit`, type: toSupplier, title: `Order deposit released${suffix}`, amount: progress.deposit,
        at: order.funding?.fundedAt ?? settledAt, transactionDigest: order.funding?.transactionDigest, stage: "deposit" });
    }
    if (progress.dispatch > 0) {
      out.push({ ...base, id: `${order.id}-dispatch`, type: toSupplier, title: `Dispatch payment released${suffix}`, amount: progress.dispatch,
        at: order.shipment?.dispatchedAt ?? settledAt, transactionDigest: order.shipment?.transactionDigest, stage: "dispatch" });
    }
    // A claim pays the undisputed value out immediately, well before any settlement exists.
    const undisputed = order.raw?.undisputedRelease;
    const atClaim = undisputed ? Math.min(progress.delivery, plan.deliveryValue) : 0;
    if (undisputed && atClaim > 0) {
      out.push({ ...base, id: `${order.id}-undisputed`, type: toSupplier, title: `Undisputed value released${suffix}`, amount: atClaim,
        at: undisputed.releasedAt, transactionDigest: undisputed.transactionDigest, stage: "delivery" });
    }
    if (!order.settlement) continue;
    const finalToSupplier = Math.max(0, progress.delivery - atClaim);
    if (finalToSupplier > 0.0001) {
      out.push({ ...base, id: `${order.id}-delivery`, type: toSupplier, title: `Delivery balance released${suffix}`, amount: finalToSupplier,
        at: settledAt, transactionDigest: order.settlement.transactionDigest, stage: "delivery" });
    }
    if (!supplying && order.settlement.buyerValue > 0) {
      out.push({ ...base, id: `${order.id}-refund`, type: "in", title: "Escrow returned to you", amount: order.settlement.buyerValue,
        at: settledAt, transactionDigest: order.settlement.transactionDigest, stage: "delivery" });
    }
  }
  return out;
}

export default function WalletPage() {
  const workspace = useWorkspace();
  const wallet = useWallet();
  const [balances, setBalances] = useState<Balances | null>(null);
  const [balanceNote, setBalanceNote] = useState("");
  const [notice, setNotice] = useState("");
  const address = workspace.session?.walletAddress ?? "";
  const balance = balances?.bot ?? null;

  const readBalances = useCallback(async (): Promise<Balances | null> => {
    if (!address) return null;
    const wei = await new JsonRpcProvider(BOTCHAIN.rpcUrl).getBalance(address);
    return { bot: Number(formatBot(wei)) };
  }, [address]);

  const refreshBalances = useCallback(() => readBalances()
    .then((value) => { setBalances(value); setBalanceNote(`Balance read from ${BOTCHAIN.chainName}.`); })
    .catch((cause) => setBalanceNote(cause instanceof Error ? `The balance could not be read: ${cause.message}` : "The balance could not be read.")), [readBalances]);

  useEffect(() => {
    if (!workspace.ready) return;
    if (!address) { setBalances(null); setBalanceNote(workspace.live ? "Connect MetaMask to load your on-chain balance." : "Sign in to load your balance."); return; }
    void refreshBalances();
  }, [workspace.ready, workspace.accountKey, workspace.live, address, refreshBalances]);

  // owed(address): a payout the contract's 50k-gas push once failed to deliver (PaymentDeferred),
  // sitting in the contract until withdraw() is called. There is otherwise no way to reclaim it.
  const [owed, setOwed] = useState<bigint>(0n);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawnTx, setWithdrawnTx] = useState("");

  const refreshOwed = useCallback(async () => {
    if (!address || !escrowConfigured) { setOwed(0n); return; }
    try {
      const contract = new Contract(ESCROW_ADDRESS, ESCROW_ABI, new JsonRpcProvider(BOTCHAIN.rpcUrl));
      setOwed(await contract.owed(address));
    } catch {
      /* transient RPC hiccup - keep the previous value rather than flashing to zero */
    }
  }, [address]);

  useEffect(() => { void refreshOwed(); }, [refreshOwed]);

  const withdraw = async () => {
    setWithdrawing(true);
    setWithdrawError("");
    setWithdrawnTx("");
    try {
      const signer = await requireBotChainSigner(wallet);
      const contract = new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
      // Pinned so MetaMask itself refuses to sign if the network changed while its confirmation
      // popup was open - see the comment on sendTx in escrow-actions.ts for why this is necessary
      // even after requireBotChainSigner's own checks.
      const tx = await contract.withdraw({ chainId: BigInt(BOTCHAIN.chainIdDec) });
      const receipt = await tx.wait();
      setWithdrawnTx(receipt.hash);
      await Promise.all([refreshOwed(), refreshBalances()]);
    } catch (cause) {
      setWithdrawError(describeEscrowError(cause));
    } finally {
      setWithdrawing(false);
    }
  };

  // A signed-in wallet only reflects real orders. Sample orders stay on the orders page.
  const ledgerOrders = workspace.live ? workspace.liveOrders : workspace.orders;
  const position = useMemo(() => {
    const funded = (role: "BUYER" | "SUPPLIER") => ledgerOrders.filter((order) => order.role === role && ["funded", "in_transit", "delivered", "dispute_open", "negotiation_open", "arbitration_pending", "settlement_pending"].includes(order.status));
    const buying = funded("BUYER");
    const supplying = funded("SUPPLIER");
    const held = ledgerOrders.filter((order) => order.inspection && order.inspection.heldValue > 0 && !["settled", "cancelled"].includes(order.status));
    return {
      buying: { value: sumOrders(buying), count: buying.length },
      supplying: { value: sumOrders(supplying), count: supplying.length },
      held: { value: sumOrders(held, (order) => order.inspection?.heldValue ?? 0), count: held.length },
      pendingIn: 0, pendingOut: 0,
    };
  }, [ledgerOrders]);

  const activity = useMemo(() => escrowMovements(ledgerOrders)
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")), [ledgerOrders]);

  return (
    <AppShell active="wallet" company={workspace.company}>
      <PageTitle title="Wallet" description="Money you can spend or withdraw, kept separate from funds secured inside purchase orders." />
      {notice && <Notice tone="success" onDismiss={() => setNotice("")}>{notice}</Notice>}
      {owed > 0n && (
        <Notice tone="warning">
          <span>A payout of <strong>{formatBot(owed)} BOT</strong> could not be delivered automatically and is held by the escrow contract for your wallet.<HelpHint text="The contract pushes each payout with a capped amount of gas. If that push ever fails (for example, a contract address that rejects BOT), the amount is credited here instead of being lost, and only withdraw() can release it." /></span>
          <Button size="sm" variant="outline" disabled={withdrawing} onClick={() => void withdraw()}>{withdrawing ? "Withdrawing…" : "Withdraw"}</Button>
        </Notice>
      )}
      {withdrawnTx && (
        <Notice tone="success" onDismiss={() => setWithdrawnTx("")}>
          <span>Withdrawn. <a className="link" href={explorerTxUrl(withdrawnTx)} target="_blank" rel="noreferrer">View transaction<ExternalLink size={12} aria-hidden="true" /></a></span>
        </Notice>
      )}
      {withdrawError && <Notice tone="error" onDismiss={() => setWithdrawError("")}>{withdrawError}</Notice>}

      <section className="wallet-grid">
        <LiftCard as="article" className="wallet-card" tilt={2} lift={2}>
          <div className="wallet-card-head">
            <span>Available balance<HelpHint text={`BOT held at your wallet address on ${BOTCHAIN.chainName}. Escrowed funds are not included: the escrow contract holds them, not your address.`} /></span>
            <span className="wallet-network"><i aria-hidden="true" />{BOTCHAIN.chainName}</span>
          </div>
          {balances === null ? (
            <strong className="wallet-amount"><span className="wallet-amount-text">Not connected</span></strong>
          ) : (
            <strong className="wallet-amount"><AnimatedAmount value={balances.bot} decimals={2} /> <small>BOT</small></strong>
          )}
          {balances !== null && balances.bot === 0 && <p className="wallet-note">New orders are priced in BOT. <a className="link-light" href={BOTCHAIN.getBotUrl} target="_blank" rel="noreferrer">{BOTCHAIN.getBotLabel}</a> and it appears here.</p>}
          <p className="wallet-address">{address ? <><code>{address.slice(0, 10)}...{address.slice(-8)}</code><button type="button" className="text-button text-button-light" onClick={() => void navigator.clipboard.writeText(address)}><ClipboardCopy size={12} aria-hidden="true" />Copy address</button></> : balanceNote}</p>
          {address && balanceNote && <p className="wallet-note">{balanceNote}</p>}
          <div className="wallet-actions">
            <a href={BOTCHAIN.getBotUrl} target="_blank" rel="noreferrer" className="wallet-action-button"><span><Plus size={17} aria-hidden="true" /></span><strong>{BOTCHAIN.getBotLabel}</strong><small>On {BOTCHAIN.chainName}</small></a>
            {address && <a href={explorerAddressUrl(address)} target="_blank" rel="noreferrer" className="wallet-action-button"><span><ExternalLink size={17} aria-hidden="true" /></span><strong>View on explorer</strong><small>{BOTCHAIN.chainName} Explorer</small></a>}
            <button type="button" className="wallet-action-button" onClick={() => void navigator.clipboard.writeText(address)}><span><ClipboardCopy size={17} aria-hidden="true" /></span><strong>Copy address</strong><small>{address.slice(0, 6)}...{address.slice(-4)}</small></button>
          </div>
        </LiftCard>

        <article className="panel money-ledger" aria-labelledby="position-title">
          <div className="panel-head"><h2 id="position-title">Where your money is</h2></div>
          <dl className="money-rows">
            <div><dt>Available to spend</dt>{balances === null ? <dd className="text">Not connected</dd> : <dd>{money(balances.bot)} BOT</dd>}</div>
            <div><dt><LockKeyhole size={13} aria-hidden="true" />Secured for your purchases<small>{position.buying.count} {position.buying.count === 1 ? "order" : "orders"}</small></dt><dd>{position.buying.value}</dd></div>
            <div><dt><LockKeyhole size={13} aria-hidden="true" />Secured for your sales<small>{position.supplying.count} {position.supplying.count === 1 ? "order" : "orders"}</small></dt><dd>{position.supplying.value}</dd></div>
            {position.held.count > 0 && <div><dt>Held for open claims<small>{position.held.count} {position.held.count === 1 ? "claim" : "claims"}</small></dt><dd>{position.held.value}</dd></div>}
          </dl>
          <p className="money-foot"><ShieldCheck size={14} aria-hidden="true" />Secured funds are held by the OpenLC escrow contract on {BOTCHAIN.chainName}. Wallet actions cannot move them.</p>
          <a className="panel-link" href="/orders">Open orders<ArrowRight size={13} aria-hidden="true" /></a>
        </article>
      </section>

      <section className="panel" aria-labelledby="activity-title">
        <div className="panel-head"><h2 id="activity-title">Activity</h2></div>
        {activity.length === 0 ? (
          <p className="panel-empty">No wallet movements yet. Each escrow release will appear here.</p>
        ) : (
          <ul className="movement-list">
            {activity.map((item) => (
              <li key={item.id}>
                <span className={`movement-icon movement-${item.type}${item.stage ? ` movement-stage movement-stage-${item.stage}` : ""}`}>
                  {item.stage === "escrow" ? <LockKeyhole size={15} aria-hidden="true" />
                    : item.type === "escrow" ? <ArrowRight size={15} aria-hidden="true" />
                    : item.type === "out" ? <ArrowUpRight size={15} aria-hidden="true" /> : <ArrowDownLeft size={15} aria-hidden="true" />}
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.orderId ? <a className="link" href={`/orders/${encodeURIComponent(item.orderId)}`}>{item.detail}</a> : item.detail}. {new Date(item.at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}{item.transactionDigest && <> <a className="link" href={explorerTxUrl(item.transactionDigest)} target="_blank" rel="noreferrer">Receipt on {BOTCHAIN.chainName} Explorer<ExternalLink size={11} aria-hidden="true" /></a></>}</small>
                </div>
                <span className={`pill ${item.state === "pending" ? "pill-attention" : item.type === "escrow" ? "pill-neutral" : "pill-success"}`}>{item.state === "pending" ? "Pending" : item.type === "escrow" ? "From escrow" : "Complete"}</span>
                <strong className={`num ${item.type === "in" ? "amount-in" : item.type === "escrow" ? "amount-escrow" : ""}`}>{item.type === "in" ? "+" : item.type === "out" ? "-" : ""}{money(item.amount)} {item.currency ?? "BOT"}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

    </AppShell>
  );
}
