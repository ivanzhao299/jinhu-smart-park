import { PickType } from "@nestjs/mapped-types";
import { HrTrainingEmployeeOptionsDto } from "./hr-training-employee-options.dto";
export class HrPerformanceRewardEvidenceQueryDto extends PickType(HrTrainingEmployeeOptionsDto,["page","page_size"] as const) {}
