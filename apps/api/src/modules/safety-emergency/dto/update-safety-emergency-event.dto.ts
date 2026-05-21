import { PartialType } from "@nestjs/mapped-types";
import { CreateSafetyEmergencyEventDto } from "./create-safety-emergency-event.dto";

export class UpdateSafetyEmergencyEventDto extends PartialType(CreateSafetyEmergencyEventDto) {}
