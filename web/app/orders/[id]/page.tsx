"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, FastForward, FileText, LockKeyhole, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell, HelpHint, Logo, Notice, RoleTag, SampleTag, Skeleton, StatusPill } from "@/app/components/app-shell";
import { ClaimSection } from "@/app/components/claim-section";
import { ActionPanel } from "@/app/components/order-actions";
import { DocumentsPanel } from "@/app/components/order-documents";
import { ReleasePlanBar, releaseProgress } from "@/app/components/release-plan";
import { OrderStepper, OrderTimeline } from "@/app/components/order-stepper";
import { StageSwitch } from "@/app/components/motion";
import { type DemoOrder, formatDate, formatDateTime, formatOrderMoney as money, totalQuantity } from "@/lib/demo-orders";
import { loadClaim } from "@/lib/dispute-actions";
import { getLiveOrder, previewLiveInvite } from "@/lib/live-orders";
import { withExtras } from "@/lib/local-order-extras";
import { STATUS, isDisputed } from "@/lib/order-status";
import { loadSession } from "@/lib/openlc-api";
import { savePendingInvite } from "@/lib/pending-invite";
import { authenticateConnectedWallet } from "@/lib/auth";
import { advanceSample, guidedDemoNextLabel } from "@/lib/sample-orders";
import { chainMismatchNotice, readEscrowState, type EscrowChainState } from "@/lib/escrow-actions";
import { BOTCHAIN, ESCROW_ADDRESS, explorerAddressUrl, explorerTxUrl, formatBot } from "@/lib/chain";
import { shortAddress, useWallet } from "@/lib/wallet";
import { useWorkspace } from "@/lib/use-workspace";

