import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  IdentityStore,
  PayProofAccount,
  WalletChallenge,
} from "./identity-store.js";

type AccountRow = {
  id: string;
  supabase_user_id?: string | null;
  email?: string | null;
  display_name?: string | null;
  openlc_wallet_identities?: Array<{ address: string }>;
};

export class SupabaseIdentityStore implements IdentityStore {
  private readonly client: SupabaseClient;

  constructor(url: string, secretKey: string) {
    this.client = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private account(row: AccountRow): PayProofAccount {
    return {
      id: row.id,
      supabaseUserId: row.supabase_user_id ?? undefined,
      email: row.email ?? undefined,
      name: row.display_name ?? undefined,
      walletAddress: row.openlc_wallet_identities?.[0]?.address,
    };
  }

  async findAccountById(id: string): Promise<PayProofAccount | undefined> {
    const { data, error } = await this.client
      .from("openlc_accounts")
      .select("*,openlc_wallet_identities(address)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Supabase account lookup failed: ${error.message}`);
    return data ? this.account(data as AccountRow) : undefined;
  }

  async findAccountByAddress(address: string): Promise<PayProofAccount | undefined> {
    const { data, error } = await this.client
      .from("openlc_wallet_identities")
      .select("openlc_accounts(*)")
      .eq("address", address)
      .maybeSingle();
    if (error) throw new Error(`Supabase wallet identity lookup failed: ${error.message}`);
    const account = data?.openlc_accounts as unknown as AccountRow | undefined;
    return account ? { ...this.account(account), walletAddress: address } : undefined;
  }

  async createWalletAccount(address: string): Promise<PayProofAccount> {
    const { data, error } = await this.client.rpc("resolve_wallet_account", {
      p_address: address,
    });
    if (error) throw new Error(`Supabase wallet account resolution failed: ${error.message}`);
    return { ...this.account(data as AccountRow), walletAddress: address };
  }

  async createChallenge(challenge: WalletChallenge): Promise<void> {
    const { error } = await this.client.from("wallet_auth_challenges").insert({
      id: challenge.id,
      address: challenge.address,
      message: challenge.message,
      expires_at: challenge.expiresAt,
    });
    if (error) throw new Error(`Supabase wallet challenge create failed: ${error.message}`);
  }

  async getChallenge(id: string): Promise<WalletChallenge | undefined> {
    const { data, error } = await this.client
      .from("wallet_auth_challenges")
      .select("id,address,message,expires_at,used_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Supabase wallet challenge read failed: ${error.message}`);
    return data ? {
      id: data.id,
      address: data.address,
      message: data.message,
      expiresAt: data.expires_at,
      usedAt: data.used_at ?? undefined,
    } : undefined;
  }

  async consumeChallenge(id: string, usedAt: string): Promise<boolean> {
    const { data, error } = await this.client.rpc("consume_wallet_challenge", {
      p_id: id,
      p_used_at: usedAt,
    });
    if (error) throw new Error(`Supabase wallet challenge consume failed: ${error.message}`);
    return data === true;
  }
}
