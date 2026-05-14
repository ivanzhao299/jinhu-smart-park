import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateDictTypeDto {
  @IsString()
  @MaxLength(64)
  dictCode!: string;

  @IsString()
  @MaxLength(100)
  dictName!: string;

  @IsOptional()
  @IsIn(["enabled", "disabled"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
