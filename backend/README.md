# OpenLC API

The off-chain half of OpenLC: order records, invitations, evidence storage, dispute negotiation,
and AI mediation. It never signs a transaction and never holds funds — the money lives entirely in
`OpenLCEscrow.sol` on BOT Chain. See the [root README](../README.md) for the product, the deployed
contract, and the judge-facing walkthrough.

## Verification model

Every step that moves or should move BOT is re-read from the chain, not trusted from the client:

1. The browser signs and submits a transaction against the escrow contract.
2. The browser posts the transaction hash to this API.
3. The API re-reads that transaction and the contract's `getEscrow()` state from BOT Chain RPC
   (`integrations/evm-escrow.ts`) before marking the step `verified_on_chain` — checking the
   receipt succeeded, the event came from the configured escrow address, the decoded event fields
   match the order, and `tx.from` is the wallet that was supposed to sign it.

A client-supplied hash alone is never accepted as proof that something happened on chain.

## Routes (`src/api/app.ts`)

- **Health:** `GET /health`
- **Wallet sign-in:** `POST /auth/wallet/challenge`, `POST /auth/wallet/verify`, `GET /v1/me`
- **Workspace & organizations:** `GET/PATCH /v1/workspace`, `POST /v1/organizations`,
  `GET/PATCH /v1/organizations/:id/trust-profile`, `GET /public/organizations/:slug/trust`
- **Orders & invites:** `GET/POST /v1/orders`, `GET /v1/orders/:id`,
  `POST /v1/orders/:id/invite(/cancel)`, `GET /v1/invitations`, `POST /v1/orders/:id/accept`,
  `GET /v1/invites/:token`, `POST /v1/invites/:token/accept`
- **Escrow lifecycle (chain-verified):** `POST /v1/orders/:id/funding`,
  `POST /v1/orders/:id/shipment`, `POST /v1/orders/:id/delivery`,
  `POST/GET /v1/orders/:id/documents`, `PATCH /v1/orders/:id/documents/:documentId/anchor`,
  `POST /v1/orders/:id/acceptance`, `POST /v1/orders/:id/dispute`,
  `POST /v1/orders/:id/deadline-settlement`
- **Disputes & mediation:** `POST /v1/disputes`, `GET /v1/disputes/:id`,
  `POST /v1/disputes/:id/supplier-response`, `POST /v1/disputes/:id/proposals(/accept|reject|counter)`,
  `POST /v1/disputes/:id/mediate`, `POST /v1/disputes/:id/early-position`,
  `POST /v1/disputes/:id/arbitrator-decision`, `GET /v1/disputes/:id/arbitration-package`,
  `POST /v1/disputes/:id/settlement-execution`, `POST /v1/disputes/:id/enforce-deadline`
- **Demo controls** (only when `OPENLC_DEMO_MODE=true`): `GET /v1/demo/orders`,
  `POST /v1/demo/orders/reset`, `POST /v1/demo/orders/:id/advance`

## Configuration

This service reads the repository-root `.env` (see [`/.env.example`](../.env.example) for every
variable name — never commit real values). The names that matter here:

**Required for a working deployment:** `OPENLC_SESSION_SECRET`, `BOTCHAIN_CHAIN_ID`,
`BOTCHAIN_RPC_URL`, `OPENLC_ESCROW_ADDRESS`, `OPENLC_ESCROW_DEPLOY_BLOCK`,
`ESCROW_VERIFIER_ENABLED`, `FRONTEND_ORIGIN`, `INVITE_BASE_URL`, `PORT`, `BACKEND_STORE`
(`memory` or `supabase`).

**Required only when `BACKEND_STORE=supabase`:** `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SECRET_KEY`, `OPENLC_DOCUMENTS_BUCKET`.

**Optional — AI mediation:** `GEMINI_API_KEY`, `GEMINI_MODEL` (an ordered fallback list),
`GEMINI_EMBEDDING_MODEL`. Without `GEMINI_API_KEY`, mediation is simply unavailable
(`503 AI_UNAVAILABLE`).

**Optional — legal-authority retrieval:** `QDRANT_URL`, `QDRANT_API_KEY`, `LEGAL_COLLECTION`.
Without both Qdrant variables, mediation still runs; it just has no statute/case-law citations for
the human arbitration package.

**Optional — the one-wallet demo supplier:** `OPENLC_DEMO_SUPPLIER_ADDRESS`. Without it, the
"Use the OpenLC demo supplier" option fails closed with `503 DEMO_SUPPLIER_NOT_CONFIGURED`. The
server holds no private key for this wallet, only its public address.

**Optional — invitation email:** `BREVO_API_KEY`, `RESEND_API_KEY`, `SMTP_HOST`/`SMTP_PORT`/
`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASS`, `INVITATION_EMAIL_FROM`. Brevo is tried first, then SMTP,
then Resend. Without any of them, invitations still work as copy-paste links; the API just
reports that no email was sent.

**Optional — demo/debug:** `OPENLC_DEMO_MODE` (exposes the `/v1/demo/*` routes).

## Run and test

```bash
cd backend
npm ci
npm run dev      # or: npm start
npm test         # vitest — 144 passing
npm run build    # tsc
```

`npm run check:services` probes the configured Supabase/Gemini/Qdrant credentials without
mutating anything. `npm run test:supabase` / `test:gemini` / `test:qdrant` / `test:mediation` and
`npm run ingest:legal` talk to the live services directly; run them only with real credentials
configured.
