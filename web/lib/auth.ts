"use client";

import { backendUrl, saveSession, type DemoSession } from "@/lib/openlc-api";

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
    throw new Error(`Could not create a wallet sign-in request (${challengeResponse.status}).`);
  const challenge = (await challengeResponse.json()) as { id: string; message: string };
  const signature = await input.sign(challenge.message);
  const verifyResponse = await fetch(`${backendUrl()}/auth/wallet/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ challengeId: challenge.id, address: input.address, signature }),
  });
  if (!verifyResponse.ok) {
    const payload = (await verifyResponse.json().catch(() => ({}))) as { message?: string };
    throw new Error(payload.message ?? `Wallet verification failed (${verifyResponse.status}).`);
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
