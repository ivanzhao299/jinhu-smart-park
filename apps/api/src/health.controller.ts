import { Controller, Get } from "@nestjs/common";
import { Public } from "./shared/decorators/public.decorator";

@Controller("health")
export class HealthController {
  @Public()
  @Get()
  getHealth() {
    return {
      status: "ok",
      service: "jinhu-smart-park-api",
      timestamp: new Date().toISOString()
    };
  }
}
