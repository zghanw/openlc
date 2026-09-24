"use client";

import { Fragment, type ReactNode } from "react";
import { ArrowRight, Clock, LoaderCircle, LogOut, PenLine, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWalletSignIn } from "@/lib/auth";
import { clearSession, signOutSession, useSession } from "@/lib/openlc-api";
import { TERMS } from "@/lib/order-status";
import { shortAddress, useWallet } from "@/lib/wallet";

const PROGRESS = { connecting: "Connecting…", signing: "Sign the message in MetaMask…", opening: "Opening…" } as const;

/**
 * Remounts a signed-in route whenever the session changes (sign-in, sign-out, expiry, another tab),
 * so a page never shows data it loaded for a different session, and a fresh sign-in reopens the
 * same URL, query included.
 */
export function SessionScope({ children }: { children: ReactNode }) {
  const session = useSession();
  return <Fragment key={session?.accessToken ?? "signed-out"}>{children}</Fragment>;
}

/**
 * Shown by AppShell in place of the page when there is no valid session, or, with `signedInAs`,
 * when MetaMask has moved to a different wallet than the session signed in with.
 */
export function SignInGate({ signedInAs }: { signedInAs?: string }) {
  const wallet = useWallet();
  const { phase, error, noWallet, start } = useWalletSignIn();
  const busy = phase !== "idle";
  const switching = Boolean(signedInAs && wallet.account);
  const signOut = () => { signOutSession().catch(clearSession); };

  return (
    <section className="signin-gate" aria-labelledby="signin-gate-title">
      <div className="signin-card">
        <span className="signin-mark" aria-hidden="true"><img src="/favicon.png" alt="" width="48" height="48" /></span>
        {switching ? (
          <>
            <h1 id="signin-gate-title">Switch workspace</h1>
            <p className="signin-lede">MetaMask is on <code>{shortAddress(wallet.account!)}</code>, but you are signed in as <code>{shortAddress(signedInAs!)}</code>.</p>
            <p className="signin-lede">Each wallet is its own workspace. Sign in as this wallet, or switch MetaMask back.</p>
          </>
        ) : (
          <>
            <h1 id="signin-gate-title">Sign in to your workspace</h1>
            <ul className="signin-points">
              <li><WalletCards size={16} aria-hidden="true" /><span>Your wallet is your account. Each wallet has its own workspace.</span></li>
              <li><PenLine size={16} aria-hidden="true" /><span>Signing proves the wallet is yours. It is not a transaction and costs no fee.</span></li>
              <li><Clock size={16} aria-hidden="true" /><span>You stay signed in for 12 hours.</span></li>
            </ul>
          </>
        )}
        <div className="signin-actions">
          <Button className="btn-primary" disabled={busy} aria-busy={busy} onClick={start}>
            {busy ? PROGRESS[phase] : switching ? `Sign in as ${shortAddress(wallet.account!)}` : "Sign in with MetaMask"}
            {busy ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <ArrowRight size={15} aria-hidden="true" />}
          </Button>
          {switching && <Button variant="outline" disabled={busy} onClick={signOut}><LogOut size={15} aria-hidden="true" />Sign out</Button>}
        </div>
        {!switching && wallet.account && !busy && <p className="signin-note">MetaMask is on <code>{shortAddress(wallet.account)}</code>.</p>}
        {noWallet && (
          <p className="form-error" role="alert">
            No wallet found. <a href="https://metamask.io/download" target="_blank" rel="noreferrer">Install MetaMask</a>, then reload this page.
          </p>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <p className="signin-consent">
          By signing in you agree to the {TERMS.documents.map((document, index) => (
            <Fragment key={document.href}>{index > 0 && " and the "}<a href={document.href} target="_blank" rel="noreferrer">{document.title}</a></Fragment>
          ))}.
        </p>
      </div>
    </section>
  );
}
