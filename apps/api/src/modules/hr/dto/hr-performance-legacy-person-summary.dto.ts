import {
  HR_PERFORMANCE_LEGACY_PERSON_SUMMARY_ROUTINES,
  type HrPerformanceLegacyPersonSummaryRoutine,
} from "@jinhu/shared";
import { IsIn } from "class-validator";
import { HrPerformanceLegacyPersonSummaryQueryDto } from "./hr-performance-legacy.dto";

export class HrPerformanceLegacyPersonSummaryRoutineQueryDto
  extends HrPerformanceLegacyPersonSummaryQueryDto {
  @IsIn(HR_PERFORMANCE_LEGACY_PERSON_SUMMARY_ROUTINES)
  source_routine!: HrPerformanceLegacyPersonSummaryRoutine;
}
