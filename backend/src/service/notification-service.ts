import type { DomainContext } from "../domain/types.js";
import type { TradeOrder } from "../domain/trade-types.js";
import { escapeHtml, type InvitationEmailSender } from "../integrations/invitation-email.js";
import type { IdentityStore } from "../store/identity-store.js";
import type { NotificationStore, OrderNotification } from "../store/notification-store.js";

export class NotificationService {
  constructor(
    private readonly store: NotificationStore,
    private readonly accounts: Pick<IdentityStore, "getNotificationEmail">,
    private readonly email: Pick<InvitationEmailSender, "deliver">,
    private readonly ctx: DomainContext,
    private readonly orderBaseUrl: string,
  ) {}

  /** Tell the company that issued the order that the invited party accepted it. Safe to repeat:
   *  the store keeps one notification per order, and only a new one sends an email. */
  async orderAccepted(order: TradeOrder): Promise<void> {
    const supplierIssued = order.initiatorRole === "supplier";
    const accountId = supplierIssued ? order.supplierId : order.buyerId;
    if (!accountId) return;
    const acceptedBy = (supplierIssued ? order.buyerName : order.supplierName) || "The invited company";
    const notification: OrderNotification = {
      id: this.ctx.id(), accountId, orderId: order.id, kind: "order_accepted",
      title: `${acceptedBy} accepted ${order.reference}`,
      body: supplierIssued ? "They can now fund the escrow." : "Fund the escrow to start the order.",
      createdAt: this.ctx.now().toISOString(),
    };
    if (!(await this.store.create(notification))) return;
    // The in-app notification is saved; the email is a courtesy on top and never fails the call.
    try {
      const to = await this.accounts.getNotificationEmail(accountId);
      if (!to) return;
      const url = `${this.orderBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(order.id)}`;
      await this.email.deliver({
        to,
        subject: notification.title,
        text: `${notification.title}.\n\n${notification.body}\n\nOpen the order: ${url}`,
        html: `<p><strong>${escapeHtml(notification.title)}</strong>.</p><p>${escapeHtml(notification.body)}</p><p><a href="${escapeHtml(url)}">Open the order</a></p>`,
        idempotencyKey: `order-accepted/${order.id}`,
      });
    } catch (error) {
      console.error("Order-accepted email failed", { orderId: order.id, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  async list(accountId: string): Promise<{ notifications: OrderNotification[]; unread: number }> {
    const [notifications, unread] = await Promise.all([
      this.store.listForAccount(accountId, 20),
      this.store.countUnread(accountId),
    ]);
    return { notifications, unread };
  }

  async markAllRead(accountId: string): Promise<{ unread: 0 }> {
    await this.store.markAllRead(accountId, this.ctx.now().toISOString());
    return { unread: 0 };
  }
}
