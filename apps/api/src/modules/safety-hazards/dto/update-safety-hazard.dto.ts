import { PartialType } from "@nestjs/mapped-types";
import { CreateSafetyHazardDto } from "./create-safety-hazard.dto";

export class UpdateSafetyHazardDto extends PartialType(CreateSafetyHazardDto) {}
