import { Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, Max, MaxLength, Min, MinLength, Matches, Validate, ValidatorConstraint, type ValidatorConstraintInterface } from 'class-validator';
import { validateHrPerformanceChannelDefinition, type HrPerformanceChannelDefinition } from '@jinhu/shared';
@ValidatorConstraint({ name: 'channelDefinition', async: false })
export class HrPerformanceChannelDefinitionConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) { try { validateHrPerformanceChannelDefinition(value); return true; } catch { return false; } }
  defaultMessage() { return 'Invalid performance channel definition'; }
}
export class CreateHrPerformanceChannelTemplateDto {
  @IsString() @MinLength(1) @Matches(/\S/) @MaxLength(64) templateCode!: string;
  @IsString() @MinLength(1) @Matches(/\S/) @MaxLength(120) templateName!: string;
  @IsString() @MinLength(1) @Matches(/\S/) @MaxLength(120) versionName!: string;
  @Validate(HrPerformanceChannelDefinitionConstraint) config!: HrPerformanceChannelDefinition;
}
export class CreateHrPerformanceChannelVersionDto extends CreateHrPerformanceChannelTemplateDto { @IsUUID() expectedVersionId!: string; }
export class AppendHrPerformanceChannelDefinitionDto {
  @IsUUID() expectedRevisionId!: string;
  @Validate(HrPerformanceChannelDefinitionConstraint) config!: HrPerformanceChannelDefinition;
}
export class HrPerformanceChannelHistoryQueryDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 10;
}
