import { serve } from "@hono/node-server";
import { MediationOrchestrator } from "./ai/mediation.js";
import { loadPolicyCorpus } from "./policy/policy-corpus.js";
import { createApp, type TokenVerifier } from "./api/app.js";
import { WalletSessionVerifier } from "./api/identity-auth.js";
import { DemoAwareTokenVerifier } from "./api/demo-auth.js";
import { config } from "./config.js";
import { DomainError } from "./domain/types.js";
import { DemoOrderService } from "./demo/demo-service.js";
import { MemoryDocumentStore, SupabaseDocumentStore } from "./store/document-store.js";
import { GeminiEmbedder, GeminiJsonModel } from "./integrations/gemini.js";
import { QdrantLegalIndex } from "./integrations/qdrant.js";
import { EvmFundingVerifier, EvmSettlementVerifier, RpcEscrowChainReader } from "./integrations/evm-escrow.js";
import { DisputeService, systemContext } from "./service/dispute-service.js";
import { MemoryDisputeStore } from "./store/store.js";
import { SupabaseDisputeStore } from "./store/supabase-store.js";
import { MemoryTradeStore } from "./store/trade-store.js";
import { SupabaseTradeStore } from "./store/supabase-trade-store.js";
import { TradeService } from "./service/trade-service.js";
import { IdentityService } from "./service/identity-service.js";
import { SupabaseIdentityStore } from "./store/supabase-identity-store.js";
import { OrganizationService } from "./service/organization-service.js";
import { MemoryOrganizationStore } from "./store/organization-store.js";
import { SupabaseOrganizationStore } from "./store/supabase-organization-store.js";
import { BrevoInvitationEmailSender, DisabledInvitationEmailSender, ResendInvitationEmailSender, SmtpInvitationEmailSender } from "./integrations/invitation-email.js";

const store = config.store === "supabase"
  ? new SupabaseDisputeStore(config.supabaseUrl(), config.supabaseSecretKey())
  : new MemoryDisputeStore();
const service = new DisputeService(store, systemContext);
const sessionSecret = config.payProofSessionSecret();
const identity = sessionSecret
  ? new IdentityService(new SupabaseIdentityStore(config.supabaseUrl(), config.supabaseSecretKey()), {
      sessionSecret,
      chainId: config.botchainChainId,
    })
  : undefined;
// No PAYPROOF_SESSION_SECRET means wallet sign-in cannot be configured; there is no other
// production authentication path left to fall back to, so every bearer token is rejected.
const noWalletAuth: TokenVerifier = {
  verify: async () => { throw new DomainError("UNAUTHORIZED", "Invalid or expired user token", 401); },
};
const productionVerifier: TokenVerifier = identity ? new WalletSessionVerifier(identity) : noWalletAuth;
const verifier = new DemoAwareTokenVerifier(productionVerifier, config.demoMode);
let mediator: MediationOrchestrator | undefined;
if (process.env.GEMINI_API_KEY) {
  const embedder = new GeminiEmbedder(config.geminiApiKey(), config.embeddingModel);
  // Statute and case law are retrieved for the human arbitration package only.
  const candidateAuthorities = new QdrantLegalIndex(config.qdrantUrl(), config.qdrantApiKey(), config.legalCollection, embedder);
  const policy = await loadPolicyCorpus(config.disputePolicyFile);
  console.log(`Dispute policy v${policy.version} loaded with ${policy.clauses.length} quotable clauses`);
  mediator = new MediationOrchestrator(
    new GeminiJsonModel(config.geminiApiKey(), config.geminiModel), policy, systemContext, undefined, candidateAuthorities,
  );
}
const demo = config.demoMode ? new DemoOrderService(systemContext) : undefined;
const tradeStore = config.store === "supabase"
  ? new SupabaseTradeStore(config.supabaseUrl(), config.supabaseSecretKey())
  : new MemoryTradeStore();
const organizations = new OrganizationService(config.store === "supabase"
  ? new SupabaseOrganizationStore(config.supabaseUrl(), config.supabaseSecretKey())
  : new MemoryOrganizationStore(), tradeStore);
const smtpHost = config.smtpHost();
const smtpUser = config.smtpUser();
const smtpPassword = config.smtpPassword();
const invitationFrom = config.invitationEmailFrom();
const invitationEmail = config.brevoApiKey() && invitationFrom
  ? new BrevoInvitationEmailSender(config.brevoApiKey()!, invitationFrom)
  : smtpHost && smtpUser && smtpPassword && invitationFrom
    ? new SmtpInvitationEmailSender({
      host: smtpHost,
      port: config.smtpPort(),
      secure: config.smtpSecure(),
      user: smtpUser,
      password: smtpPassword,
      from: invitationFrom,
    })
    : config.resendApiKey() && invitationFrom
        ? new ResendInvitationEmailSender(config.resendApiKey()!, invitationFrom)
        : new DisabledInvitationEmailSender();
console.log("Invitation email sender", invitationEmail instanceof SmtpInvitationEmailSender
  ? `SMTP ${smtpHost}:${config.smtpPort()} (${config.smtpSecure() ? "implicit TLS" : "STARTTLS"})`
  : invitationEmail instanceof BrevoInvitationEmailSender ? "Brevo"
  : invitationEmail instanceof ResendInvitationEmailSender ? "Resend" : "disabled — invitations will report not_configured");
let fundingVerifier: EvmFundingVerifier | undefined;
let settlementVerifier: EvmSettlementVerifier | undefined;
if (config.escrowVerifierEnabled) {
  const escrowAddress = config.escrowAddress();
  if (!escrowAddress || !/^0x[0-9a-fA-F]{40}$/.test(escrowAddress)) {
    throw new Error("ESCROW_VERIFIER_ENABLED is true but OPENLC_ESCROW_ADDRESS is not a valid 20-byte contract address");
  }
  const reader = new RpcEscrowChainReader({ rpcUrl: config.botchainRpcUrl, escrowAddress });
  fundingVerifier = new EvmFundingVerifier({ escrowAddress, reader });
  settlementVerifier = new EvmSettlementVerifier({ escrowAddress, reader });
}
const documentStore = config.store === "supabase"
  ? new SupabaseDocumentStore(config.supabaseUrl(), config.supabaseSecretKey(), config.documentsBucket)
  : new MemoryDocumentStore();
const trades = new TradeService(tradeStore, service, systemContext, process.env.INVITE_BASE_URL ?? "http://localhost:3000/orders", fundingVerifier, organizations, invitationEmail, documentStore);
const app = createApp(service, verifier, mediator, demo, settlementVerifier, trades, config.demoMode, identity, organizations);
serve({ fetch: app.fetch, port: config.port }, ({ port }) => console.log(`PayProof dispute backend listening on http://localhost:${port}`));
