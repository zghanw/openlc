"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useWalletSignIn, type SignInPhase } from "@/lib/auth";
import { loadSession } from "@/lib/openlc-api";

const PROGRESS: Record<Exclude<SignInPhase, "idle">, string> = {
  connecting: "Connecting…",
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

export function WalletEntry({
  destination,
  children,
  variant = "primary",
}: {
  destination: string;
  children: ReactNode;
  variant?: "primary" | "header";
}) {
  const { phase, error, noWallet, start } = useWalletEntry(destination);
  const busy = phase !== "idle";

  return (
    <div className={`lp-entry lp-entry--${variant}`}>
      <button
        type="button"
        className={variant === "primary" ? "lp-pill lp-pill--solid" : "lp-pill lp-pill--outline lp-pill--small"}
        onClick={start}
        disabled={busy}
        aria-busy={busy}
      >
        <span>{busy ? PROGRESS[phase] : children}</span>
        {busy ? (
          <LoaderCircle className="lp-spin" size={variant === "primary" ? 17 : 14} aria-hidden="true" />
        ) : (
          <ArrowRight size={variant === "primary" ? 17 : 14} aria-hidden="true" />
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
