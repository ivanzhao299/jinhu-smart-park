import { PickType } from "@nestjs/mapped-types";
import { HrRewardEmployeeOptionsDto } from "./hr-reward-employee-options.dto";
export class HrRewardPayrollLinkOptionsDto extends PickType(HrRewardEmployeeOptionsDto,["page","page_size"] as const) {}
