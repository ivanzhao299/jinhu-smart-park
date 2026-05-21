import { PartialType } from "@nestjs/mapped-types";
import { CreateSafetyEmergencyPlanDto } from "./create-safety-emergency-plan.dto";

export class UpdateSafetyEmergencyPlanDto extends PartialType(CreateSafetyEmergencyPlanDto) {}