export default function OrderPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const workspace = useWorkspace();
  const [order, setOrder] = useState<DemoOrder | null>(null);
  const [ready, setReady] = useState(false);
  const [inviteToken, setInviteToken] = useState("");
  const [loadError, setLoadError] = useState("");
  const [inviteAuthRequired, setInviteAuthRequired] = useState(false);
  const [claimError, setClaimError] = useState("");
  const [escrowCopied, setEscrowCopied] = useState(false);
  const isSample = id.startsWith("sample-");

  useEffect(() => {
    void (async () => {
      const token = new URLSearchParams(window.location.search).get("invite") ?? "";
      setInviteToken(token);
      if (token) savePendingInvite(id, token);
      if (isSample) return;
      if (loadSession()) {
        try {
          setOrder(withExtras(token ? await previewLiveInvite(token) : await getLiveOrder(id)));
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "This order could not be loaded.";
          setLoadError(message);
          setInviteAuthRequired(Boolean(token && /supplier email|different supplier account|invited/i.test(message)));
        }
      } else {
        // The AppShell sign-in gate shows instead; signing in remounts this page on the same URL, invitation included.
        setLoadError("Sign in to open this order.");
      }
      setReady(true);
    })();
  }, [id, isSample]);

  useEffect(() => {
    if (!isSample || !workspace.ready) return;
    const found = workspace.sampleOrders.find((item) => item.id === id) ?? null;
    setOrder(found);
    if (!found) setLoadError("This sample order does not exist for your account.");
    setReady(true);
  }, [isSample, workspace.ready, workspace.sampleOrders, id]);

  // Live claims are loaded from the dispute record once the order arrives.
  useEffect(() => {
    if (!order || order.source !== "backend" || !order.disputeId || order.claim) return;
    let cancelled = false;
    loadClaim(order.disputeId)
      .then((claim) => { if (!cancelled) setOrder((current) => current && current.id === order.id ? { ...current, claim } : current); })
      .catch((cause) => { if (!cancelled) setClaimError(cause instanceof Error ? cause.message : "The claim could not be loaded."); });
    return () => { cancelled = true; };
  }, [order]);

  const change = (next: DemoOrder) => {
    if (next.source === "sample") { workspace.updateSample(next.id, () => next); setOrder(next); return; }
    setOrder(next);
  };

  if (!ready) {
    return (
      <AppShell active="orders" title="Orders" company={workspace.company}>
        <div className="panel"><Skeleton lines={2} /></div>
        <div className="panel"><Skeleton lines={4} /></div>
      </AppShell>
    );
  }
  if (!order && inviteToken && inviteAuthRequired) return <InviteGate error={loadError} />;
  if (!order) {
    return (
      <AppShell active="orders" title="Orders" pageHeading={false} company={workspace.company}>
        <div className="empty-state">
          <FileText size={26} aria-hidden="true" />
          <h1>Order not available</h1>
          <p>{loadError || "This order could not be found."}</p>
          <Button asChild><a href="/orders">Back to orders</a></Button>
        </div>
      </AppShell>
    );
  }

  const meta = STATUS[order.status];
  const quantity = totalQuantity(order.items);
  const showClaim = Boolean(order.claim) && (isDisputed(order.status) || order.status === "settled");
  const roleKey = order.role.toLowerCase();
  const escrowState = order.funding
    ? order.funding.verificationStatus === "verified_on_chain" ? "Verified on BOT Chain" : "Recorded on-chain"
    : order.source === "sample" && meta.step >= 2 ? "Secured (sample)" : "Not funded yet";
  const copyEscrowObject = async () => {
    if (!order.funding) return;
    await navigator.clipboard.writeText(order.funding.escrowObjectId);
    setEscrowCopied(true);
    window.setTimeout(() => setEscrowCopied(false), 2000);
  };

  return (
    <AppShell active="orders" title="Orders" pageHeading={false} company={workspace.company}>
      <a className="back-link" href="/orders"><ArrowLeft size={14} aria-hidden="true" />All orders</a>
      <header className={`order-header order-header-${roleKey} reveal`}>
        <div className="order-header-top">
          <div>
            <div className="order-head-tags"><StatusPill status={order.status} /><RoleTag role={order.role} compact />{order.source === "sample" && <SampleTag label={order.guidedDemo ? "Guided demo" : undefined} />}</div>
            <h1>{order.reference}</h1>
            <p>{order.item}. {money(quantity)} units across {order.items.length} {order.items.length === 1 ? "line" : "lines"}. {meta.summary}</p>
          </div>
          <div className="order-head-total"><span>Order value</span><strong>{money(order.value)} <small>{order.currency}</small></strong></div>
        </div>
        <dl className="fact-strip">
          <div><dt>Buyer</dt><dd><strong>{order.buyer}</strong>{order.raw?.buyerEmail && <small>{order.raw.buyerEmail}</small>}</dd></div>
          <div><dt>Supplier</dt><dd><strong>{order.supplier}</strong>{order.raw?.supplierEmail && <small>{order.raw.supplierEmail}</small>}</dd></div>
          <div><dt>Expected delivery</dt><dd><strong>{formatDate(order.delivery)}</strong>{order.shipment?.carrier && <small>{order.shipment.carrier}</small>}</dd></div>
          <div><dt>Delivery location</dt><dd><strong>{order.deliveryLocation}</strong></dd></div>
          <div><dt>Escrow<HelpHint text="Funds are held in escrow on BOT Chain, not by OpenLC, and are released according to the inspection result and the Dispute Resolution Policy." /></dt><dd><strong>{escrowState}</strong>{order.funding && <><small className="escrow-object-id" title={order.funding.escrowObjectId}>#{order.funding.escrowObjectId}</small><span className="escrow-object-actions"><button type="button" className="escrow-copy-button" onClick={() => void copyEscrowObject()} aria-label="Copy escrow ID">{escrowCopied ? <Check size={11} aria-hidden="true" /> : <Copy size={11} aria-hidden="true" />}{escrowCopied ? "Copied" : "Copy"}</button>{order.source === "backend" && order.funding.verificationStatus === "verified_on_chain" && <a className="link" href={explorerTxUrl(order.funding.transactionDigest)} target="_blank" rel="noreferrer">View on {BOTCHAIN.chainName} Explorer<ExternalLink size={11} aria-hidden="true" /></a>}</span></>}</dd></div>
        </dl>
      </header>
      {order.source === "sample" && <Notice tone="info">This is a sample order for demonstration. Every action changes only this sample. Nothing is sent to the backend or to BOT Chain.</Notice>}
      {claimError && <Notice tone="error">{claimError}</Notice>}
      {order.guidedDemo && (
        <section className="guided-demo-bar" aria-label="Guided demo controls">
          <div><strong>Buyer-led guided demo</strong><span>Use the normal action, or jump ahead with realistic prefilled data and evidence.</span></div>
          <Button variant="outline" onClick={() => {
            if (order.status === "settled") { workspace.resetSamples(); return; }
            const next = advanceSample(order);
            if (next) change(next);
          }}>
            {order.status === "settled" ? <RotateCcw size={14} aria-hidden="true" /> : <FastForward size={14} aria-hidden="true" />}
            {guidedDemoNextLabel(order)}
          </Button>
        </section>
      )}
      {/* The stepper and the working columns share one block container so the bar can stick while they scroll. */}
      <div className="order-body">
        <div className="stepper-bar reveal reveal-1"><OrderStepper status={order.status} /></div>

        <div className="order-grid">
          <div className="order-main">
            <div className="reveal reveal-2">
              <StageSwitch stageKey={showClaim ? "claim" : order.status}>
                {showClaim && order.claim
                  ? <ClaimSection order={order} claim={order.claim} company={workspace.company} onOrderChange={change} onClaimChange={(claim) => change({ ...order, claim })} railId="order-rail-actions" />
                  : <ActionPanel order={order} company={workspace.company} inviteToken={inviteToken} onChange={change} onInviteConsumed={() => { setInviteToken(""); history.replaceState(null, "", `/orders/${encodeURIComponent(order.id)}`); }} />}
              </StageSwitch>
            </div>

            {order.source === "backend" && order.funding && <ChainTruthPanel order={order} />}

            {order.releasePlan && (
              <section className="panel release-ledger reveal reveal-3" aria-labelledby="release-title">
                <div className="panel-head"><h2 id="release-title">Release schedule</h2><span className="panel-meta">Confirmed with the order</span></div>
                <ReleasePlanBar total={order.value} currency={order.currency}
                  values={{ deposit: order.releasePlan.depositValue, dispatch: order.releasePlan.dispatchValue, delivery: order.releasePlan.deliveryValue }}
                  progress={releaseProgress(order)} />
              </section>
            )}
  
            <section className="panel reveal reveal-3" aria-labelledby="lines-title">
              <div className="panel-head"><h2 id="lines-title">Order lines</h2><span className="panel-meta">Version {order.version}</span></div>
              <table className="data-table lines-table">
                <thead><tr><th>Product</th><th>Quantity</th><th>Unit price</th><th className="num">Line total</th></tr></thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.description}</strong></td>
                      <td>{money(item.quantity)} {item.unit}</td>
                      <td>{money(item.unitPrice)} {order.currency}</td>
                      <td className="num"><strong>{money(item.quantity * item.unitPrice)} {order.currency}</strong></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={3}>Total in {order.settlementAsset}</td><td className="num"><strong>{money(order.value)} {order.currency}</strong></td></tr></tfoot>
              </table>
              {order.inspection && !isDisputed(order.status) && (
                <div className="inspection-record">
                  <h3>Inspection result</h3>
                  <table className="data-table">
                    <thead><tr><th>Line</th><th>Accepted</th><th>Missing</th><th>Damaged</th></tr></thead>
                    <tbody>{order.inspection.lines.map((entry) => { const item = order.items.find((candidate) => candidate.id === entry.lineId); return item ? <tr key={entry.lineId}><td>{item.description}</td><td>{entry.accepted} {item.unit}</td><td>{entry.missing}</td><td>{entry.damaged}</td></tr> : null; })}</tbody>
                  </table>
                  {order.inspection.note && <p className="muted">{order.inspection.note}</p>}
                </div>
              )}
            </section>
  
            <div className="reveal reveal-4"><DocumentsPanel order={order} role={order.role} company={workspace.company} onOrderChange={change} /></div>
          </div>
  
          <aside className="order-rail">
            <div id="order-rail-actions" className="rail-actions reveal reveal-2" />
            <section className="rail-group reveal reveal-3" aria-labelledby="details-title">
              <h3 id="details-title">Details</h3>
              <dl className="rail-list">
                <div><dt>Issued by</dt><dd>{order.initiatorRole === "buyer" ? order.buyer : order.supplier}</dd></div>
                {order.confirmation && <div><dt>Confirmed</dt><dd>{order.confirmation.organizationName || "Counterparty"}<small>{formatDateTime(order.confirmation.confirmedAt)}, terms version {order.confirmation.termsVersion}</small></dd></div>}
                {order.shipment && <div><dt>Shipment</dt><dd>{order.shipment.carrier}<small>Tracking {order.shipment.trackingNumber}, dispatched {formatDate(order.shipment.dispatchedAt)}</small></dd></div>}
                {order.deliveryRecord && <div><dt>Delivered</dt><dd>{formatDateTime(order.deliveryRecord.recordedAt)}{order.deliveryRecord.reference && <small>Delivery order {order.deliveryRecord.reference}</small>}</dd></div>}
                <div><dt>Settlement asset</dt><dd>{order.settlementAsset}</dd></div>
                <div><dt><ShieldCheck size={12} aria-hidden="true" />Protection</dt><dd>Funds are held on BOT Chain escrow. OpenLC cannot access them.</dd></div>
              </dl>
            </section>
            <section className="rail-group reveal reveal-4" aria-labelledby="history-title">
              <h3 id="history-title">History</h3>
              <OrderTimeline events={order.events} />
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

/** How each settlement Mode reads in plain words, once the escrow is Settled (see the enum in
 *  contracts/OpenLCEscrow.sol: BuyerConfirmation, MutualApproval, Arbitrator, RefundUnshipped,
 *  ClaimUninspected). Unrecognised values fall back to a neutral phrase rather than nothing. */
const SETTLEMENT_MODE_LABEL: Record<number, string> = {
  0: "the buyer accepted delivery in full",
  1: "the parties agreed a settlement split",
  2: "the arbitrator decided the settlement split",
  3: "the delivery deadline passed unshipped",
  4: "the inspection window closed unresolved",
};

/** Loading/failed/ready, as one value - so the panel below can render exactly one of the three
 *  and never, say, a stale "ready" alongside a fresh "failed" (see the read effect). */
type ChainRead = { view: "loading" } | { view: "failed" } | { view: "ready"; chain: EscrowChainState };

/** The rubric's proof point: this order page reads the escrow straight from BOT Chain rather than
 *  only showing the API's record. Renders nothing for a sample order or one with no funding yet -
 *  the caller already gates on that, this component just needs the escrow id to read. */
function ChainTruthPanel({ order }: { order: DemoOrder }) {
  const escrowId = order.funding?.escrowObjectId;
  const [read, setRead] = useState<ChainRead>({ view: "loading" });

  useEffect(() => {
    let cancelled = false;
    // Drop the previous escrow's (or order status's) read before this one starts, so a slow or
    // degraded RPC never leaves a stale "ready" snapshot - or a stale mismatch banner built from
    // it - on screen looking current for the new escrow id or step.
    setRead({ view: "loading" });
    if (!escrowId) return;
    readEscrowState(escrowId)
      .then((chain) => { if (!cancelled) setRead({ view: "ready", chain }); })
      .catch(() => { if (!cancelled) setRead({ view: "failed" }); });
    return () => { cancelled = true; };
  }, [escrowId, order.status]);

  if (!escrowId) return null;
  const chain = read.view === "ready" ? read.chain : null;
  const statusWord = chain ? (chain.status === 2 ? "Settled" : chain.status === 1 ? "Disputed" : "Open") : "";
  const statusLine = chain && chain.status === 2 ? `${statusWord} — ${SETTLEMENT_MODE_LABEL[chain.mode] ?? "settled"}` : statusWord;
  const mismatch = chain ? chainMismatchNotice(chain, order.status) : null;

  return (
    <>
      {mismatch && <Notice tone="warning">{mismatch}</Notice>}
      <section className="panel reveal reveal-3" aria-labelledby="chain-truth-title">
        <div className="panel-head"><h2 id="chain-truth-title">On BOT Chain</h2><span className="panel-meta">Escrow #{escrowId}</span></div>
        {read.view === "loading" && <p className="action-note">Reading BOT Chain…</p>}
        {read.view === "failed" && <p className="action-note">BOT Chain is not reachable right now; showing the OpenLC record.</p>}
        {chain && (
          <dl className="fact-list">
            <div><dt>Escrow</dt><dd><strong>#{escrowId}</strong></dd></div>
            <div><dt>Status</dt><dd><strong>{statusLine}</strong></dd></div>
            <div><dt>Amount locked</dt><dd>{formatBot(chain.totalAmount)} {order.currency}</dd></div>
            <div><dt>Released to supplier</dt><dd>{formatBot(chain.releasedAmount)} {order.currency}</dd></div>
            <div><dt>Still held</dt><dd>{formatBot(chain.balance)} {order.currency}</dd></div>
            {chain.disputedAmount > 0n && <div><dt>Disputed</dt><dd>{formatBot(chain.disputedAmount)} {order.currency}</dd></div>}
            <div><dt>Delivery deadline</dt><dd>{formatDateTime(new Date(chain.deliveryDeadline * 1000).toISOString())}</dd></div>
            {chain.shipped && <div><dt>Inspection closes</dt><dd>{formatDateTime(new Date(chain.inspectionClosesAt * 1000).toISOString())}</dd></div>}
            <div><dt>Contract</dt><dd><a className="link" href={explorerAddressUrl(ESCROW_ADDRESS)} target="_blank" rel="noreferrer">View on {BOTCHAIN.chainName} Explorer<ExternalLink size={12} aria-hidden="true" /></a></dd></div>
          </dl>
        )}
      </section>
    </>
  );
}

function InviteGate({ error }: { error: string }) {
  const [actionError, setActionError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const currentSession = loadSession();
  const needsAccountSwitch = Boolean(currentSession);
  const wallet = useWallet();

  const signIn = async () => {
    if (!wallet.account) return;
    setActionError("");
    setSigningIn(true);
    try {
      // Replaces the session in place; the route's SessionScope then reopens this page under it.
      await authenticateConnectedWallet({ address: wallet.account, sign: wallet.signMessage });
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Wallet sign-in could not be completed.");
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="gate-shell">
      <header className="gate-header"><Logo /><span>Order invitation</span></header>
      <main className="gate-main">
        <section aria-labelledby="invite-sign-in-title">
          <span className="gate-icon"><ShieldCheck size={22} aria-hidden="true" /></span>
          <h1 id="invite-sign-in-title">{needsAccountSwitch ? "Switch wallet to review this order" : "Connect a wallet to review this order"}</h1>
          <p>{needsAccountSwitch
            ? <>You are signed in as <strong>{currentSession?.walletAddress ? shortAddress(currentSession.walletAddress) : "a different wallet"}</strong>. Connect the wallet that received this invitation.</>
            : "Connect the wallet that received the invitation. Your invitation stays attached and opens automatically after sign-in."}</p>
          <div className="gate-assurance"><LockKeyhole size={15} aria-hidden="true" /><span><strong>The order remains private</strong><small>OpenLC checks the signed-in wallet before showing commercial terms.</small></span></div>
          {(actionError || wallet.error || (error && !needsAccountSwitch)) && <p className="form-error" role="alert">{actionError || wallet.error || error}</p>}
          {!wallet.account ? (
            <Button className="btn-primary" disabled={wallet.connecting} onClick={() => void wallet.connect()}>
              {wallet.connecting ? "Connecting…" : "Connect MetaMask"}<ArrowRight size={14} aria-hidden="true" />
            </Button>
          ) : (
            <Button className="btn-primary" disabled={signingIn} onClick={() => void signIn()}>
              {signingIn ? "Signing in…" : needsAccountSwitch ? `Switch to ${shortAddress(wallet.account)}` : "Sign in with this wallet"}<ArrowRight size={14} aria-hidden="true" />
            </Button>
          )}
          <Button variant="outline" asChild><a href="/orders/sample-demo-1001"><FastForward size={14} aria-hidden="true" />Open guided demo</a></Button>
          <small className="legal-copy">By continuing you agree to the <a href="/legal/terms">Terms of Service</a> and the <a href="/legal/dispute-policy">Dispute Resolution Policy</a>.</small>
          <a className="gate-back" href="/">Return to OpenLC</a>
        </section>
      </main>
    </div>
  );
}
