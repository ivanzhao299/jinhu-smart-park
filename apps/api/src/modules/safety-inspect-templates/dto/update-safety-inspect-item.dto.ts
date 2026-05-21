import { PartialType } from "@nestjs/mapped-types";
import { CreateSafetyInspectItemDto } from "./create-safety-inspect-item.dto";

export class UpdateSafetyInspectItemDto extends PartialType(CreateSafetyInspectItemDto) {}
