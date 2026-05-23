import { Controller, Get } from "@nestjs/common";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IotMqttService } from "./iot-mqtt.service";

@Controller("iot/mqtt")
@RequireModule("iot")
export class IotMqttController {
  constructor(private readonly mqttService: IotMqttService) {}

  @Get("status")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_MQTT_STATUS)
  status() {
    return this.mqttService.getStatus();
  }
}
