import { getAddress, verifyMessage } from "ethers";
import { SignJWT, jwtVerify } from "jose";
import { DomainError, type Actor } from "../domain/types.js";
import type {
  IdentityStore,
  PayProofAccount,
} from "../store/identity-store.js";

const encoder = new TextEncoder();

export interface IdentityServiceOptions {
  sessionSecret: string;
  chainId: number;
  now?: () => Date;
}

export class IdentityService {
  private readonly now: () => Date;
  private readonly sessionKey: Uint8Array;

  constructor(
    private readonly store: IdentityStore,
    private readonly options: IdentityServiceOptions,
  ) {
    if (options.sessionSecret.length < 32)
      throw new Error("OPENLC_SESSION_SECRET must contain at least 32 characters");
    this.now = options.now ?? (() => new Date());
    this.sessionKey = encoder.encode(options.sessionSecret);
  }

  async account(id: string): Promise<PayProofAccount | undefined> {
    return this.store.findAccountById(id);
  }

  /** Find-or-create for a wallet address with no signature step, for a system account (the demo
   *  supplier) rather than a session login. Reuses the same store calls wallet sign-in uses. */
  async findOrCreateWalletAccount(address: string): Promise<PayProofAccount> {
    const normalized = this.normalizeAddress(address);
    const existing = await this.store.findAccountByAddress(normalized);
    if (existing) return existing;
    return this.store.createWalletAccount(normalized);
  }

  /** Checksums the address (EIP-55) and rejects anything that is not a valid EVM address. */
  private normalizeAddress(address: string): string {
    try {
      return getAddress(address);
    } catch {
      throw new DomainError(
        "INVALID_WALLET_ADDRESS",
        `${address} is not a valid EVM wallet address`,
        400,
      );
    }
  }

  async createWalletChallenge(address: string, origin: string) {
    const normalized = this.normalizeAddress(address);
    const issuedAt = this.now();
    const expiresAt = new Date(issuedAt.getTime() + 5 * 60_000);
    const id = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    const message = [
      "Sign in to OpenLC",
      "",
      `Address: ${normalized}`,
      `Origin: ${origin}`,
      `Network: BOT Chain (chain ${this.options.chainId})`,
      `Nonce: ${nonce}`,
      `Issued at: ${issuedAt.toISOString()}`,
      `Expires at: ${expiresAt.toISOString()}`,
      "",
      "This request does not submit a transaction or spend funds.",
    ].join("\n");
    await this.store.createChallenge({
      id,
      address: normalized,
      message,
      expiresAt: expiresAt.toISOString(),
    });
    return { id, message, expiresAt: expiresAt.toISOString() };
  }

  async verifyWalletChallenge(input: {
    challengeId: string;
    address: string;
    signature: string;
  }): Promise<{ account: PayProofAccount; accessToken: string }> {
    const normalized = this.normalizeAddress(input.address);
    const challenge = await this.store.getChallenge(input.challengeId);
    if (!challenge)
      throw new DomainError("CHALLENGE_NOT_FOUND", "The wallet challenge was not found", 404);
    if (challenge.usedAt)
      throw new DomainError("CHALLENGE_ALREADY_USED", "This wallet challenge has already been used", 409);
    if (challenge.address !== normalized)
      throw new DomainError("CHALLENGE_ADDRESS_MISMATCH", "The connected wallet does not match the challenge", 403);
    if (new Date(challenge.expiresAt).getTime() <= this.now().getTime())
      throw new DomainError("CHALLENGE_EXPIRED", "The wallet challenge has expired", 410);

    let recovered: string;
    try {
      recovered = verifyMessage(challenge.message, input.signature);
    } catch {
      throw new DomainError(
        "INVALID_WALLET_SIGNATURE",
        "The signature does not prove control of the connected wallet address",
        401,
      );
    }
    if (recovered !== normalized)
      throw new DomainError(
        "INVALID_WALLET_SIGNATURE",
        "The signature does not prove control of the connected wallet address",
        401,
      );

    const consumed = await this.store.consumeChallenge(
      input.challengeId,
      this.now().toISOString(),
    );
    if (!consumed)
      throw new DomainError("CHALLENGE_ALREADY_USED", "This wallet challenge has already been used", 409);
    const account = await this.store.createWalletAccount(normalized);
    return { account, accessToken: await this.issueSession(account) };
  }

  async verifySession(token: string): Promise<Actor> {
    try {
      const { payload } = await jwtVerify(token, this.sessionKey, {
        issuer: "payproof",
        audience: "payproof-api",
      });
      if (!payload.sub) throw new Error("missing subject");
      const account = await this.store.findAccountById(payload.sub);
      if (!account) throw new Error("account not found");
      if (!account.walletAddress) throw new Error("account has no verified wallet address");
      return {
        id: account.id,
        email: account.email,
        name: account.name,
        walletAddress: account.walletAddress,
      };
    } catch (error) {
      console.warn(`Session rejected: ${error instanceof Error ? error.message : String(error)}`);
      throw new DomainError("UNAUTHORIZED", "Invalid or expired user token", 401);
    }
  }

  private async issueSession(account: PayProofAccount): Promise<string> {
    return new SignJWT({ address: account.walletAddress, auth: "evm-wallet" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer("payproof")
      .setAudience("payproof-api")
      .setSubject(account.id)
      .setIssuedAt()
      .setExpirationTime("12h")
      .sign(this.sessionKey);
  }
}
