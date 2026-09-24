"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowRight, LockKeyhole, Plus, ShieldCheck, WalletCards } from "lucide-react";
import { AppShell, HelpHint, Notice, RoleTag, Skeleton, StatusPill } from "@/app/components/app-shell";
import { type DemoOrder, claimOwner, formatOrderMoney as money } from "@/lib/demo-orders";
import { nextAction } from "@/lib/order-status";
import { BOTCHAIN, formatBot } from "@/lib/chain";
import { useWorkspace } from "@/lib/use-workspace";
import { JsonRpcProvider } from "ethers";

type QueueItem = { key: string; href: string; reference: string; title: string; detail: string; counterparty: string; role: "BUYER" | "SUPPLIER"; value: number; currency: string; status?: string };

export default function OverviewPage() {
  const workspace = useWorkspace();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    const address = workspace.session?.walletAddress;
    if (!address) { setBalance(null); return; }
    new JsonRpcProvider(BOTCHAIN.rpcUrl).getBalance(address)
      .then((wei) => setBalance(Number(formatBot(wei))))
      .catch(() => setBalance(null));
  }, [workspace.session?.walletAddress]);

  const { queue, waiting, ledger } = useMemo(() => {
    const queue: QueueItem[] = workspace.invitations.map((invitation) => ({
      key: `invite-${invitation.orderId}`, href: `/orders/${encodeURIComponent(invitation.orderId)}`, reference: invitation.reference,
      title: "Review and confirm the order", detail: `${invitation.counterpartyName} invited you to ${invitation.invitedRole === "buyer" ? "buy" : "supply"} this order. Delivery ${invitation.deliveryDate}.`,
      counterparty: invitation.counterpartyName, role: invitation.invitedRole === "buyer" ? "BUYER" : "SUPPLIER", value: invitation.value, currency: invitation.currency, status: invitation.invitedRole === "buyer" ? "awaiting_buyer" : "awaiting_supplier",
    }));
    const waiting: QueueItem[] = [];
    const isOpen = (order: DemoOrder) => !["settled", "cancelled"].includes(order.status);
    for (const order of workspace.orders) {
      if (!isOpen(order)) continue;
      const action = nextAction(order.status, order.role, { invited: Boolean(order.invited), claimOwner: claimOwner(order.claim) });
      const item: QueueItem = { key: order.id, href: `/orders/${encodeURIComponent(order.id)}`, reference: order.reference, title: action.title, detail: action.detail, counterparty: order.counterparty, role: order.role, value: order.value, currency: order.currency, status: order.status };
      if (action.owner === "you" && !queue.some((entry) => entry.href === item.href)) queue.push(item);
      else if (action.owner !== "you") waiting.push(item);
    }
    const secured = (role: "BUYER" | "SUPPLIER") => workspace.orders.filter((order) => order.role === role && ["funded", "in_transit", "delivered", "dispute_open", "negotiation_open", "arbitration_pending", "settlement_pending"].includes(order.status));
    const buying = secured("BUYER");
    const supplying = secured("SUPPLIER");
    const releaseReady = workspace.orders.filter((order) => order.role === "SUPPLIER" && order.status === "settlement_pending");
    return {
      queue, waiting,
      ledger: {
        buying: { value: buying.reduce((sum, order) => sum + order.value, 0), count: buying.length },
        supplying: { value: supplying.reduce((sum, order) => sum + order.value, 0), count: supplying.length },
        release: { value: releaseReady.reduce((sum, order) => sum + (order.inspection?.acceptedValue ?? order.value), 0), count: releaseReady.length },
      },
    };
  }, [workspace.orders, workspace.invitations]);

  return (
    <AppShell active="overview" title="Overview" company={workspace.company} actionCount={queue.length}>
      {workspace.error && <Notice tone="error">{workspace.error}</Notice>}

      <section className="metric-grid" aria-label="Money position">
        <a className="metric-tile metric-tile-link" href="/wallet" style={{ "--i": 0 } as CSSProperties}>
          <div className="metric-head"><span className="metric-title">Available in wallet</span><span className="metric-icon"><WalletCards size={16} aria-hidden="true" /></span></div>
          {balance === null
            ? <strong className="metric-value metric-value-text">Not connected</strong>
            : <strong className="metric-value">{money(balance)}<small>BOT</small></strong>}
          <p className="metric-caption">{balance === null ? (workspace.live ? "Connect MetaMask to load your balance." : "Sign in to load your balance.") : "Spendable now. Separate from escrow."}</p>
        </a>
        <div className="metric-tile" style={{ "--i": 1 } as CSSProperties}>
          <div className="metric-head"><span className="metric-title">Secured for your purchases<HelpHint text="Total value you have locked in escrow on orders you are buying. Released to suppliers only when you accept delivery or when a claim is settled." /></span><span className="metric-icon"><LockKeyhole size={16} aria-hidden="true" /></span></div>
          <strong className="metric-value">{money(ledger.buying.value)}<small>BOT</small></strong>
          <p className="metric-caption">{ledger.buying.count} {ledger.buying.count === 1 ? "funded order" : "funded orders"}</p>
        </div>
        <div className="metric-tile" style={{ "--i": 2 } as CSSProperties}>
          <div className="metric-head"><span className="metric-title">Secured for your sales<HelpHint text="Total value buyers have locked in escrow on orders you are supplying. It becomes yours when the buyer accepts delivery." /></span><span className="metric-icon"><ShieldCheck size={16} aria-hidden="true" /></span></div>
          <strong className="metric-value">{money(ledger.supplying.value)}<small>BOT</small></strong>
          <p className="metric-caption">{ledger.supplying.count} {ledger.supplying.count === 1 ? "funded order" : "funded orders"}</p>
        </div>
        <div className="metric-tile" style={{ "--i": 3 } as CSSProperties}>
          <div className="metric-head"><span className="metric-title">Ready to release to you</span><span className="metric-icon"><ArrowDownLeft size={16} aria-hidden="true" /></span></div>
          <strong className="metric-value">{money(ledger.release.value)}<small>BOT</small></strong>
          <p className="metric-caption">{ledger.release.count} {ledger.release.count === 1 ? "settlement" : "settlements"} waiting to be executed</p>
        </div>
      </section>

      <section className="list-card" aria-labelledby="queue-title">
        <div className="list-card-head">
          <div>
            <h2 id="queue-title">Needs your action</h2>
            <p>{workspace.ready && queue.length > 0 ? `${queue.length} ${queue.length === 1 ? "order needs" : "orders need"} your action.` : "Orders where you act next."}</p>
          </div>
          <a className="panel-link" href="/orders?status=action">All orders needing action<ArrowRight size={14} aria-hidden="true" /></a>
        </div>
        {!workspace.ready ? <Skeleton lines={3} /> : queue.length === 0 ? (
          <div className="list-empty">
            <strong>Nothing needs you right now</strong>
            <span>Create an order, or wait for your counterparty to act. New invitations, deliveries to check and shipments to send appear here.</span>
            <a className="btn btn-primary" href="/orders?action=create"><Plus size={16} aria-hidden="true" />New order</a>
          </div>
        ) : (
          <ul className="list-rows">
            {queue.map((item) => (
              <li key={item.key} className="list-row">
                <span className="list-avatar" aria-hidden="true">{item.counterparty.charAt(0).toUpperCase()}</span>
                <div className="list-row-main">
                  <div className="list-row-tags"><RoleTag role={item.role} compact />{item.status && <StatusPill status={item.status} />}</div>
                  <strong>{item.title}</strong>
                  <span>{item.reference} with {item.counterparty}. {item.detail}</span>
                </div>
                <div className="list-row-side">
                  <strong className="list-amount">{money(item.value)} {item.currency}</strong>
                  <a className="btn btn-primary btn-sm" href={item.href}>Open order<ArrowRight size={14} aria-hidden="true" /></a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {waiting.length > 0 && (
        <section className="list-card list-card-quiet" aria-labelledby="waiting-title">
          <div className="list-card-head">
            <h2 id="waiting-title">Waiting on others</h2>
            <a className="panel-link" href="/orders">All orders<ArrowRight size={14} aria-hidden="true" /></a>
          </div>
          <ul className="list-rows waiting-list">
            {waiting.slice(0, 6).map((item) => (
              <li key={item.key} className="list-row list-row-quiet">
                <a className="row-link" href={item.href}><strong>{item.reference}</strong></a>
                <span className="waiting-step">{item.title}</span>
                {item.status && <StatusPill status={item.status} />}
                <span className="list-amount num">{money(item.value)} {item.currency}</span>
              </li>
            ))}
          </ul>
          {waiting.length > 6 && <p className="panel-foot">{waiting.length - 6} more in the order list.</p>}
        </section>
      )}
    </AppShell>
  );
}
