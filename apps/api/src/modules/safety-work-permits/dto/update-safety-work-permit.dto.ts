import { PartialType } from "@nestjs/mapped-types";
import { CreateSafetyWorkPermitDto } from "./create-safety-work-permit.dto";

export class UpdateSafetyWorkPermitDto extends PartialType(CreateSafetyWorkPermitDto) {}
