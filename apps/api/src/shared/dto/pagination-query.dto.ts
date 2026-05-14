import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class PaginationQueryDto {
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  page_size = 20;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsIn(["enabled", "disabled", "pending", "approved", "rejected", "archived"])
  status?: string;
}
