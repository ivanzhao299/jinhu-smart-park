import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IdempotencyService } from "./idempotency.service";

const DEFAULT_CLEANUP_ENABLED = true;
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_CLEANUP_BATCH_SIZE = 1000;
const MIN_CLEANUP_INTERVAL_MS = 60 * 1000;

@Injectable()
export class IdempotencyCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IdempotencyCleanupService.name);
  private timer: NodeJS.Timeout | null = null;
  private intervalMs = DEFAULT_CLEANUP_INTERVAL_MS;
  private batchSize = DEFAULT_CLEANUP_BATCH_SIZE;

  constructor(
    private readonly configService: ConfigService,
    private readonly idempotencyService: IdempotencyService
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.log("Idempotency cleanup is disabled");
      return;
    }

    this.intervalMs = this.readIntervalMs();
    this.batchSize = this.readBatchSize();
    this.timer = setInterval(() => {
      void this.runCleanup();
    }, this.intervalMs);
    this.timer.unref?.();
    this.logger.log(
      `Idempotency cleanup scheduled: interval=${this.intervalMs}ms batchSize=${this.batchSize}`
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.log("Idempotency cleanup timer cleared");
    }
  }

  async runCleanup(): Promise<void> {
    try {
      const deletedCount = await this.idempotencyService.cleanupExpired(this.batchSize);
      this.logger.log(
        `Idempotency cleanup completed: deleted=${deletedCount} batchSize=${this.batchSize} interval=${this.intervalMs}ms`
      );
    } catch (error) {
      this.logger.warn(
        `Idempotency cleanup failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private isEnabled(): boolean {
    const raw = this.configService.get<string | boolean | undefined>("IDEMPOTENCY_CLEANUP_ENABLED");
    if (typeof raw === "boolean") {
      return raw;
    }
    if (typeof raw === "string") {
      const normalized = raw.trim().toLowerCase();
      if (["false", "0", "no", "off"].includes(normalized)) {
        return false;
      }
      if (["true", "1", "yes", "on"].includes(normalized)) {
        return true;
      }
    }
    return DEFAULT_CLEANUP_ENABLED;
  }

  private readIntervalMs(): number {
    const raw = this.configService.get<string | number | undefined>("IDEMPOTENCY_CLEANUP_INTERVAL_MS");
    const parsed = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(parsed)) {
      return DEFAULT_CLEANUP_INTERVAL_MS;
    }
    return Math.max(MIN_CLEANUP_INTERVAL_MS, Math.floor(parsed));
  }

  private readBatchSize(): number {
    const raw = this.configService.get<string | number | undefined>("IDEMPOTENCY_CLEANUP_BATCH_SIZE");
    const parsed = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(parsed)) {
      return DEFAULT_CLEANUP_BATCH_SIZE;
    }
    return Math.max(1, Math.floor(parsed));
  }
}
