import { IsString, MaxLength, MinLength } from "class-validator";

export class WechatBindDto {
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  bindTicket!: string;
}
