import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { IotRuleTriggerService } from "./iot-rule-trigger.service";

@Injectable()
export class IotRuleScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(IotRuleScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly ruleTriggerService: IotRuleTriggerService) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.ruleTriggerService.scanScheduleRules().catch((error) => {
        this.logger.warn(`IoT schedule rule scan failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, 60_000);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
