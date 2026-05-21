import { PartialType } from "@nestjs/mapped-types";
import { CreateSafetyEmergencyContactDto } from "./create-safety-emergency-contact.dto";

export class UpdateSafetyEmergencyContactDto extends PartialType(CreateSafetyEmergencyContactDto) {}
