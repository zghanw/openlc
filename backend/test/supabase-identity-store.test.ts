import { describe, expect, it } from "vitest";
import { accountFromRow } from "../src/store/supabase-identity-store.js";

describe("accountFromRow", () => {
  const base = { id: "a1", supabase_user_id: null, email: null, display_name: null };
  it("reads the wallet from PostgREST's one-to-one object embed", () => {
    expect(accountFromRow({ ...base, openlc_wallet_identities: { address: "0xabc" } }).walletAddress).toBe("0xabc");
  });
  it("still reads an array embed", () => {
    expect(accountFromRow({ ...base, openlc_wallet_identities: [{ address: "0xdef" }] }).walletAddress).toBe("0xdef");
  });
  it("has no wallet when the embed is null", () => {
    expect(accountFromRow({ ...base, openlc_wallet_identities: null }).walletAddress).toBeUndefined();
  });
});
