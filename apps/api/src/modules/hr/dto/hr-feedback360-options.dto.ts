import {Transform} from "class-transformer";
import {IsIn,IsInt,IsOptional,IsString,Max,MaxLength,Min} from "class-validator";
const integer=({value}:{value:unknown})=>typeof value==="number"?value:typeof value==="string"&&/^[0-9]+$/.test(value)?Number(value):Number.NaN;
export class HrFeedback360EmployeeOptionsDto {
 @Transform(integer) @IsInt() @Min(1) @Max(2147483647) page=1;
 @Transform(integer) @IsInt() @Min(1) @Max(100) page_size=20;
 @IsOptional() @Transform(({value})=>typeof value==="string"?value.trim():value) @IsString() @MaxLength(100) keyword?:string;
}
export class HrFeedback360SubjectOptionsDto extends HrFeedback360EmployeeOptionsDto {
 @IsIn(["nominate","publish"]) purpose:"nominate"|"publish"="nominate";
}
