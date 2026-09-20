import { Wallet } from "ethers";
import { describe, expect, it } from "vitest";
import { WalletSessionVerifier } from "../src/api/identity-auth.js";
import { IdentityService } from "../src/service/identity-service.js";
import { MemoryIdentityStore } from "../src/store/identity-store.js";

const options = {
  sessionSecret: "test-only-session-secret-that-is-at-least-thirty-two-bytes",
  chainId: 968,
};

describe("wallet session authentication", () => {
  it("accepts the session issued from a signed wallet challenge", async () => {
    const identity = new IdentityService(new MemoryIdentityStore(), options);
    const wallet = Wallet.createRandom();
    const challenge = await identity.createWalletChallenge(wallet.address, "http://localhost:3000");
    const signature = await wallet.signMessage(challenge.message);
    const session = await identity.verifyWalletChallenge({
      challengeId: challenge.id,
      address: wallet.address,
      signature,
    });

    const verifier = new WalletSessionVerifier(identity);
    const actor = await verifier.verify(session.accessToken);
    expect(actor.id).toBe(session.account.id);
    expect(actor.walletAddress).toBe(wallet.address);
  });

  it("rejects a token that is not a valid wallet session", async () => {
    const identity = new IdentityService(new MemoryIdentityStore(), options);
    const verifier = new WalletSessionVerifier(identity);
    await expect(verifier.verify("garbage")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
