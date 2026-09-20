export interface PayProofAccount {
  id: string;
  supabaseUserId?: string;
  email?: string;
  name?: string;
  walletAddress?: string;
}

export interface WalletChallenge {
  id: string;
  address: string;
  message: string;
  expiresAt: string;
  usedAt?: string;
}

export interface IdentityStore {
  findAccountById(id: string): Promise<PayProofAccount | undefined>;
  findAccountByAddress(address: string): Promise<PayProofAccount | undefined>;
  createWalletAccount(address: string): Promise<PayProofAccount>;
  createChallenge(challenge: WalletChallenge): Promise<void>;
  getChallenge(id: string): Promise<WalletChallenge | undefined>;
  consumeChallenge(id: string, usedAt: string): Promise<boolean>;
}

export class MemoryIdentityStore implements IdentityStore {
  private readonly accounts = new Map<string, PayProofAccount>();
  private readonly addressAccounts = new Map<string, string>();
  private readonly challenges = new Map<string, WalletChallenge>();

  async findAccountById(id: string): Promise<PayProofAccount | undefined> {
    const account = this.accounts.get(id);
    return account ? structuredClone(account) : undefined;
  }

  async findAccountByAddress(address: string): Promise<PayProofAccount | undefined> {
    const id = this.addressAccounts.get(address);
    return id ? structuredClone(this.accounts.get(id)!) : undefined;
  }

  async createWalletAccount(address: string): Promise<PayProofAccount> {
    const existing = await this.findAccountByAddress(address);
    if (existing) return existing;
    const account: PayProofAccount = {
      id: crypto.randomUUID(),
      walletAddress: address,
    };
    this.accounts.set(account.id, account);
    this.addressAccounts.set(address, account.id);
    return structuredClone(account);
  }

  async createChallenge(challenge: WalletChallenge): Promise<void> {
    this.challenges.set(challenge.id, structuredClone(challenge));
  }

  async getChallenge(id: string): Promise<WalletChallenge | undefined> {
    const challenge = this.challenges.get(id);
    return challenge ? structuredClone(challenge) : undefined;
  }

  async consumeChallenge(id: string, usedAt: string): Promise<boolean> {
    const challenge = this.challenges.get(id);
    if (!challenge || challenge.usedAt) return false;
    this.challenges.set(id, { ...challenge, usedAt });
    return true;
  }
}
