import { describe, expect, it, vi } from "vitest";
import type { TradeOrder } from "../src/domain/trade-types.js";
import type { EmailMessage, InvitationDelivery } from "../src/integrations/invitation-email.js";
import { NotificationService } from "../src/service/notification-service.js";
import { MemoryIdentityStore } from "../src/store/identity-store.js";
import { MemoryNotificationStore } from "../src/store/notification-store.js";
import { ARBITRATOR, BUYER, SUPPLIER, controlledContext } from "./fixtures.js";

const ORDER_ID = "44444444-4444-4444-8444-444444444444";

function acceptedOrder(overrides: Partial<TradeOrder> = {}): TradeOrder {
  return {
    id: ORDER_ID, reference: "PO-42", initiatorRole: "buyer", buyerId: BUYER, buyerName: "GreenBite Trading",
    supplierId: SUPPLIER, supplierName: "FreshSource Foods", arbitratorId: ARBITRATOR,
    assetType: "BOT", amountUnits: "100", orderHash: "hash", description: "Olive oil", deliveryDate: "2026-10-20",
    deliveryLocation: "PJ", lineItems: [], status: "supplier_confirmed", version: 1,
    createdAt: "2026-10-08T00:00:00.000Z", updatedAt: "2026-10-08T00:00:00.000Z", ...overrides,
  };
}

function setup(deliver: (message: EmailMessage) => Promise<InvitationDelivery> = async () => ({ status: "sent", messageId: "m-1", attemptedAt: "now" })) {
  const accounts = new MemoryIdentityStore();
  const email = { deliver: vi.fn(deliver) };
  const service = new NotificationService(
    new MemoryNotificationStore(), accounts, email, controlledContext("2026-10-08T01:00:00.000Z").ctx, "https://openlc.online/orders/",
  );
  return { accounts, email, service };
}

describe("NotificationService.orderAccepted", () => {
  it("tells the buyer who issued the order, in-app and by email, to fund the escrow", async () => {
    const { accounts, email, service } = setup();
    await accounts.setNotificationEmail(BUYER, "buyer@example.com");
    await service.orderAccepted(acceptedOrder());

    expect(await service.list(BUYER)).toMatchObject({
      unread: 1,
      notifications: [{ orderId: ORDER_ID, kind: "order_accepted", title: "FreshSource Foods accepted PO-42", body: "Fund the escrow to start the order." }],
    });
    expect((await service.list(SUPPLIER)).notifications).toEqual([]);
    expect(email.deliver).toHaveBeenCalledOnce();
    const message = email.deliver.mock.calls[0]![0];
    expect(message).toMatchObject({ to: "buyer@example.com", subject: "FreshSource Foods accepted PO-42", idempotencyKey: `order-accepted/${ORDER_ID}` });
    expect(message.text).toContain(`https://openlc.online/orders/${ORDER_ID}`);
  });

  it("tells the supplier who issued the order that the buyer can now fund it", async () => {
    const { service } = setup();
    await service.orderAccepted(acceptedOrder({ initiatorRole: "supplier" }));
    expect((await service.list(SUPPLIER)).notifications).toMatchObject([{ title: "GreenBite Trading accepted PO-42", body: "They can now fund the escrow." }]);
    expect((await service.list(BUYER)).notifications).toEqual([]);
  });

  it("creates the in-app notification without an email when none is set", async () => {
    const { email, service } = setup();
    await service.orderAccepted(acceptedOrder());
    expect((await service.list(BUYER)).unread).toBe(1);
    expect(email.deliver).not.toHaveBeenCalled();
  });

  it("notifies once per order, so a repeated accept sends no second email", async () => {
    const { accounts, email, service } = setup();
    await accounts.setNotificationEmail(BUYER, "buyer@example.com");
    await service.orderAccepted(acceptedOrder());
    await service.orderAccepted(acceptedOrder());
    expect((await service.list(BUYER)).notifications).toHaveLength(1);
    expect(email.deliver).toHaveBeenCalledOnce();
  });

  it("keeps the in-app notification when the email fails or the sender throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const failures = [
        async () => ({ status: "failed" as const, attemptedAt: "now" }),
        async (): Promise<InvitationDelivery> => { throw new Error("provider down"); },
      ];
      for (const deliver of failures) {
        const { accounts, email, service } = setup(deliver);
        await accounts.setNotificationEmail(BUYER, "buyer@example.com");
        await expect(service.orderAccepted(acceptedOrder())).resolves.toBeUndefined();
        expect(email.deliver).toHaveBeenCalledOnce();
        expect((await service.list(BUYER)).unread).toBe(1);
      }
      expect(log).toHaveBeenCalledWith("Order-accepted email failed", expect.objectContaining({ reason: "provider down" }));
    } finally {
      log.mockRestore();
    }
  });

  it("escapes company names in the HTML email", async () => {
    const { accounts, email, service } = setup();
    await accounts.setNotificationEmail(BUYER, "buyer@example.com");
    await service.orderAccepted(acceptedOrder({ supplierName: "<script>x</script>" }));
    expect(email.deliver.mock.calls[0]![0].html).not.toContain("<script>");
  });

  it("marks every notification read", async () => {
    const { service } = setup();
    await service.orderAccepted(acceptedOrder());
    expect(await service.markAllRead(BUYER)).toEqual({ unread: 0 });
    const { notifications, unread } = await service.list(BUYER);
    expect(unread).toBe(0);
    expect(notifications[0]!.readAt).toBe("2026-10-08T01:00:00.000Z");
  });
});
