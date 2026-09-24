import "dotenv/config";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env"), override: false });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export const config = {
  supabaseUrl: () => required("SUPABASE_URL"),
  supabasePublishableKey: () => required("SUPABASE_PUBLISHABLE_KEY"),
  supabaseSecretKey: () => required("SUPABASE_SECRET_KEY"),
  payProofSessionSecret: () => optional("OPENLC_SESSION_SECRET"),
  botchainChainId: Number(process.env.BOTCHAIN_CHAIN_ID ?? 677),
  qdrantUrl: () => required("QDRANT_URL"),
  qdrantApiKey: () => required("QDRANT_API_KEY"),
  geminiApiKey: () => required("GEMINI_API_KEY"),
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3-flash-preview,gemini-3.5-flash",
  embeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-2",
  legalCollection: process.env.LEGAL_COLLECTION ?? "payproof_malaysia_law_v1",
  disputePolicyFile: process.env.DISPUTE_POLICY_FILE ?? fileURLToPath(new URL("../../docs/dispute-policy.md", import.meta.url)),
  store: process.env.BACKEND_STORE ?? "memory",
  documentsBucket: process.env.OPENLC_DOCUMENTS_BUCKET ?? "openlc-documents",
  port: Number(process.env.PORT ?? 8787),
  escrowVerifierEnabled: process.env.ESCROW_VERIFIER_ENABLED === "true",
  botchainRpcUrl: process.env.BOTCHAIN_RPC_URL ?? "https://rpc.botchain.ai",
  escrowAddress: () => optional("OPENLC_ESCROW_ADDRESS"),
  escrowDeployBlock: Number(process.env.OPENLC_ESCROW_DEPLOY_BLOCK ?? 0),
  resendApiKey: () => optional("RESEND_API_KEY"),
  brevoApiKey: () => optional("BREVO_API_KEY"),
  invitationEmailFrom: () => optional("INVITATION_EMAIL_FROM"),
  smtpHost: () => optional("SMTP_HOST"),
  smtpPort: () => Number(optional("SMTP_PORT") ?? 465),
  smtpSecure: () => optional("SMTP_SECURE") !== "false",
  smtpUser: () => optional("SMTP_USER"),
  smtpPassword: () => optional("SMTP_PASS"),
  corpusDir: path.resolve(here, "../../docs/corpus"),
};
