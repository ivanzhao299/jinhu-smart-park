import { PartialType } from "@nestjs/mapped-types";
import { CreateSafetyInspectPointDto } from "./create-safety-inspect-point.dto";

export class UpdateSafetyInspectPointDto extends PartialType(CreateSafetyInspectPointDto) {}
