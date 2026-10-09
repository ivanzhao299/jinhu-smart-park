import {IsOptional,IsUUID} from "class-validator";
import {HrTalentEmployeeOptionsDto} from "./hr-talent-employee-options.dto";
export class HrTalentProfilePageDto extends HrTalentEmployeeOptionsDto {
 @IsOptional() @IsUUID() employeeId?:string;
}
