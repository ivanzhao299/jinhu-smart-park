import { PartialType } from "@nestjs/mapped-types";
import { CreateCameraDeviceDto } from "./create-camera-device.dto";

export class UpdateCameraDeviceDto extends PartialType(CreateCameraDeviceDto) {}
