import { PartialType } from "@nestjs/mapped-types";
import { CreateVideoPlatformConfigDto } from "./create-video-platform-config.dto";

export class UpdateVideoPlatformConfigDto extends PartialType(CreateVideoPlatformConfigDto) {}
