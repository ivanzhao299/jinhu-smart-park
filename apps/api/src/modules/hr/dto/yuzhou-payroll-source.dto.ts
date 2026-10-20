import { IsObject, IsString, Matches, MaxLength } from "class-validator";
/** The shared contract performs canonical deep validation. */
export class PreviewYuzhouPayrollSourceDto { @IsObject() package!: Record<string, unknown>; }
export class YuzhouPayrollSourceHeadQueryDto {
  @IsString() @MaxLength(128) @Matches(/\S/u) sourceInstance!: string;
  @Matches(/^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/u) month!: string;
}
