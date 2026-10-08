export type NotificationKind = "order_accepted";

export interface OrderNotification {
  id: string;
  accountId: string;
  orderId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  readAt?: string;
  createdAt: string;
}

export interface NotificationStore {
  /** False when the account already has this kind of notification for this order. */
  create(notification: OrderNotification): Promise<boolean>;
  /** Newest first. */
  listForAccount(accountId: string, limit: number): Promise<OrderNotification[]>;
  countUnread(accountId: string): Promise<number>;
  markAllRead(accountId: string, at: string): Promise<void>;
}

export class MemoryNotificationStore implements NotificationStore {
  private readonly notifications: OrderNotification[] = [];

  async create(notification: OrderNotification): Promise<boolean> {
    const exists = this.notifications.some((item) =>
      item.accountId === notification.accountId && item.orderId === notification.orderId && item.kind === notification.kind);
    if (exists) return false;
    this.notifications.push(structuredClone(notification));
    return true;
  }

  async listForAccount(accountId: string, limit: number): Promise<OrderNotification[]> {
    return this.notifications
      .filter((item) => item.accountId === accountId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((item) => structuredClone(item));
  }

  async countUnread(accountId: string): Promise<number> {
    return this.notifications.filter((item) => item.accountId === accountId && !item.readAt).length;
  }

  async markAllRead(accountId: string, at: string): Promise<void> {
    for (const item of this.notifications) if (item.accountId === accountId && !item.readAt) item.readAt = at;
  }
}
