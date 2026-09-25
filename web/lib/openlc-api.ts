"use client";

import { useEffect, useState } from "react";

export type DemoSession = {
  accessToken: string;
  user: { id: string; email: string; name: string };
  mode: "wallet";
  walletAddress?: string;
};

export type TradeLineItem = {
  id: string;
  description: string;
  sku?: string;
  quantity: string;
  unit: string;
  unitPriceUnits: string;
};

export type TradeInspectionRecord = {
  lines: Array<{ lineId: string; accepted: string; missing: string; damaged: string }>;
  note?: string;
  recordedBy: string;
  recordedAt: string;
};

export type TradeConfirmation = {
  confirmedBy: string;
  confirmedRole: "buyer" | "supplier";
  email?: string;
  organizationName?: string;
  orderVersion: number;
  termsVersion: string;
  confirmedAt: string;
};

export type TradeOrder = {
  id: string;
  reference: string;
  initiatorRole?: "buyer" | "supplier";
  buyerId?: string;
  buyerOrganizationId?: string;
  buyerEmail?: string;
  buyerName?: string;
  supplierId?: string;
  supplierOrganizationId?: string;
  supplierEmail?: string;
  supplierName: string;
  supplierWalletAddress?: string;
  arbitratorWalletAddress?: string;
  arbitratorId: string;
  assetType: string;
  amountUnits: string;
  orderHash: string;
  description: string;
  deliveryDate: string;
  deliveryLocation: string;
  lineItems: TradeLineItem[];
  releasePlan?: { depositUnits: string; dispatchUnits: string; deliveryUnits: string };
  releaseRecords?: Array<{
    stage: "deposit" | "dispatch" | "undisputed" | "delivery"; amountUnits: string;
    transactionDigest: string; verificationStatus: "verified_on_chain" | "external_reference"; releasedAt: string; evidenceSha256?: string;
  }>;
  status: string;
  inviteId?: string;
  inviteExpiresAt?: string;
  funding?: {
    packageId: string;
    escrowObjectId: string;
    transactionDigest: string;
    buyerAddress: string;
    supplierAddress: string;
    arbitratorAddress: string;
    verificationStatus: "verified_on_chain" | "external_reference";
    fundedAt: string;
    deliveryDeadlineMs?: number;
    inspectionWindowMs?: number;
  };
  undisputedRelease?: {
    transactionDigest: string;
    verificationStatus: "verified_on_chain" | "external_reference";
    releasedAt: string;
  };
  disputeId?: string;
  confirmation?: TradeConfirmation;
  documents?: Array<{
    id: string; kind: string; name: string; mimeType: string; sizeBytes: number; sha256: string; storagePath: string;
    uploadedBy: string; uploadedRole: "buyer" | "supplier"; uploadedAt: string; transcript?: string; extracted?: Record<string, unknown>;
    anchor?: { transactionDigest: string; verificationStatus: "verified_on_chain" | "external_reference" };
  }>;
  shipment?: { carrier: string; trackingNumber: string; dispatchedAt: string; expectedAt?: string; recordedBy: string; transactionDigest?: string; verificationStatus?: "verified_on_chain" | "external_reference" };
  deliveryRecord?: { reference?: string; recordedBy: string; recordedAt: string };
  inspection?: TradeInspectionRecord;
  settlement?: {
    buyerUnits: string;
    supplierUnits: string;
    transactionDigest?: string;
    receiptObjectId?: string;
    verifiedOnChain: boolean;
    source?: "full_acceptance" | "dispute" | "refund_unshipped" | "claim_uninspected";
  };
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type TradeInvitation = {
  orderId: string;
  reference: string;
  buyerName: string;
  counterpartyName?: string;
  invitedRole?: "buyer" | "supplier";
  invitedEmail: string;
  assetType: string;
  amountUnits: string;
  deliveryDate: string;
  invitedAt: string;
  expiresAt: string;
};

export type InvitationDelivery = {
  status: "sent" | "failed" | "not_configured";
  messageId?: string;
  attemptedAt: string;
};

export type OrganizationMembership = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  accountId: string;
  authority: "owner" | "admin" | "member";
  canBuy: boolean;
  canSupply: boolean;
  organizationCreatedAt?: string;
  trustProfilePublishedAt?: string;
};

