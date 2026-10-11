import { Transform } from "class-transformer";
import { IsBoolean, IsInt, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
export class PutHrEmployeeRestDayDto {
 @IsInt() @Min(0) @Max(2147483646) expectedVersion!: number;
 @IsBoolean() isRest!: boolean;
 @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}
