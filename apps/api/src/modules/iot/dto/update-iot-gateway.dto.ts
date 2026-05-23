import { PartialType } from "@nestjs/mapped-types";
import { CreateIotGatewayDto } from "./create-iot-gateway.dto";

export class UpdateIotGatewayDto extends PartialType(CreateIotGatewayDto) {}
