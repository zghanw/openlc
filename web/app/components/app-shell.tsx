"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, Box, Building2, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, FileText, Info, LayoutDashboard, LogOut, Menu, Pencil, Plus, Upload, UserRound, WalletCards, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { STATUS, TERMS, statusLabel, statusTone } from "@/lib/order-status";
import { MotionShell } from "@/app/components/motion";
import { BuiltOnBotChain } from "@/app/components/built-on-botchain";
import { SignInGate } from "@/app/components/sign-in-gate";
import { signOutToLanding, updateWorkspaceName, useSession, type DemoSession } from "@/lib/openlc-api";
import { BOTCHAIN } from "@/lib/chain";
import { isWalletMismatch, shortAddress, useWallet } from "@/lib/wallet";

export function Logo() {
  return (
    <a className="logo" href="/">
      <span className="logo-mark brand-logo-mark" aria-hidden="true"><img src="/favicon.png" alt="" width="40" height="40" /></span>
      <span>OpenLC</span>
    </a>
  );
}

export function HelpHint({ text, label = "More information" }: { text: string; label?: string }) {
  const id = useId();
  return (
    <span className="help-hint">
      <button type="button" className="help-hint-button" aria-label={label} aria-describedby={id}><CircleHelp size={15} aria-hidden="true" /></button>
      <span role="tooltip" id={id} className="help-hint-tip">{text}</span>
    </span>
  );
}

/** Status pills stay still. Pass live only for a process running in front of the user, such as mediation. */
export function StatusPill({ status, className = "", live = false }: { status: string; className?: string; live?: boolean }) {
  const active = live;
  return <span className={`pill pill-${statusTone(status)} pill-status-${status} ${active ? "pill-live" : ""} ${className}`} title={STATUS[status as keyof typeof STATUS]?.summary}>{active && <i aria-hidden="true" />}{statusLabel(status)}</span>;
}

export function RoleTag({ role, compact = false, label }: { role: "BUYER" | "SUPPLIER"; compact?: boolean; label?: string }) {
  return (
    <span className={`role-tag role-tag-${role.toLowerCase()} ${compact ? "role-tag-compact" : ""}`}>
      {role === "BUYER" ? <Building2 size={14} aria-hidden="true" /> : <Box size={14} aria-hidden="true" />}
      {label ?? (role === "BUYER" ? "Buying" : "Supplying")}
    </span>
  );
}

export function Notice({ tone = "info", children, onDismiss }: { tone?: "info" | "success" | "warning" | "error"; children: ReactNode; onDismiss?: () => void }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? AlertTriangle : tone === "error" ? AlertCircle : Info;
  return (
    <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon size={16} aria-hidden="true" />
      <div>{children}</div>
      {onDismiss && <button type="button" className="notice-dismiss" aria-label="Dismiss" onClick={onDismiss}><X size={14} /></button>}
    </div>
  );
}

export function Skeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true">{Array.from({ length: lines }, (_, index) => <span key={index} style={{ width: `${88 - (index % 3) * 18}%` }} />)}</div>;
}

