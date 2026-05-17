import { Transform } from "class-transformer";
import { IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

export class ReceivableAgingQueryDto {
  @IsOptional()
  @IsUUID()
  park_tenant_id?: string;

  @IsOptional()
  @IsUUID()
  contract_id?: string;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;
}

export class ReceivableOverdueQueryDto extends ReceivableAgingQueryDto {
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  page_size = 20;
}
