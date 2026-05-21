import { PartialType } from "@nestjs/mapped-types";
import { CreateSafetyInspectPlanDto } from "./create-safety-inspect-plan.dto";

export class UpdateSafetyInspectPlanDto extends PartialType(CreateSafetyInspectPlanDto) {}