/** Small ledger-style illustration for empty states. */
export function EmptyArt({ kind }: { kind: "inbox" | "documents" | "activity" }) {
  return (
    <svg className="empty-art" viewBox="0 0 120 72" width="120" height="72" aria-hidden="true">
      <rect x="10" y="12" width="100" height="50" rx="6" fill="var(--secondary)" stroke="var(--border-strong)" />
      {kind === "inbox" && <><path d="M10 40h28l6 8h32l6-8h28" fill="none" stroke="var(--border-strong)" /><rect x="34" y="22" width="52" height="4" rx="2" fill="var(--border-strong)" /><rect x="34" y="30" width="36" height="4" rx="2" fill="var(--border-strong)" /></>}
      {kind === "documents" && <><rect x="26" y="4" width="34" height="44" rx="4" fill="var(--card)" stroke="var(--border-strong)" /><rect x="32" y="14" width="22" height="3" rx="1.5" fill="var(--border-strong)" /><rect x="32" y="22" width="18" height="3" rx="1.5" fill="var(--border-strong)" /><rect x="32" y="30" width="20" height="3" rx="1.5" fill="var(--border-strong)" /><rect x="66" y="26" width="30" height="8" rx="2" fill="var(--muted-foreground)" /></>}
      {kind === "activity" && <><path d="M20 48l18-12 14 8 16-18 14 6 18-10" fill="none" stroke="var(--muted-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="68" cy="26" r="3" fill="var(--muted-foreground)" /></>}
    </svg>
  );
}

function UserMenu({ company, session }: { company: string; session: DemoSession | null }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(company);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  const signOut = () => {
    setOpen(false);
    void signOutToLanding();
  };
  const beginEdit = () => {
    setDraft(company);
    setEditError("");
    setOpen(false);
    setEditing(true);
  };
  const saveCompanyName = async () => {
    const name = draft.trim();
    if (name.length < 2 || name.length > 160) {
      setEditError("Enter a company name between 2 and 160 characters.");
      return;
    }
    setSaving(true);
    setEditError("");
    try {
      await updateWorkspaceName(name);
      window.location.reload();
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "The company name could not be saved.");
      setSaving(false);
    }
  };
  const initials = company.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "PP";
  const wallet = session?.walletAddress ? shortAddress(session.walletAddress) : "Signed-in wallet";
  return (
    <>
      <div className="user-menu" ref={ref}>
        <button type="button" className="user-menu-button" aria-haspopup="menu" aria-expanded={open} aria-label={session ? `Account menu, ${company}, ${wallet}` : "Account menu, not signed in"} onClick={() => setOpen((value) => !value)}>
          <span className="user-menu-avatar" aria-hidden="true">{session ? initials : <UserRound size={16} />}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {open && (
          <div className="user-menu-panel" role="menu">
            {session && <div className="user-menu-head"><strong className="user-menu-wallet">{wallet}</strong><small>Signed in</small></div>}
            {session && <button type="button" role="menuitem" onClick={beginEdit}><Pencil size={14} aria-hidden="true" />Edit company name</button>}
            {session && <a role="menuitem" href="/trust">Trust profile</a>}
            <a role="menuitem" href="/legal/terms">Terms of Service</a>
            <a role="menuitem" href="/legal/dispute-policy">Dispute Resolution Policy</a>
            {session && <button type="button" role="menuitem" onClick={signOut}><LogOut size={14} aria-hidden="true" />Sign out</button>}
          </div>
        )}
      </div>
      <Dialog open={editing} onOpenChange={(value) => { if (!saving) setEditing(value); }}>
        <DialogContent className="consent-dialog">
          <form className="company-name-form" onSubmit={(event) => { event.preventDefault(); void saveCompanyName(); }}>
            <DialogHeader>
              <DialogTitle>Edit company name</DialogTitle>
              <DialogDescription>This name appears in your workspace and on new purchase orders and invitations. Existing order records keep the name originally agreed by both parties.</DialogDescription>
            </DialogHeader>
            <label className="field field-wide">
              <span>Company name</span>
              <Input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} minLength={2} maxLength={160} autoComplete="organization" disabled={saving} />
              <small>{draft.trim().length}/160 characters</small>
            </label>
            {editError && <p className="form-error" role="alert">{editError}</p>}
            <DialogFooter>
              <Button variant="outline" type="button" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button>
              <Button className="btn-primary" type="submit" disabled={saving || draft.trim() === company || draft.trim().length < 2}>{saving ? "Saving…" : "Save company name"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

const NAV = [
  { key: "overview", href: "/workspace", label: "Overview", icon: LayoutDashboard },
  { key: "orders", href: "/orders", label: "Orders", icon: FileText },
  { key: "wallet", href: "/wallet", label: "Wallet", icon: WalletCards },
] as const;

const SIDEBAR_KEY = "openlc.sidebar.collapsed";

/**
 * The signed-in frame: a fixed left sidebar (collapsible on desktop, an off-canvas drawer below
 * 768px), a sticky header with the page title, the network state and "New order", then the page.
 * `title` is the page's h1 unless the page renders its own (`pageHeading={false}`).
 */
export function AppShell({ active, company, title, description, actions, pageHeading = true, onNewOrder, children, actionCount = 0 }: {
  active: "overview" | "orders" | "wallet" | "none"; company: string; title: string; description?: ReactNode; actions?: ReactNode;
  pageHeading?: boolean; onNewOrder?: () => void; children: ReactNode; actionCount?: number;
}) {
  const session = useSession();
  const sessionAddress = session?.walletAddress;
  const wallet = useWallet();
  const wrongNetwork = Boolean(wallet.account) && !wallet.isCorrectNetwork;
  const walletMismatch = isWalletMismatch(wallet.account, sessionAddress);
  // The page renders only for a valid session whose wallet MetaMask is still on; otherwise the gate takes its place.
  const gated = !session || walletMismatch;

  // The app renders client-only (providers load with ssr: false), so storage can be read on first render.
  const [collapsed, setCollapsed] = useState(() => { try { return window.localStorage.getItem(SIDEBAR_KEY) === "1"; } catch { return false; } });
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { window.localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0"); } catch { /* storage blocked: the choice lasts this visit */ }
  };

  // Mobile drawer: focus moves in on open and stays inside; Escape and the backdrop close it and focus returns to the menu button.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeDrawer = () => { setDrawerOpen(false); menuButtonRef.current?.focus(); };
  useEffect(() => {
    if (!drawerOpen) return;
    const focusable = () => Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []).filter((element) => element.offsetParent !== null);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setDrawerOpen(false); menuButtonRef.current?.focus(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    // Leaving the mobile width with the drawer open would strand it open behind the desktop sidebar.
    const wide = window.matchMedia("(min-width: 768px)");
    const onWide = () => { if (wide.matches) setDrawerOpen(false); };
    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => { document.removeEventListener("keydown", onKey); wide.removeEventListener("change", onWide); };
  }, [drawerOpen]);

  // The sidebar shows the session's wallet, not whichever account MetaMask happens to be on.
  const address = sessionAddress;
  const walletState = !session || !wallet.account ? "idle" : walletMismatch || wrongNetwork ? "warn" : "ok";
  const walletStateLabel = !session ? "Not signed in" : !wallet.account ? "Wallet not connected" : walletMismatch ? "MetaMask is on another wallet" : wrongNetwork ? "Wrong network" : BOTCHAIN.chainName;
  const initials = company.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "PP";
  const Heading = pageHeading && !gated ? "h1" : "p";

  return (
    <MotionShell>
    <div className={`shell${collapsed ? " shell-collapsed" : ""}${drawerOpen ? " shell-drawer-open" : ""}`}>
      <a className="skip-link" href="#main">Skip to content</a>
      <aside ref={sidebarRef} id="app-sidebar" className="sidebar" aria-label="Workspace">
        <div className="sidebar-brand">
          <a className="sidebar-logo" href="/workspace" title={collapsed ? "OpenLC" : undefined}>
            <span className="sidebar-mark" aria-hidden="true"><img src="/favicon.png" alt="" width="36" height="36" /></span>
            <span className="sidebar-text">OpenLC</span>
          </a>
          <button type="button" className="sidebar-close" aria-label="Close menu" onClick={closeDrawer}><X size={18} aria-hidden="true" /></button>
        </div>
        <nav className="sidebar-nav" aria-label="Main">
          {NAV.map((item) => {
            const Icon = item.icon;
            const current = active === item.key;
            const count = item.key === "orders" && !gated ? actionCount : 0;
            return (
              <a key={item.key} className={`sidebar-link${current ? " sidebar-link-active" : ""}`} href={item.href} aria-current={current ? "page" : undefined}
                title={collapsed ? item.label : undefined} onClick={() => setDrawerOpen(false)}>
                <span className="sidebar-indicator" aria-hidden="true" />
                <Icon size={20} aria-hidden="true" />
                <span className="sidebar-text">{item.label}</span>
                {count > 0 && <span className="nav-count" aria-label={`${count} ${count === 1 ? "order needs" : "orders need"} your action`}>{count}</span>}
              </a>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          {session && (
            <div className="sidebar-account" title={collapsed ? company : undefined}>
              <span className="sidebar-avatar" aria-hidden="true">{initials}</span>
              <span className="sidebar-text"><strong>{company}</strong><small>Workspace</small></span>
            </div>
          )}
          <div className={`wallet-chip wallet-chip-${walletState}`} title={collapsed ? `${address ? shortAddress(address) : "No wallet"}, ${walletStateLabel}` : undefined}>
            <span className="status-dot" aria-hidden="true" />
            <span className="sidebar-text"><strong>{address ? shortAddress(address) : "No wallet"}</strong><small>{walletStateLabel}</small></span>
          </div>
          <button type="button" className="sidebar-collapse" aria-pressed={collapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={toggleCollapsed}>
            {collapsed ? <ChevronRight size={18} aria-hidden="true" /> : <><ChevronLeft size={18} aria-hidden="true" /><span>Collapse</span></>}
          </button>
        </div>
      </aside>
      {drawerOpen && <div className="drawer-backdrop" aria-hidden="true" onClick={closeDrawer} />}

      <div className="shell-body">
        <header className="shell-header">
          <button ref={menuButtonRef} type="button" className="menu-button" aria-label="Open menu" aria-controls="app-sidebar" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}>
            <Menu size={20} aria-hidden="true" />
          </button>
          <Heading className="shell-title">{title}</Heading>
          <div className="shell-header-actions">
            {wrongNetwork ? (
              <button type="button" className="network-pill network-pill-warn" disabled={wallet.switchingNetwork} onClick={() => void wallet.ensureBotChain()}>
                <span className="status-dot" aria-hidden="true" /><span className="network-pill-text">{wallet.switchingNetwork ? "Switching…" : "Switch network"}</span>
              </button>
            ) : (
              <span className="network-pill" title={BOTCHAIN.chainName}><span className="status-dot" aria-hidden="true" /><span className="network-pill-text">{BOTCHAIN.chainName}</span></span>
            )}
            {!gated && (onNewOrder
              ? <button type="button" className="btn btn-primary header-new-order" onClick={onNewOrder}><Plus size={16} aria-hidden="true" /><span>New order</span></button>
              : <a className="btn btn-primary header-new-order" href="/orders?action=create"><Plus size={16} aria-hidden="true" /><span>New order</span></a>)}
            <UserMenu company={company} session={session} />
          </div>
        </header>
        {!gated && wrongNetwork && (
          <Notice tone="warning">
            <span>Your wallet is connected to the wrong network. This app needs <strong>{BOTCHAIN.chainName}</strong>.</span>
            <Button size="sm" variant="outline" disabled={wallet.switchingNetwork} onClick={() => void wallet.ensureBotChain()}>
              {wallet.switchingNetwork ? "Switching…" : `Switch to ${BOTCHAIN.chainName}`}
            </Button>
          </Notice>
        )}
        <main id="main" className="shell-main" tabIndex={-1}>
          {gated ? <SignInGate signedInAs={walletMismatch ? sessionAddress : undefined} /> : <>
            {(description || actions) && (
              <div className="page-intro">
                {description && <p>{description}</p>}
                {actions && <div className="page-intro-actions">{actions}</div>}
              </div>
            )}
            {children}
          </>}
        </main>
        <footer className="shell-footer">
          <BuiltOnBotChain />
          <span><a href="/legal/terms">Terms of Service</a><a href="/legal/dispute-policy">Dispute Resolution Policy</a></span>
        </footer>
      </div>
    </div>
    </MotionShell>
  );
}

export type AgreementClause = string;

/**
 * The agreement people accept before an action: the documents that govern it,
 * the clauses that matter for this step, and one acceptance on behalf of the
 * company. Collapses into a record line once accepted.
 */
export function AgreementBlock({ company, clauses, label, accepted, onChange, record, extraChecks = [] }: {
  company: string; clauses: AgreementClause[]; label?: string; accepted: boolean; onChange: (accepted: boolean) => void;
  record?: { by: string; at: string };
  extraChecks?: Array<{ id: string; text: string; checked: boolean; onChange: (checked: boolean) => void }>;
}) {
  const id = useId();
  if (record) {
    return (
      <div className="agreement agreement-done">
        <Check size={15} aria-hidden="true" />
        <span>Accepted by <strong>{record.by}</strong> on {new Date(record.at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} under Terms of Service and Dispute Resolution Policy version {TERMS.version}.</span>
      </div>
    );
  }
  return (
    <div className="agreement">
      <div className="agreement-head">
        <strong>Agreement</strong>
        <span>{TERMS.documents.map((document, index) => <span key={document.href}>{index > 0 && " and "}<a href={document.href} target="_blank" rel="noreferrer">{document.title}</a></span>)}, version {TERMS.version}, effective {TERMS.effective}.</span>
      </div>
      <ol className="agreement-clauses">
        {clauses.map((clause, index) => <li key={index}>{clause}</li>)}
      </ol>
      {extraChecks.map((check) => (
        <label key={check.id} className="agreement-check agreement-check-secondary">
          <input type="checkbox" checked={check.checked} onChange={(event) => check.onChange(event.target.checked)} />
          <span>{check.text}</span>
        </label>
      ))}
      <label className="agreement-check" htmlFor={id}>
        <input id={id} type="checkbox" checked={accepted} onChange={(event) => onChange(event.target.checked)} />
        <span>{label ?? `I accept these terms on behalf of ${company}.`}</span>
      </label>
    </div>
  );
}

export type ConsentCheck = { id: string; text: string };

/** A confirmation step built on the agreement block. */
export function ConsentDialog({ open, onOpenChange, title, description, clauses, checks = [], company, confirmLabel, onConfirm, busy = false, confirmDisabled = false, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: ReactNode; clauses: AgreementClause[]; checks?: ConsentCheck[]; company: string;
  confirmLabel: string; onConfirm: () => void | Promise<void>; busy?: boolean; /** The form inside is invalid; the dialog's children show why. */ confirmDisabled?: boolean; children?: ReactNode;
}) {
  const [accepted, setAccepted] = useState(false);
  const [extra, setExtra] = useState<Record<string, boolean>>({});
  useEffect(() => { if (open) { setAccepted(false); setExtra({}); } }, [open]);
  const complete = accepted && checks.every((check) => extra[check.id]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="consent-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <AgreementBlock company={company} clauses={clauses} accepted={accepted} onChange={setAccepted}
          extraChecks={checks.map((check) => ({ id: check.id, text: check.text, checked: Boolean(extra[check.id]), onChange: (checked) => setExtra((value) => ({ ...value, [check.id]: checked })) }))} />
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="btn-primary" disabled={!complete || busy || confirmDisabled} onClick={() => void onConfirm()}>{busy ? "Working" : confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FileField({ label, hint, accept, onFile, disabled = false, file }: { label: string; hint?: string; accept: string; onFile: (file: File | null) => void; disabled?: boolean; file?: File | null }) {
  const id = useId();
  return (
    <label className={`file-field ${disabled ? "file-field-disabled" : ""}`} htmlFor={id}>
      <Upload size={16} aria-hidden="true" />
      <span>
        <strong>{file ? file.name : label}</strong>
        <small>{file ? `${(file.size / 1024).toFixed(0)} KB` : hint ?? "PDF, image or text file up to 8 MB"}</small>
      </span>
      <input id={id} type="file" accept={accept} disabled={disabled} onChange={(event) => onFile(event.target.files?.[0] ?? null)} />
    </label>
  );
}
