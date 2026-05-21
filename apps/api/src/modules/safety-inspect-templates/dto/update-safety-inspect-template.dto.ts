import { PartialType } from "@nestjs/mapped-types";
import { CreateSafetyInspectTemplateDto } from "./create-safety-inspect-template.dto";

export class UpdateSafetyInspectTemplateDto extends PartialType(CreateSafetyInspectTemplateDto) {}
