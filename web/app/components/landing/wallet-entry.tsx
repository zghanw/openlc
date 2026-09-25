"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useWalletSignIn, type SignInPhase } from "@/lib/auth";
import { loadSession, useSession } from "@/lib/openlc-api";

const PROGRESS: Record<Exclude<SignInPhase, "idle">, string> = {
  connecting: "Connecting…",
  preparing: "Preparing…",
  signing: "Sign the message in MetaMask…",
  opening: "Opening…",
};

/**
 * One click from the landing page into the app: an existing session goes straight through;
 * otherwise connect MetaMask, sign the readable sign-in message, then navigate.
 */
function useWalletEntry(destination: string) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const open = () => {
    setLeaving(true);
    router.push(destination);
  };
  const signIn = useWalletSignIn(open);
  const phase: SignInPhase = leaving ? "opening" : signIn.phase;

  function start() {
    if (phase !== "idle") return;
    if (loadSession()) return open();
    signIn.start();
  }

  return { phase, error: signIn.error, noWallet: signIn.noWallet, start };
}

const PILL = {
  primary: "lp-pill lp-pill--solid",
  ghost: "lp-pill lp-pill--ghost",
  header: "lp-pill lp-pill--outline lp-pill--small",
} as const;

/** A landing pill into the app. Each pill runs its own sign-in, so only the clicked one shows progress.
 *  `signedInLabel` replaces the label while a valid session exists (the click then goes straight through). */
export function WalletEntry({
  destination,
  children,
  signedInLabel,
  variant = "primary",
}: {
  destination: string;
  children: ReactNode;
  signedInLabel?: ReactNode;
  variant?: keyof typeof PILL;
}) {
  const { phase, error, noWallet, start } = useWalletEntry(destination);
  const session = useSession();
  const busy = phase !== "idle";
  const iconSize = variant === "header" ? 14 : 17;

  return (
    <div className={`lp-entry lp-entry--${variant}`}>
      <button type="button" className={PILL[variant]} onClick={start} disabled={busy} aria-busy={busy}>
        <span>{busy ? PROGRESS[phase] : session && signedInLabel ? signedInLabel : children}</span>
        {busy ? (
          <LoaderCircle className="lp-spin" size={iconSize} aria-hidden="true" />
        ) : (
          <ArrowRight size={iconSize} aria-hidden="true" />
        )}
      </button>
      {(noWallet || error) && (
        <p className="lp-entry-note" role="alert">
          {noWallet ? (
            <>
              No wallet found.{" "}
              <a href="https://metamask.io/download" target="_blank" rel="noreferrer">
                Install MetaMask
              </a>
              , then reload this page.
            </>
          ) : (
            error
          )}
        </p>
      )}
    </div>
  );
}
