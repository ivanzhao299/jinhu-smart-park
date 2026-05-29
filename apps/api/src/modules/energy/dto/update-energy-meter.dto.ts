import { PartialType } from "@nestjs/mapped-types";
import { CreateEnergyMeterDto } from "./create-energy-meter.dto";

export class UpdateEnergyMeterDto extends PartialType(CreateEnergyMeterDto) {}
