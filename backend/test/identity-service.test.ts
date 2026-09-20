import { Wallet } from "ethers";
import { describe, expect, it } from "vitest";
import { IdentityService } from "../src/service/identity-service.js";
import { MemoryIdentityStore } from "../src/store/identity-store.js";

const SESSION_SECRET = "test-only-session-secret-that-is-at-least-thirty-two-bytes";
const CHAIN_ID = 968;

describe("IdentityService", () => {
  it("issues a session for a challenge signed by an ethers wallet, and names BOT Chain", async () => {
    const wallet = Wallet.createRandom();
    const store = new MemoryIdentityStore();
    const service = new IdentityService(store, { sessionSecret: SESSION_SECRET, chainId: CHAIN_ID });

    const challenge = await service.createWalletChallenge(wallet.address, "http://localhost:3000");
    expect(challenge.message).toContain("Sign in to OpenLC");
    expect(challenge.message).toContain(`Address: ${wallet.address}`);
    expect(challenge.message).toContain(`Network: BOT Chain (chain ${CHAIN_ID})`);

    const signature = await wallet.signMessage(challenge.message);
    const verified = await service.verifyWalletChallenge({
      challengeId: challenge.id,
      address: wallet.address,
      signature,
    });

    expect(verified.account.walletAddress).toBe(wallet.address);
    expect(verified.accessToken).toBeTruthy();
  });

  it("rejects replay of an already-used challenge", async () => {
    const wallet = Wallet.createRandom();
    const service = new IdentityService(new MemoryIdentityStore(), {
      sessionSecret: SESSION_SECRET,
      chainId: CHAIN_ID,
    });
    const challenge = await service.createWalletChallenge(wallet.address, "http://localhost:3000");
    const signature = await wallet.signMessage(challenge.message);
    await service.verifyWalletChallenge({ challengeId: challenge.id, address: wallet.address, signature });

    await expect(
      service.verifyWalletChallenge({ challengeId: challenge.id, address: wallet.address, signature }),
    ).rejects.toMatchObject({ code: "CHALLENGE_ALREADY_USED" });
  });

  it("rejects a challenge signed by a different wallet", async () => {
    const expected = Wallet.createRandom();
    const attacker = Wallet.createRandom();
    const service = new IdentityService(new MemoryIdentityStore(), {
      sessionSecret: SESSION_SECRET,
      chainId: CHAIN_ID,
    });
    const challenge = await service.createWalletChallenge(expected.address, "http://localhost:3000");
    const signature = await attacker.signMessage(challenge.message);

    await expect(
      service.verifyWalletChallenge({
        challengeId: challenge.id,
        address: expected.address,
        signature,
      }),
    ).rejects.toMatchObject({ code: "INVALID_WALLET_SIGNATURE" });
  });

  it("rejects an expired challenge", async () => {
    const wallet = Wallet.createRandom();
    let now = new Date("2026-09-02T00:00:00.000Z");
    const service = new IdentityService(new MemoryIdentityStore(), {
      sessionSecret: SESSION_SECRET,
      chainId: CHAIN_ID,
      now: () => now,
    });
    const challenge = await service.createWalletChallenge(wallet.address, "http://localhost:3000");
    const signature = await wallet.signMessage(challenge.message);
    now = new Date("2026-09-02T00:10:00.000Z"); // ten minutes later, past the five-minute expiry

    await expect(
      service.verifyWalletChallenge({ challengeId: challenge.id, address: wallet.address, signature }),
    ).rejects.toMatchObject({ code: "CHALLENGE_EXPIRED" });
  });

  it("resolves a lowercase or checksummed address to the same account", async () => {
    const wallet = Wallet.createRandom();
    const store = new MemoryIdentityStore();
    const service = new IdentityService(store, { sessionSecret: SESSION_SECRET, chainId: CHAIN_ID });

    const first = await service.createWalletChallenge(wallet.address, "http://localhost:3000");
    const firstSession = await service.verifyWalletChallenge({
      challengeId: first.id,
      address: wallet.address,
      signature: await wallet.signMessage(first.message),
    });

    const second = await service.createWalletChallenge(wallet.address.toLowerCase(), "http://localhost:3000");
    const secondSession = await service.verifyWalletChallenge({
      challengeId: second.id,
      address: wallet.address.toLowerCase(),
      signature: await wallet.signMessage(second.message),
    });

    expect(secondSession.account.id).toBe(firstSession.account.id);
    expect(secondSession.account.walletAddress).toBe(wallet.address);
  });

  it("rejects a value that is not a valid EVM address", async () => {
    const service = new IdentityService(new MemoryIdentityStore(), { sessionSecret: SESSION_SECRET, chainId: CHAIN_ID });
    await expect(
      service.createWalletChallenge("not-an-address", "http://localhost:3000"),
    ).rejects.toMatchObject({ code: "INVALID_WALLET_ADDRESS" });
  });
});
