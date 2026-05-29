import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { IotRuntimeService } from "./iot-runtime.service";

@Injectable()
export class IotStatusScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(IotStatusScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly runtimeService: IotRuntimeService) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.runtimeService.scanHeartbeatTimeouts().catch((error) => {
        this.logger.warn(`IoT heartbeat timeout scan failed: ${error instanceof Error ? error.message : String(error)}`);
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
