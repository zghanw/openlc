import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NotificationStore, OrderNotification } from "./notification-store.js";

type NotificationRow = {
  id: string;
  account_id: string;
  order_id: string;
  kind: OrderNotification["kind"];
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export class SupabaseNotificationStore implements NotificationStore {
  private readonly client: SupabaseClient;

  constructor(url: string, secretKey: string) {
    this.client = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async create(notification: OrderNotification): Promise<boolean> {
    const { data, error } = await this.client
      .from("openlc_notifications")
      .upsert({
        id: notification.id, account_id: notification.accountId, order_id: notification.orderId, kind: notification.kind,
        title: notification.title, body: notification.body, created_at: notification.createdAt,
      }, { onConflict: "account_id,order_id,kind", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`Supabase notification create failed: ${error.message}`);
    // With ignoreDuplicates PostgREST returns only the rows it inserted: none means it already existed.
    return (data?.length ?? 0) > 0;
  }

  async listForAccount(accountId: string, limit: number): Promise<OrderNotification[]> {
    const { data, error } = await this.client
      .from("openlc_notifications")
      .select("id,account_id,order_id,kind,title,body,read_at,created_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Supabase notification list failed: ${error.message}`);
    return (data as NotificationRow[]).map(notificationFromRow);
  }

  async countUnread(accountId: string): Promise<number> {
    const { count, error } = await this.client
      .from("openlc_notifications")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .is("read_at", null);
    if (error) throw new Error(`Supabase notification count failed: ${error.message}`);
    return count ?? 0;
  }

  async markAllRead(accountId: string, at: string): Promise<void> {
    const { error } = await this.client
      .from("openlc_notifications")
      .update({ read_at: at })
      .eq("account_id", accountId)
      .is("read_at", null);
    if (error) throw new Error(`Supabase notification mark-read failed: ${error.message}`);
  }
}

export function notificationFromRow(row: NotificationRow): OrderNotification {
  return {
    id: row.id, accountId: row.account_id, orderId: row.order_id, kind: row.kind,
    title: row.title, body: row.body, readAt: row.read_at ?? undefined, createdAt: row.created_at,
  };
}
