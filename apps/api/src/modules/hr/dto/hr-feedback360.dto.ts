import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
export class HrCompetencyAnchorDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  level!: number;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(1000)
  text!: string;
}
export class HrCompetencyDimensionDto {
  @Transform(trim) @Matches(/^[A-Z][A-Z0-9_]{1,31}$/)
  code!: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  name!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000)
  description?: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(.0001) @Max(1)
  weight!: number;
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => HrCompetencyAnchorDto)
  anchors!: HrCompetencyAnchorDto[];
}
export class CreateHrCompetencyModelDto {
  @Transform(trim) @Matches(/^[A-Z][A-Z0-9_-]{1,31}$/)
  modelCode!: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  modelName!: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  versionName!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  scaleMin!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(.01) @Max(100)
  scaleMax!: number;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => HrCompetencyDimensionDto)
  dimensions!: HrCompetencyDimensionDto[];
}
export class HrFeedbackQuestionDto {
  @Transform(trim) @Matches(/^[A-Z][A-Z0-9_]{1,31}$/)
  code!: string;
  @Transform(trim) @Matches(/^[A-Z][A-Z0-9_]{1,31}$/)
  dimensionCode!: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(1000)
  text!: string;
  @IsOptional() @IsIn(["rating", "text"])
  type?: "rating" | "text";
  @IsOptional() @IsBoolean()
  required?: boolean;
}
export class CreateHrFeedbackQuestionnaireDto {
  @Transform(trim) @Matches(/^[A-Z][A-Z0-9_-]{1,31}$/)
  questionnaireCode!: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  questionnaireName!: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  versionName!: string;
  @IsUUID()
  modelVersionId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => HrFeedbackQuestionDto)
  questions!: HrFeedbackQuestionDto[];
}
export class CreateHrFeedback360CycleDto {
  @Transform(trim) @Matches(/^[A-Z][A-Z0-9_-]{1,31}$/)
  cycleCode!: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  cycleName!: string;
  @IsUUID()
  modelVersionId!: string;
  @IsUUID()
  questionnaireVersionId!: string;
  @IsDateString()
  nominationEnd!: string;
  @IsDateString()
  responseEnd!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(3) @Max(20)
  minimumAnonymousResponses?: number;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  employeeIds!: string[];
}
export class CreateHrFeedbackNominationDto {
  @IsUUID()
  subjectId!: string;
  @IsUUID()
  nomineeEmployeeId!: string;
  @IsIn(["self", "manager", "peer", "subordinate", "collaborator"])
  relationType!: string;
}
export class DecideHrFeedbackNominationDto {
  @IsIn(["approve", "reject"])
  decision!: "approve" | "reject";
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000)
  reason?: string;
}
export class HrFeedbackAnswerDto {
  @Transform(trim) @Matches(/^[A-Z][A-Z0-9_]{1,31}$/)
  questionCode!: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  score?: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000)
  text?: string;
}
export class SubmitHrFeedback360Dto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => HrFeedbackAnswerDto)
  answers!: HrFeedbackAnswerDto[];
}
export class HrFeedback360QueryDto {
  @IsOptional() @IsUUID()
  subject_id?: string;
  @IsOptional() @IsUUID()
  cycle_id?: string;
}
