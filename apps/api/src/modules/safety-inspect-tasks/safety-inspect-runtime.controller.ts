import { Body, Controller, Get, Post } from "@nestjs/common";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { RunSafetyInspectRuntimeDto } from "./dto/run-safety-inspect-runtime.dto";
import { SafetyInspectRuntimeService } from "./safety-inspect-runtime.service";

@Controller("safety/inspect-runtime")
@RequireModule("safety")
export class SafetyInspectRuntimeController {
  constructor(private readonly runtimeService: SafetyInspectRuntimeService) {}

  @Get("status")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_READ)
  status() {
    return {
      scheduler_enabled: process.env.SAFETY_INSPECT_SCHEDULER_ENABLED !== "false",
      scheduler_interval_ms: Number(process.env.SAFETY_INSPECT_SCHEDULER_INTERVAL_MS ?? 60_000),
      dry_run: process.env.SAFETY_INSPECT_SCHEDULER_DRY_RUN === "true",
      generate_lookahead_days: Number(process.env.SAFETY_INSPECT_GENERATE_LOOKAHEAD_DAYS ?? 1),
      batch_size: Number(process.env.SAFETY_INSPECT_SCHEDULER_BATCH_SIZE ?? 50)
    };
  }

  @Post("run")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_GENERATE)
  @AuditLog({ module: "安全巡检", action: "手动触发巡检 Runtime", resource: "biz.safety_inspect_runtime", bizType: "safety_inspect_runtime" })
  run(@Body() dto: RunSafetyInspectRuntimeDto) {
    return this.runtimeService.runOnce({ dryRun: dto.dry_run });
  }
}
