import { Controller, Get } from "@nestjs/common";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { EngineeringService } from "./engineering.service";

@Controller("engineering/runtime")
export class EngineeringController {
  constructor(private readonly engineeringService: EngineeringService) {}

  @Get("status")
  @RequirePermissions(SYSTEM_PERMISSIONS.MODULE_OPEN_READ)
  status() {
    return this.engineeringService.getRuntimeDescriptor();
  }
}
