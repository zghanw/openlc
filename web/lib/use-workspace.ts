"use client";

import { useCallback, useEffect, useState } from "react";
import type { DemoOrder } from "@/lib/demo-orders";
import { loadInvitations, loadLiveOrders, type LiveInvitation } from "@/lib/live-orders";
import { loadSession, type DemoSession, type WorkspaceProfile } from "@/lib/openlc-api";

export const GUEST_COMPANY = "Your company";

export type Workspace = {
  ready: boolean;
  session: DemoSession | null;
  live: boolean;
  profile?: WorkspaceProfile;
  company: string;
  accountKey: string;
  orders: DemoOrder[];
  invitations: LiveInvitation[];
  error: string;
  replaceLiveOrder: (order: DemoOrder) => void;
  reload: () => Promise<void>;
};

/** Loads the signed-in account's orders and invitations. */
export function useWorkspace(): Workspace {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<DemoSession | null>(null);
  const [profile, setProfile] = useState<WorkspaceProfile>();
  const [orders, setOrders] = useState<DemoOrder[]>([]);
  const [invitations, setInvitations] = useState<LiveInvitation[]>([]);
  const [error, setError] = useState("");

  const current = session ?? loadSession();
  const accountKey = current?.user.id ?? "guest";
  const company = profile?.primary.organizationName ?? current?.user.name ?? GUEST_COMPANY;

  const reload = useCallback(async () => {
    const active = loadSession();
    setSession(active);
    if (active) {
      try {
        const [live, invited] = await Promise.all([loadLiveOrders(), loadInvitations().catch(() => [])]);
        setOrders(live.orders);
        setProfile(live.profile);
        setInvitations(invited);
        setError("");
      } catch (cause) {
        setOrders([]);
        setError(cause instanceof Error ? cause.message : "Orders could not be loaded.");
      }
    }
    setReady(true);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return {
    ready, session: current, live: Boolean(current), profile, company, accountKey, orders, invitations, error,
    replaceLiveOrder: (order) => setOrders((currentOrders) => currentOrders.some((item) => item.id === order.id)
      ? currentOrders.map((item) => (item.id === order.id ? order : item))
      : [order, ...currentOrders]),
    reload,
  };
}
