import { PartialType } from "@nestjs/mapped-types";
import { CreateIotAlertRuleDto } from "./create-iot-alert-rule.dto";

export class UpdateIotAlertRuleDto extends PartialType(CreateIotAlertRuleDto) {}
