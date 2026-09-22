import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import type { MediationOrchestrator } from "../ai/mediation.js";
import { type DemoCommand, type DemoOrderService } from "../demo/demo-service.js";
import { DomainError, type Actor } from "../domain/types.js";
import type { DisputeService } from "../service/dispute-service.js";
import type { TradeService } from "../service/trade-service.js";
import type { EscrowSettlementVerifier } from "../integrations/evm-escrow.js";
import { issueDemoGoogleSession } from "./demo-auth.js";
import type { IdentityService } from "../service/identity-service.js";
import type { OrganizationService } from "../service/organization-service.js";

export interface TokenVerifier { verify(token: string): Promise<Actor>; }

const amount = z.string().regex(/^(0|[1-9]\d*)$/);
const proposalSchema = z.object({ buyerUnits: amount, supplierUnits: amount, summary: z.string().min(1).max(2000), reasoning: z.string().max(10_000).optional() });
const fileSchema = z.object({
  storagePath: z.string().min(1), sha256: z.string().regex(/^[a-fA-F0-9]{64}$/), mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative().max(10 * 1024 * 1024),
  transcript: z.string().max(50_000).optional(),
});
/** A BOT Chain wallet or contract address, exactly 20 bytes. */
const evmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
/** A BOT Chain transaction hash: 32 bytes, hex-encoded. */
const txHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
/** OpenLCEscrow ids are a 1-based uint256, serialized as a decimal string. */
const decimalEscrowId = z.string().regex(/^[0-9]{1,78}$/);
const onchainEscrowSchema = z.object({
  packageId: evmAddress,
  escrowObjectId: decimalEscrowId,
  fundingTransactionDigest: txHash,
  disputeTransactionDigest: txHash,
  buyerAddress: evmAddress,
  supplierAddress: evmAddress,
  arbitratorAddress: evmAddress,
});
const uuid = z.string().uuid();
const lineItemSchema = z.object({
  id: z.string().min(1).max(128), description: z.string().min(1).max(1000), sku: z.string().max(128).optional(),
  quantity: amount, unit: z.string().min(1).max(64), unitPriceUnits: amount,
});
const tradeOrderSchema = z.object({
  reference: z.string().min(1).max(128), initiatorRole: z.enum(["buyer", "supplier"]).optional(),
  // The counterparty may be named by email, by wallet address, or by neither (a pure bearer
  // link): sessions are wallet-first now and usually carry no email at all.
  supplierEmail: z.string().email().optional(), supplierName: z.string().max(256).optional(), supplierWalletAddress: evmAddress.optional(), arbitratorWalletAddress: evmAddress.optional(),
  buyerEmail: z.string().email().optional(), buyerName: z.string().max(256).optional(),
  arbitratorId: uuid, assetType: z.string().min(1).max(256), amountUnits: amount, description: z.string().min(1).max(20_000),
  deliveryDate: z.string().min(1).max(128), deliveryLocation: z.string().min(1).max(500), lineItems: z.array(lineItemSchema).min(1).max(100),
  releasePlan: z.object({ depositUnits: amount, dispatchUnits: amount, deliveryUnits: amount }).optional(),
  buyerOrganizationId: uuid.optional(), supplierOrganizationId: uuid.optional(),
});
const inspectionSchema = z.object({
  lines: z.array(z.object({ lineId: z.string().min(1).max(128), accepted: amount, missing: amount, damaged: amount })).min(1).max(100),
  note: z.string().max(20_000).optional(),
});
const shipmentSchema = z.object({
  carrier: z.string().min(1).max(128), trackingNumber: z.string().min(1).max(128),
  dispatchedAt: z.string().min(1).max(64), expectedAt: z.string().max(64).optional(),
  transactionDigest: txHash, evidenceSha256: z.string().regex(/^[0-9a-f]{64}$/),
});
const deliverySchema = z.object({ reference: z.string().max(128).optional() });
const acceptDeliverySchema = z.object({
  transactionDigest: txHash, receiptObjectId: z.string().min(1).max(256).optional(), inspection: inspectionSchema.optional(),
});
const fundingSchema = z.object({
  packageId: evmAddress, escrowObjectId: decimalEscrowId, transactionDigest: txHash,
  buyerAddress: evmAddress, supplierAddress: evmAddress, arbitratorAddress: evmAddress,
  verificationStatus: z.enum(["verified_on_chain", "external_reference"]).optional(),
  deliveryDeadlineMs: z.number().int().nonnegative().optional(), inspectionWindowMs: z.number().int().positive().optional(),
});
const deadlineSettlementSchema = z.object({
  kind: z.enum(["refund_unshipped", "claim_uninspected"]), transactionDigest: txHash, receiptObjectId: z.string().min(1).max(256).optional(),
});
const acceptInviteSchema = z.object({
  // Wallet sessions carry an empty email; treat "" as absent instead of rejecting the accept.
  email: z.preprocess((value) => (value === "" ? undefined : value), z.string().email().optional()),
  name: z.string().max(256).optional(),
});
const openTradeDisputeSchema = z.object({
  disputeTransactionDigest: txHash, disputedUnits: amount, requestedBuyerUnits: amount,
  claim: z.string().min(1).max(20_000), evidenceStatement: z.string().min(1).max(20_000), evidenceFiles: z.array(fileSchema).max(20).optional(),
  negotiationDeadline: z.string().datetime(), maxHumanRounds: z.number().int().min(1).max(5).optional(),
  inspection: inspectionSchema.optional(),
});
const openSchema = z.object({
  id: z.string().uuid().optional(), orderId: z.string().min(1).max(128), buyerId: z.string().uuid(), supplierId: z.string().uuid(), arbitratorId: z.string().uuid(),
  assetType: z.string().min(1).max(256), totalEscrowUnits: amount, disputedUnits: amount, requestedBuyerUnits: amount,
  claim: z.string().min(1).max(20_000),
  tradeTerms: z.object({ orderReference: z.string().min(1), description: z.string().min(1), inspectionTerms: z.string().optional(), acceptanceTerms: z.string().optional(), remedyTerms: z.string().optional(), governingLaw: z.string().min(1) }),
  negotiationDeadline: z.string().datetime(), maxHumanRounds: z.number().int().min(1).max(5).optional(),
  evidenceStatement: z.string().min(1).max(20_000), evidenceFiles: z.array(fileSchema).max(20).optional(),
  onchainEscrow: onchainEscrowSchema.optional(),
});

