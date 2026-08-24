import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

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

export class HrPayrollReviewActionDto {
  @IsIn(["comment","resolve","reject"]) action!:string;
  @IsIn(["needs_follow_up","accepted_exception","mapping_confirmed","unsafe_rejected"]) decision!:string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(1000) comment!:string;
}
