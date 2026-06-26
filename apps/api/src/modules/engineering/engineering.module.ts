import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringController } from "./engineering.controller";
import { EngineeringService } from "./engineering.service";
import { EngineeringProjectRepository } from "./repositories/engineering-project.repository";

@Module({
  imports: [TypeOrmModule.forFeature([EngineeringProjectEntity])],
  controllers: [EngineeringController],
  providers: [EngineeringService, EngineeringProjectRepository],
  exports: [EngineeringService, EngineeringProjectRepository]
})
export class EngineeringModule {}
