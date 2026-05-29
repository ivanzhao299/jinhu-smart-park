import { PartialType } from "@nestjs/mapped-types";
import { CreateIotRuleDto } from "./create-iot-rule.dto";

export class UpdateIotRuleDto extends PartialType(CreateIotRuleDto) {}
