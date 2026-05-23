import { PartialType } from "@nestjs/mapped-types";
import { CreateIotDeviceDto } from "./create-iot-device.dto";

export class UpdateIotDeviceDto extends PartialType(CreateIotDeviceDto) {}
