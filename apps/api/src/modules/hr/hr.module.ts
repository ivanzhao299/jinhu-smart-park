import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OrgEntity } from "../orgs/entities/org.entity";
import { UserEntity } from "../users/entities/user.entity";
import { UserMessageEntity } from "../workflow/entities/user-message.entity";
import { AuditModule } from "../audit/audit.module";
import { HR_ENTITIES } from "./entities/hr.entities";
import { HrController } from "./hr.controller";
import { HrNotificationService } from "./hr-notification.service";
import { HrService } from "./hr.service";
@Module({imports:[TypeOrmModule.forFeature([...HR_ENTITIES,OrgEntity,UserEntity,UserMessageEntity]),AuditModule],controllers:[HrController],providers:[HrService,HrNotificationService],exports:[HrService]})
export class HrModule {}
