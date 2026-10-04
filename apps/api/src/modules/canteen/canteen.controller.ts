import { Controller, Get } from "@nestjs/common";
import { CanteenService } from "./canteen.service";

@Controller("canteen")
export class CanteenController {
  constructor(private readonly canteenService: CanteenService) {}

  @Get("health")
  health() {
    return this.canteenService.health();
  }
}
