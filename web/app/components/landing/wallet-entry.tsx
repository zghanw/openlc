"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { authenticateConnectedWallet } from "@/lib/auth";
import { loadSession } from "@/lib/openlc-api";
import { useWallet } from "@/lib/wallet";

type Phase = "idle" | "connecting" | "signing" | "opening";

const PROGRESS: Record<Exclude<Phase, "idle">, string> = {
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
  const wallet = useWallet();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [noWallet, setNoWallet] = useState(false);
  const [awaitingAccount, setAwaitingAccount] = useState(false);

  function open() {
    setPhase("opening");
    router.push(destination);
  }

  async function signIn(address: string) {
    setPhase("signing");
    try {
      await authenticateConnectedWallet({ address, sign: wallet.signMessage });
      open();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Wallet ownership could not be verified.");
      setPhase("idle");
    }
  }

  // A connect request started by this button has settled: carry on to the signature, or say why not.
  useEffect(() => {
    if (!awaitingAccount || wallet.connecting) return;
    setAwaitingAccount(false);
    if (wallet.account) {
      void signIn(wallet.account);
    } else {
      setError(wallet.error || "MetaMask did not connect. Try again.");
      setPhase("idle");
    }
    // signIn is recreated each render; the effect only needs to react to the connect settling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingAccount, wallet.connecting, wallet.account, wallet.error]);

  function start() {
    if (phase !== "idle") return;
    setError("");
    setNoWallet(false);
    if (loadSession()) return open();
    if (!wallet.hasWallet) return setNoWallet(true);
    if (wallet.account) return void signIn(wallet.account);
    setPhase("connecting");
    setAwaitingAccount(true);
    void wallet.connect();
  }

  return { phase, error, noWallet, start };
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
