import { Controller, Get } from "@nestjs/common";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { EngineeringService } from "./engineering.service";

@Controller("engineering/runtime")
export class EngineeringController {
  constructor(private readonly engineeringService: EngineeringService) {}

  @Get("status")
  @RequirePermissions("ENGINEERING_DASHBOARD_VIEW")
  status() {
    return this.engineeringService.getRuntimeDescriptor();
  }
}
