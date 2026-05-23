import { PartialType } from "@nestjs/mapped-types";
import { CreateIotMetricDto } from "./create-iot-metric.dto";

export class UpdateIotMetricDto extends PartialType(CreateIotMetricDto) {}
