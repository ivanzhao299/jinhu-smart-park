import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PropertyApprovalExecutionWorker } from "./property-approval.execution.worker";
import { PropertyEventPublisherWorker } from "./outbox/property-event.worker";
import { PropertyNotificationDeliveryWorker } from "./outbox/property-notification.worker";

const DEFAULT_INTERVAL_MS = 5_000;

@Injectable()
export class PropertyApprovalRuntimeScheduler
implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PropertyApprovalRuntimeScheduler.name);
  private readonly workerId = `property-approval-${randomUUID()}`;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopping = false;
  private activeRun: Promise<void> | null = null;

  constructor(
    private readonly executions: PropertyApprovalExecutionWorker,
    private readonly events: PropertyEventPublisherWorker,
    private readonly notifications: PropertyNotificationDeliveryWorker
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.PROPERTY_APPROVAL_RUNTIME_ENABLED === "false" || process.env.NODE_ENV === "test") {
      return;
    }
    const configured = Number(process.env.PROPERTY_APPROVAL_RUNTIME_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
    const interval = Number.isFinite(configured) && configured >= 1_000
      ? configured : DEFAULT_INTERVAL_MS;
    this.timer = setInterval(() => void this.run(), interval);
    this.timer.unref?.();
    setTimeout(() => void this.run(), 1_000).unref?.();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.activeRun;
  }

  async run(): Promise<void> {
    if (this.running || this.stopping) return;
    this.running = true;
    const cycle = this.runCycle();
    this.activeRun = cycle;
    try {
      await cycle;
    } catch (error) {
      this.logger.warn(
        `Property approval runtime cycle failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.running = false;
      this.activeRun = null;
    }
  }

  private async runCycle(): Promise<void> {
    await this.executions.run({ workerId: this.workerId });
    if (this.stopping) return;
    await this.events.run({ workerId: this.workerId });
    if (this.stopping) return;
    await this.events.runConsumerReplays();
    if (this.stopping) return;
    await this.notifications.run();
  }
}
