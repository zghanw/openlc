import type { Actor } from "../domain/types.js";
import type { IdentityService } from "../service/identity-service.js";
import type { TokenVerifier } from "./app.js";

/** Adapts IdentityService's wallet session verification to the TokenVerifier the API expects. */
export class WalletSessionVerifier implements TokenVerifier {
  constructor(private readonly identity: IdentityService) {}

  verify(token: string): Promise<Actor> {
    return this.identity.verifySession(token);
  }
}
