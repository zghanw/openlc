"use client";

import { useEffect, useState } from "react";
import { backendUrl, saveSession, type DemoSession } from "@/lib/openlc-api";
import { useWallet } from "@/lib/wallet";

/**
 * Wallet sign-in only. POSTs for a challenge, signs the returned message with the connected
 * wallet's personal_sign (EIP-191, via ethers' signMessage), verifies it, and stores the session
 * exactly like every other sign-in path so openlc-api.ts keeps working unchanged.
 *
 * MetaMask is the only sign-in surface.
 */
export async function authenticateConnectedWallet(input: {
  address: string;
  sign: (message: string) => Promise<string>;
}): Promise<DemoSession> {
  const challengeResponse = await fetch(`${backendUrl()}/auth/wallet/challenge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: input.address }),
  });
  if (!challengeResponse.ok)
    throw new Error(challengeResponse.status >= 500
      ? "OpenLC could not start signing in right now. Try again in a minute."
      : "OpenLC could not start signing in with this wallet. Reload the page and try again.");
  const challenge = (await challengeResponse.json()) as { id: string; message: string };
  const signature = await input.sign(challenge.message);
  const verifyResponse = await fetch(`${backendUrl()}/auth/wallet/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ challengeId: challenge.id, address: input.address, signature }),
  });
  if (!verifyResponse.ok) {
    const payload = (await verifyResponse.json().catch(() => ({}))) as { message?: string };
    throw new Error(payload.message ?? "OpenLC could not confirm your signature. Sign in again.");
  }
  const verified = (await verifyResponse.json()) as {
    accessToken: string;
    account: { id: string; walletAddress: string };
  };
  const session: DemoSession = {
    accessToken: verified.accessToken,
    mode: "wallet",
    walletAddress: verified.account.walletAddress,
    user: { id: verified.account.id, email: "", name: "Connected wallet" },
  };
  saveSession(session);
  return session;
}

export type SignInPhase = "idle" | "connecting" | "signing" | "opening";

/**
 * One click from "not signed in" to a session: connect MetaMask if it isn't yet, then sign the
 * readable sign-in message. Shared by the landing's entry button and the workspace sign-in gate.
 * `onSignedIn` runs once the session is stored; the phase then stays "opening".
 */
export function useWalletSignIn(onSignedIn?: () => void) {
  const wallet = useWallet();
  const [phase, setPhase] = useState<SignInPhase>("idle");
  const [error, setError] = useState("");
  const [noWallet, setNoWallet] = useState(false);
  const [awaitingAccount, setAwaitingAccount] = useState(false);

  async function signIn(address: string) {
    setPhase("signing");
    try {
      await authenticateConnectedWallet({ address, sign: wallet.signMessage });
      setPhase("opening");
      onSignedIn?.();
    } catch (caught) {
      // fetch rejects with a TypeError only when the request never got an answer.
      setError(caught instanceof TypeError
        ? "OpenLC could not be reached. Check your connection and try again."
        : caught instanceof Error ? caught.message : "Wallet ownership could not be verified.");
      setPhase("idle");
    }
  }

  // A connect request started by start() has settled: carry on to the signature, or say why not.
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

  /** Signs in with the account MetaMask is on now, connecting first when none is. */
  function start() {
    if (phase !== "idle") return;
    setError("");
    setNoWallet(false);
    if (!wallet.hasWallet) return setNoWallet(true);
    if (wallet.account) return void signIn(wallet.account);
    setPhase("connecting");
    setAwaitingAccount(true);
    void wallet.connect();
  }

  return { phase, error, noWallet, start };
}
