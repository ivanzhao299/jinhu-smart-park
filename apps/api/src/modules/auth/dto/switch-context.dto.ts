import { IsString, MaxLength } from "class-validator";

export class SwitchContextDto {
  @IsString()
  @MaxLength(64)
  parkId!: string;
}