export function createApp(
  service: DisputeService,
  verifier: TokenVerifier,
  mediator?: MediationOrchestrator,
  demo?: DemoOrderService,
  settlementVerifier?: EscrowSettlementVerifier,
  trades?: TradeService,
  demoAuthEnabled = false,
  identity?: IdentityService,
  organizations?: OrganizationService,
) {
  const app = new Hono<{ Variables: { actor: Actor } }>();
  app.use("*", cors({
    origin: process.env.FRONTEND_ORIGIN ?? "*",
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
  }));
  app.onError((error, c) => {
    if (error instanceof DomainError) return c.json({ error: error.code, message: error.message }, error.status as any);
    if (error instanceof z.ZodError) return c.json({ error: "INVALID_REQUEST", issues: error.issues }, 400);
    console.error("Unhandled OpenLC backend error", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
      stack: process.env.NODE_ENV === "development" && error instanceof Error ? error.stack : undefined,
    });
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  });
  app.get("/health", (c) => c.json({ ok: true, service: "openlc-api" }));
  app.post("/auth/demo/google", async (c) => {
    if (!demoAuthEnabled) throw new DomainError("DEMO_AUTH_DISABLED", "Demo Google authentication is disabled", 404);
    const body = z.object({ email: z.string().email(), name: z.string().min(1).max(256) }).parse(await c.req.json());
    return c.json(issueDemoGoogleSession(body.email, body.name));
  });
  if (identity) {
    app.post("/auth/wallet/challenge", async (c) => {
      const body = z.object({ address: evmAddress }).parse(await c.req.json());
      // The origin is named in the message the user signs, so it comes from this
      // deployment's own configuration: a caller-supplied header could claim any
      // site and would make that line of the message meaningless.
      const origin = process.env.FRONTEND_ORIGIN ?? "";
      if (!/^https?:\/\//.test(origin))
        throw new DomainError("INVALID_ORIGIN", "This deployment has no valid FRONTEND_ORIGIN configured", 500);
      return c.json(await identity.createWalletChallenge(body.address, origin));
    });
    app.post("/auth/wallet/verify", async (c) => {
      const body = z.object({
        challengeId: uuid,
        address: evmAddress,
        signature: z.string().min(20).max(4096),
      }).parse(await c.req.json());
      return c.json(await identity.verifyWalletChallenge(body));
    });
  }
  if (organizations) {
    app.get("/public/organizations/:slug/trust", async (c) => c.json(await organizations.publicTrustProfile(c.req.param("slug"))));
  }
  app.use("/v1/*", async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    if (!header.startsWith("Bearer ")) throw new DomainError("UNAUTHORIZED", "Bearer token required", 401);
    c.set("actor", await verifier.verify(header.slice(7)));
    await next();
  });
  app.get("/v1/me", (c) => c.json(c.get("actor")));
  if (organizations) {
    app.get("/v1/workspace", async (c) => c.json(await organizations.workspace(c.get("actor"))));
    app.patch("/v1/workspace", async (c) => {
      const body = z.object({ name: z.string().min(2).max(160) }).parse(await c.req.json());
      return c.json(await organizations.renamePrimary(c.get("actor"), body.name));
    });
    app.post("/v1/organizations", async (c) => {
      const body = z.object({ name: z.string().min(2).max(160) }).parse(await c.req.json());
      return c.json(await organizations.create(c.get("actor"), body.name), 201);
    });
    app.get("/v1/organizations/:id/trust-profile", async (c) => c.json(await organizations.trustPreview(c.get("actor"), c.req.param("id"))));
    app.patch("/v1/organizations/:id/trust-profile", async (c) => {
      const body = z.object({ published: z.boolean() }).parse(await c.req.json());
      return c.json(await organizations.setTrustPublished(c.get("actor"), c.req.param("id"), body.published));
    });
  }
  if (trades) {
    app.get("/v1/orders", async (c) => c.json(await trades.listOrders(c.get("actor"))));
    app.post("/v1/orders", async (c) => c.json(await trades.createOrder(tradeOrderSchema.parse(await c.req.json()), c.get("actor")), 201));
    app.get("/v1/orders/:id", async (c) => c.json(await trades.getOrder(c.req.param("id"), c.get("actor"))));
    app.post("/v1/orders/:id/invite", async (c) => c.json(await trades.createInvite(c.req.param("id"), c.get("actor"))));
    app.post("/v1/orders/:id/invite/cancel", async (c) => c.json(await trades.cancelInvite(c.req.param("id"), c.get("actor"))));
    app.get("/v1/invitations", async (c) => c.json(await trades.listInvitations(c.get("actor"))));
    app.post("/v1/orders/:id/accept", async (c) => {
      const body = acceptInviteSchema.parse(await c.req.json().catch(() => ({})));
      return c.json(await trades.acceptInvitation(c.req.param("id"), c.get("actor"), body));
    });
    app.get("/v1/invites/:token", async (c) => c.json(await trades.previewInvite(c.req.param("token"), c.get("actor"))));
    app.post("/v1/invites/:token/accept", async (c) => {
      const body = acceptInviteSchema.parse(await c.req.json().catch(() => ({})));
      return c.json(await trades.acceptInvite(c.req.param("token"), c.get("actor"), body));
    });
    app.post("/v1/orders/:id/funding", async (c) => c.json(await trades.recordFunding(c.req.param("id"), c.get("actor"), fundingSchema.parse(await c.req.json()))));
    app.post("/v1/orders/:id/deadline-settlement", async (c) => c.json(await trades.settleByDeadline(c.req.param("id"), c.get("actor"), deadlineSettlementSchema.parse(await c.req.json()))));
    app.post("/v1/orders/:id/shipment", async (c) => {
      const body = shipmentSchema.parse(await c.req.json().catch(() => ({})));
      return c.json(await trades.markShipment(c.req.param("id"), c.get("actor"), body));
    });
    app.post("/v1/orders/:id/delivery", async (c) => {
      const body = deliverySchema.parse(await c.req.json().catch(() => ({})));
      return c.json(await trades.markDelivered(c.req.param("id"), c.get("actor"), body));
    });
    app.post("/v1/orders/:id/documents", async (c) => {
      const body = await c.req.parseBody();
      const file = body.file;
      if (!(file instanceof File)) throw new DomainError("INVALID_DOCUMENT", "Attach a file under the 'file' field", 400);
      const kind = String(body.kind ?? "");
      const transcript = typeof body.transcript === "string" ? body.transcript : undefined;
      let extracted: Record<string, unknown> | undefined;
      if (typeof body.extracted === "string" && body.extracted.trim()) {
        try { extracted = JSON.parse(body.extracted) as Record<string, unknown>; } catch { throw new DomainError("INVALID_DOCUMENT", "extracted must be JSON", 400); }
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const anchorTransactionDigest = typeof body.anchorTransactionDigest === "string" && body.anchorTransactionDigest.trim() ? body.anchorTransactionDigest.trim() : undefined;
      const order = await trades.attachDocument(c.req.param("id"), c.get("actor"), { kind: kind as never, name: file.name, mimeType: file.type, bytes, transcript, extracted, anchorTransactionDigest });
      return c.json(order, 201);
    });
    app.get("/v1/orders/:id/documents/:documentId", async (c) => {
      const { document, bytes, mimeType } = await trades.readDocument(c.req.param("id"), c.get("actor"), c.req.param("documentId"));
      const safeName = document.name.replace(/[^\w.\- ]+/g, "_");
      return c.body(new Uint8Array(bytes).buffer as ArrayBuffer, 200, {
        "content-type": mimeType,
        "content-length": String(bytes.byteLength),
        "content-disposition": `inline; filename="${safeName}"`,
        "cache-control": "private, no-store",
      });
    });
    app.patch("/v1/orders/:id/documents/:documentId/anchor", async (c) => {
      const body = z.object({ transactionDigest: txHash }).parse(await c.req.json().catch(() => ({})));
      return c.json(await trades.anchorDocument(c.req.param("id"), c.get("actor"), c.req.param("documentId"), body.transactionDigest));
    });
    app.post("/v1/orders/:id/acceptance", async (c) => c.json(await trades.acceptDelivery(c.req.param("id"), c.get("actor"), acceptDeliverySchema.parse(await c.req.json()))));
    app.post("/v1/orders/:id/dispute", async (c) => c.json(await trades.openDispute(c.req.param("id"), c.get("actor"), openTradeDisputeSchema.parse(await c.req.json()))));
  }
  app.post("/v1/disputes", async (c) => c.json(await service.open(openSchema.parse(await c.req.json()), c.get("actor")), 201));
  app.get("/v1/disputes/:id", async (c) => {
    const dispute = await service.get(c.req.param("id"));
    const actor = c.get("actor");
    if (![dispute.buyerId, dispute.supplierId, dispute.arbitratorId].includes(actor.id)) throw new DomainError("FORBIDDEN", "Actor cannot access dispute", 403);
    return c.json(dispute);
  });
  app.post("/v1/disputes/:id/supplier-response", async (c) => {
    const body = z.object({ agrees: z.boolean(), statement: z.string().max(20_000).optional(), files: z.array(fileSchema).max(20).optional() }).parse(await c.req.json());
    const result = await service.respond(c.req.param("id"), c.get("actor"), body);
    if (trades) await trades.syncDispute(result.id);
    return c.json(result);
  });
  app.post("/v1/disputes/:id/proposals", async (c) => {
    const result = await service.propose(c.req.param("id"), c.get("actor"), proposalSchema.parse(await c.req.json()));
    if (trades) await trades.syncDispute(result.id);
    return c.json(result);
  });
  app.post("/v1/disputes/:id/proposals/:proposalId/accept", async (c) => {
    const result = await service.accept(c.req.param("id"), c.get("actor"), c.req.param("proposalId"));
    if (trades) await trades.syncDispute(result.id);
    return c.json(result);
  });
  app.post("/v1/disputes/:id/proposals/:proposalId/reject", async (c) => {
    const result = await service.reject(c.req.param("id"), c.get("actor"), c.req.param("proposalId"));
    if (trades) await trades.syncDispute(result.id);
    return c.json(result);
  });
  app.post("/v1/disputes/:id/proposals/:proposalId/counter", async (c) => {
    const result = await service.counter(c.req.param("id"), c.get("actor"), c.req.param("proposalId"), proposalSchema.parse(await c.req.json()));
    if (trades) await trades.syncDispute(result.id);
    return c.json(result);
  });
  app.post("/v1/disputes/:id/mediate", async (c) => {
    if (!mediator) throw new DomainError("AI_UNAVAILABLE", "AI mediation is not configured", 503);
    const dispute = await service.get(c.req.param("id"));
    const actor = c.get("actor");
    if (![dispute.buyerId, dispute.supplierId].includes(actor.id)) throw new DomainError("FORBIDDEN", "Only a party may request mediation", 403);
    if (dispute.proposals.some((proposal) => proposal.status === "open")) {
      throw new DomainError("OPEN_PROPOSAL_EXISTS", "Resolve the open proposal before starting AI mediation");
    }
    const result = await mediator.mediate(dispute);
    if (result.outcome === "abstain") {
      const saved = await service.recordAiAbstention(dispute.id, result.run);
      if (trades) await trades.syncDispute(saved.id);
      return c.json({ ...result, dispute: saved });
    }
    const saved = await service.recordAi(dispute.id, result.proposal, result.run);
    if (trades) await trades.syncDispute(saved.id);
    return c.json({ ...result, dispute: saved });
  });
  app.post("/v1/disputes/:id/enforce-deadline", async (c) => {
    const dispute = await service.get(c.req.param("id"));
    const actor = c.get("actor");
    if (![dispute.buyerId, dispute.supplierId, dispute.arbitratorId].includes(actor.id)) throw new DomainError("FORBIDDEN", "Actor cannot access dispute", 403);
    const result = await service.enforceDeadline(dispute.id);
    if (trades) await trades.syncDispute(result.id);
    return c.json(result);
  });
  app.post("/v1/disputes/:id/early-position", async (c) => {
    const result = await service.earlyPosition(c.req.param("id"), c.get("actor"), proposalSchema.parse(await c.req.json()));
    if (trades) await trades.syncDispute(result.id);
    return c.json(result);
  });
  app.post("/v1/disputes/:id/arbitrator-decision", async (c) => {
    const result = await service.decide(c.req.param("id"), c.get("actor"), proposalSchema.parse(await c.req.json()));
    if (trades) await trades.syncDispute(result.id);
    return c.json(result);
  });
  app.get("/v1/disputes/:id/arbitration-package", async (c) => c.json(await service.arbitrationPackage(c.req.param("id"), c.get("actor"))));
  app.post("/v1/disputes/:id/settlement-execution", async (c) => {
    if (!settlementVerifier) throw new DomainError("ESCROW_VERIFIER_UNAVAILABLE", "The escrow settlement verifier is not configured", 503);
    const dispute = await service.get(c.req.param("id"));
    const actor = c.get("actor");
    if (![dispute.buyerId, dispute.supplierId, dispute.arbitratorId].includes(actor.id)) {
      throw new DomainError("FORBIDDEN", "Actor cannot submit settlement execution proof", 403);
    }
    const proof = z.object({
      transactionDigest: txHash, packageId: evmAddress,
      escrowObjectId: decimalEscrowId, receiptObjectId: z.string().min(1).max(256).optional(),
    }).parse(await c.req.json());
    const verified = await settlementVerifier.verify(dispute, proof);
    const result = await service.confirmSettlement(dispute.id, verified);
    if (trades) await trades.syncDispute(result.id);
    return c.json(result);
  });
  app.get("/v1/demo/orders", (c) => {
    if (!demo) throw new DomainError("DEMO_DISABLED", "Demo controls are disabled", 404);
    return c.json({ disclosure: "Demo controls explicitly label simulated, seeded, live-AI, and external-BOT-Chain steps.", orders: demo.list() });
  });
  app.post("/v1/demo/orders/reset", (c) => {
    if (!demo) throw new DomainError("DEMO_DISABLED", "Demo controls are disabled", 404);
    return c.json({ orders: demo.reset() });
  });
  app.post("/v1/demo/orders/:id/advance", async (c) => {
    if (!demo) throw new DomainError("DEMO_DISABLED", "Demo controls are disabled", 404);
    const body = z.object({
      command: z.enum([
        "confirm_order", "record_escrow_funding", "skip_fulfilment_wait", "seed_buyer_claim",
        "seed_supplier_counter", "attach_live_mediation", "buyer_accepts", "supplier_accepts", "record_sui_settlement",
      ]),
      reference: z.object({
        transactionDigest: z.string().min(1).max(256).optional(), objectId: z.string().min(1).max(256).optional(),
        receiptObjectId: z.string().min(1).max(256).optional(), mediationRunId: z.string().min(1).max(256).optional(), proposalId: z.string().min(1).max(256).optional(),
      }).optional(),
    }).parse(await c.req.json());
    return c.json(demo.advance(c.req.param("id"), { command: body.command as DemoCommand, reference: body.reference }));
  });
  return app;
}
