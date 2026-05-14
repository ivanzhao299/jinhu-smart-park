import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";

export class CreateDictItemDto {
  @IsUUID()
  dictTypeId!: string;

  @IsString()
  @MaxLength(100)
  itemLabel!: string;

  @IsString()
  @MaxLength(100)
  itemValue!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsIn(["enabled", "disabled"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  tagType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
