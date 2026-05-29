import { PartialType } from "@nestjs/mapped-types";
import { CreateIotProtocolConfigDto } from "./create-iot-protocol-config.dto";

export class UpdateIotProtocolConfigDto extends PartialType(CreateIotProtocolConfigDto) {}
