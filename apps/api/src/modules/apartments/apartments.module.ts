import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { APARTMENT_ENTITIES } from "./entities/apartment.entities";
import { ApartmentsController } from "./apartments.controller";
import { ApartmentsService } from "./apartments.service";
import { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
@Module({imports:[TypeOrmModule.forFeature(APARTMENT_ENTITIES)],controllers:[ApartmentsController],providers:[ApartmentsService,PartySensitiveDataService],exports:[ApartmentsService]})
export class ApartmentsModule {}