export type TrustRoleSummary = {
  fundedOrders: number; settledOrders: number; disputes: number; deadlineClosures: number;
  disputeFreeRate?: number; disputeResolutionRate?: number;
};

export type OrganizationTrustProfile = {
  organizationId: string; name: string; slug: string; organizationCreatedAt?: string; publishedAt?: string;
  published: boolean; newOnOpenLC: boolean; supplier: TrustRoleSummary; buyer: TrustRoleSummary;
};

export type WorkspaceProfile = {
  primary: OrganizationMembership;
  organizations: OrganizationMembership[];
};

export async function updateWorkspaceName(name: string): Promise<WorkspaceProfile> {
  return apiRequest<WorkspaceProfile>("/v1/workspace", {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export async function loadTrustProfile(organizationId: string): Promise<OrganizationTrustProfile> {
  return apiRequest<OrganizationTrustProfile>(`/v1/organizations/${encodeURIComponent(organizationId)}/trust-profile`);
}

export async function setTrustProfilePublished(organizationId: string, published: boolean): Promise<OrganizationTrustProfile> {
  return apiRequest<OrganizationTrustProfile>(`/v1/organizations/${encodeURIComponent(organizationId)}/trust-profile`, {
    method: "PATCH", body: JSON.stringify({ published }),
  });
}

export async function loadPublicTrustProfile(slug: string): Promise<OrganizationTrustProfile> {
  const response = await fetch(`${BACKEND_URL}/public/organizations/${encodeURIComponent(slug)}/trust`);
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<OrganizationTrustProfile>;
}

export type Dispute = {
  id: string;
  orderId: string;
  status: string;
  totalEscrowUnits: string;
  disputedUnits: string;
  undisputedReleasedUnits: string;
  requestedBuyerUnits: string;
  evidence: Array<{
    id: string;
    side: "buyer" | "supplier";
    statement: string;
    files: unknown[];
  }>;
  proposals: Array<{
    id: string;
    source: string;
    proposedBy: string;
    proposerSide?: "buyer" | "supplier";
    buyerUnits: string;
    supplierUnits: string;
    summary: string;
    reasoning: string;
    citations: Array<{
      title: string;
      locator: string;
      excerpt: string;
      sourceUrl: string;
    }>;
    evidenceSufficiency?: string;
    legalRelevance?: string;
    acceptances: string[];
    status: string;
  }>;
  mediationRuns: Array<{
    id: string;
    debateRounds: number;
    modelCalls: number;
    buyerFinal?: unknown;
    supplierFinal?: unknown;
    mediatorFinal?: unknown;
    legalContext: Array<{
      title: string;
      locator: string;
      excerpt: string;
      sourceUrl: string;
    }>;
  }>;
  settlement?: {
    buyerUnits: string;
    supplierUnits: string;
    agreementId: string;
    executionStatus: "pending_on_chain" | "verified_on_chain";
    execution?: {
      transactionDigest: string;
      receiptObjectId: string;
      escrowObjectId: string;
      packageId: string;
    };
  };
};

const STORAGE_KEY = "openlc_demo_session";
const BACKEND_URL = (
  process.env.NEXT_PUBLIC_OPENLC_BACKEND_URL || "http://localhost:8787"
).replace(/\/$/, "");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export function hasSupabaseConfig(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

export async function restoreSupabaseSession(): Promise<DemoSession | null> {
  if (!hasSupabaseConfig()) return null;
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token || !data.session.user) return null;
  const session: DemoSession = {
    accessToken: data.session.access_token,
    mode: "wallet",
    user: {
      id: data.session.user.id,
      email: data.session.user.email ?? "",
      name: String(
        data.session.user.user_metadata?.full_name ??
          data.session.user.email ??
          "Business user",
      ),
    },
  };
  saveSession(session);
  return session;
}

const SESSION_EVENT = "openlc:session-changed";
/** A session is dropped this long before its token expires, so no request goes out on a dying token. */
const EXPIRY_MARGIN_MS = 60_000;
export const SESSION_EXPIRED_MESSAGE = "Your sign-in expired. Sign in again with your wallet.";

/** The token's `exp` in milliseconds, read with a plain base64url decode; null when it has none. */
function tokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

// Deferred so a clear that happens while a component renders never updates another one mid-render.
function announceSessionChange(): void {
  queueMicrotask(() => window.dispatchEvent(new Event(SESSION_EVENT)));
}

/** The stored session, or null when there is none, its token's expiry can't be read, or it expires
 *  within a minute (it is then cleared). The API always sets `exp`, so a token without one is not ours. */
export function loadSession(): DemoSession | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return null;
    const session = JSON.parse(value) as DemoSession;
    const expiresAt = tokenExpiryMs(session.accessToken);
    if (expiresAt === null || expiresAt - Date.now() <= EXPIRY_MARGIN_MS) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function saveSession(session: DemoSession): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  announceSessionChange();
}

export function clearSession(): void {
  window.localStorage.removeItem(STORAGE_KEY);
  announceSessionChange();
}

/**
 * The current valid session. It updates when this tab signs in or out, when another tab does
 * (the storage event), when the tab comes back into view, and the moment the token expires.
 */
export function useSession(): DemoSession | null {
  const [session, setSession] = useState(loadSession);
  useEffect(() => {
    // Same token, same object: listeners firing for nothing never re-render the page.
    const sync = () => setSession((current) => {
      const next = loadSession();
      return next?.accessToken === current?.accessToken ? current : next;
    });
    const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY || event.key === null) sync(); };
    const onVisible = () => { if (document.visibilityState === "visible") sync(); };
    window.addEventListener(SESSION_EVENT, sync);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(SESSION_EVENT, sync);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  useEffect(() => {
    const expiresAt = session ? tokenExpiryMs(session.accessToken) : null;
    if (expiresAt === null) return;
    const timer = window.setTimeout(() => setSession(loadSession()), Math.max(0, expiresAt - EXPIRY_MARGIN_MS - Date.now()) + 500);
    return () => window.clearTimeout(timer);
  }, [session]);
  return session;
}

/**
 * Signing out ends on the landing. Storage is cleared without the in-page session event, so the page
 * being left never flashes the sign-in gate on its way out (other tabs still get the storage event).
 */
export async function signOutToLanding(): Promise<void> {
  window.localStorage.removeItem(STORAGE_KEY);
  if (hasSupabaseConfig()) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
      await client.auth.signOut();
    } catch {
      // The OpenLC session is already gone; a failed Supabase sign-out must not keep anyone here.
    }
  }
  window.location.assign("/");
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  session = loadSession(),
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (session?.accessToken)
    headers.set("authorization", `Bearer ${session.accessToken}`);
  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}${path}`, { ...init, headers });
  } catch {
    // fetch rejects only when no answer arrived at all (offline, DNS, the API asleep or restarting).
    throw new Error("OpenLC could not be reached. Check your connection and try again in a minute.");
  }
  // Every /v1 route answers 401 only for a missing, invalid or expired session: drop it so the sign-in gate shows.
  if (response.status === 401) {
    clearSession();
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as T;
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      message?: string;
      error?: string;
    };
    return payload.message || fallbackError(response.status);
  } catch {
    return fallbackError(response.status);
  }
}

/** Words for an answer that carried no message of its own (a proxy page, a restart, an old API). */
function fallbackError(status: number): string {
  if (status >= 500) return "OpenLC is having trouble right now. Nothing changed on BOT Chain. Try again in a minute.";
  if (status === 404) return "That was not found. Refresh the page and try again.";
  if (status === 409) return "This changed while you were working on it. Refresh the page and try again.";
  return "That request could not be completed. Refresh the page and try again.";
}

export function backendUrl(): string {
  return BACKEND_URL;
}
