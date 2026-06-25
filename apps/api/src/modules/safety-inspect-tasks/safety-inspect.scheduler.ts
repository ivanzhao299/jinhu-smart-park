import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { SafetyInspectRuntimeService } from "./safety-inspect-runtime.service";

const DEFAULT_INTERVAL_MS = 60_000;

@Injectable()
export class SafetyInspectScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SafetyInspectScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly runtimeService: SafetyInspectRuntimeService) {}

  onApplicationBootstrap(): void {
    if (process.env.SAFETY_INSPECT_SCHEDULER_ENABLED === "false") {
      this.logger.log("Safety inspect scheduler disabled by SAFETY_INSPECT_SCHEDULER_ENABLED=false");
      return;
    }
    const interval = this.readInterval();
    this.timer = setInterval(() => void this.run(), interval);
    this.timer.unref?.();
    setTimeout(() => void this.run(), 3_000).unref?.();
    this.logger.log(`Safety inspect scheduler enabled, interval=${interval}ms`);
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async run(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const result = await this.runtimeService.runOnce();
      if (result.due_plan_count > 0 || result.overdue_marked_count > 0 || result.errors.length > 0) {
        this.logger.log(
          `Safety inspect runtime scanned: duePlans=${result.due_plan_count}, generated=${result.generated_count}, skipped=${result.skipped_count}, overdue=${result.overdue_marked_count}, errors=${result.errors.length}, dryRun=${result.dry_run}`
        );
      }
    } catch (error) {
      this.logger.warn(`Safety inspect runtime scan failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }

  private readInterval(): number {
    const interval = Number(process.env.SAFETY_INSPECT_SCHEDULER_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
    return Number.isFinite(interval) && interval > 0 ? interval : DEFAULT_INTERVAL_MS;
  }
}
