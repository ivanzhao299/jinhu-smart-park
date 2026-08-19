import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OrgEntity } from "../orgs/entities/org.entity";
import { UserEntity } from "../users/entities/user.entity";
import { HR_ENTITIES } from "./entities/hr.entities";
import { HrController } from "./hr.controller";
import { HrService } from "./hr.service";
@Module({imports:[TypeOrmModule.forFeature([...HR_ENTITIES,OrgEntity,UserEntity])],controllers:[HrController],providers:[HrService],exports:[HrService]})
export class HrModule {}
