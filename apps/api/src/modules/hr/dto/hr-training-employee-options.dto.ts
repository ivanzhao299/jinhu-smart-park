import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
const scalarInteger=({value}:{value:unknown})=>typeof value==="number"?value:typeof value==="string"&&/^[0-9]+$/.test(value)?Number(value):Number.NaN;
export class HrTrainingEmployeeOptionsDto {
 @Transform(scalarInteger) @IsInt() @Min(1) @Max(2147483647) page=1;
 @Transform(scalarInteger) @IsInt() @Min(1) @Max(100) page_size=20;
 @IsOptional() @Transform(({value})=>typeof value==="string"?value.trim():value) @IsString() @MaxLength(100) keyword?:string;
}
