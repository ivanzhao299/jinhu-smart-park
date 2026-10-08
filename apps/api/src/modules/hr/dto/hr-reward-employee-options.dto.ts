import { HrTrainingEmployeeOptionsDto } from "./hr-training-employee-options.dto";

// Both operations use the same strict scalar paging/search contract.
// Reuse its validation metadata without changing existing training routes.
export class HrRewardEmployeeOptionsDto extends HrTrainingEmployeeOptionsDto {}
