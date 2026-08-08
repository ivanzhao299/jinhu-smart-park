import { Inject, Injectable } from "@nestjs/common";
import {
  PROPERTY_NOTIFICATION_CHANNEL,
  PROPERTY_NOTIFICATION_STORE,
  type PropertyNotificationChannelPort,
  type PropertyNotificationStore
} from "./property-notification.contracts";

@Injectable()
export class PropertyNotificationDeliveryWorker {
  constructor(
    @Inject(PROPERTY_NOTIFICATION_STORE) private readonly store: PropertyNotificationStore,
    @Inject(PROPERTY_NOTIFICATION_CHANNEL) private readonly channel: PropertyNotificationChannelPort
  ) {}

  async run(input: {
    limit?: number;
    leaseSeconds?: number;
    retryDelayMs?: (attempt: number) => number;
  } = {}) {
    const deliveries = await this.store.claimDeliveries({
      limit: Math.min(Math.max(input.limit ?? 50, 1), 500),
      leaseSeconds: Math.min(Math.max(input.leaseSeconds ?? 60, 5), 900)
    });
    const summary = { claimed: deliveries.length, delivered: 0, failed: 0, exhausted: 0, stale: 0 };
    const retryDelay = input.retryDelayMs ?? ((attempt: number) =>
      Math.min(300_000, 1_000 * 2 ** Math.min(attempt, 8)));
    for (const delivery of deliveries) {
      try {
        await this.channel.deliver(delivery);
        if (await this.store.completeDelivery(delivery)) summary.delivered += 1;
        else summary.stale += 1;
      } catch (error) {
        const raw = typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code ?? "") : "";
        const errorCode = /^[a-z][a-z0-9-]{0,127}$/.test(raw)
          ? raw : "notification-delivery-failed";
        const status = await this.store.failDelivery({
          delivery,
          errorCode,
          retryAt: new Date(Date.now() + retryDelay(delivery.attemptCount + 1))
        });
        if (status === "delivery_exhausted") summary.exhausted += 1;
        else if (status === "delivery_failed") summary.failed += 1;
        else summary.stale += 1;
      }
    }
    return summary;
  }
}
