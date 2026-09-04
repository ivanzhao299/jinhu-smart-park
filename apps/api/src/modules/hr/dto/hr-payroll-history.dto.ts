import { Transform } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const trim=({value}:{value:unknown})=>typeof value==="string"?value.trim():value;

export class HrPayrollHistoryQueryDto {
  @Transform(({value})=>Number(value??1)) @IsInt() @Min(1) page=1;
  @Transform(({value})=>Number(value??20)) @IsInt() @Min(1) @Max(100) page_size=20;
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])-01$/) period_from?:string;
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])-01$/) period_to?:string;
  @IsOptional() @IsUUID() book_id?:string;
  @IsOptional() @IsUUID() employee_id?:string;
}

export class HrPayrollCatalogQueryDto {
  @Transform(({value})=>Number(value??1)) @IsInt() @Min(1) page=1;
  @Transform(({value})=>Number(value??50)) @IsInt() @Min(1) @Max(100) page_size=50;
  @IsOptional() @IsUUID() book_id?:string;
  @IsOptional() @IsIn(["parsed","manual_review","rejected","approved_for_simulation"]) parse_status?:string;
  @IsOptional() @IsIn(["open","superseded"]) status?:string;
  @IsOptional() @IsIn(["employee_unmapped","item_unmapped","formula_unsafe","period_invalid","amount_unbalanced","duplicate_source","other"]) case_type?:string;
}

export class HrPayrollTaxRuleQueryDto {
  @Transform(({value})=>Number(value??1)) @IsInt() @Min(1) page=1;
  @Transform(({value})=>Number(value??20)) @IsInt() @Min(1) @Max(100) page_size=20;
}

export class HrPayrollReviewActionDto {
  @IsIn(["comment","resolve","reject"]) action!:string;
  @IsIn(["needs_follow_up","accepted_exception","mapping_confirmed","unsafe_rejected"]) decision!:string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(1000) comment!:string;
}
export class HrPayrollFormulaReviewDto {
  @IsIn(["approve_for_simulation", "reject"]) decision!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}

export class HrPayrollReconciliationQueryDto {
  @Transform(({ value }) => Number(value ?? 1)) @IsInt() @Min(1) page = 1;
  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  page_size = 20;
  @IsOptional() @IsIn(["review", "accepted", "rejected"]) status?: string;
}

export class HrPayrollReconciliationDetailQueryDto {
  @Transform(({ value }) => Number(value ?? 1)) @IsInt() @Min(1) result_page =
    1;
  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  result_page_size = 20;
}

export class CreateHrPayrollReconciliationDto {
  @IsUUID() legacyBatchId!: string;
  @IsUUID() attendanceInputBatchId!: string;
  @IsOptional() @IsUUID() supersedesRunId?: string;
}

export class HrPayrollReconciliationReviewDto {
  @IsIn(["accept_explanation", "reject_explanation", "request_follow_up"])
  decision!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(1000) comment!: string;
  @IsOptional() @IsUUID() resultId?: string;
  @IsOptional() @IsUUID() itemDifferenceId?: string;
}

export class CreateHrPayrollReconciliationPolicyDto {
  @IsUUID() bookId!: string;
  @IsUUID() netItemVersionId!: string;
  @Transform(trim) @Matches(/^\d{1,15}(?:\.\d{1,4})?$/) toleranceAmount =
    "0.0000";
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}
