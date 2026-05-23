import { PartialType } from "@nestjs/mapped-types";
import { CreateIotPointDto } from "./create-iot-point.dto";

export class UpdateIotPointDto extends PartialType(CreateIotPointDto) {}
