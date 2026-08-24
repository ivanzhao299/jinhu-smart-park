import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OrgEntity } from "../orgs/entities/org.entity";
import { UserEntity } from "../users/entities/user.entity";
import { UserMessageEntity } from "../workflow/entities/user-message.entity";
import { AuditModule } from "../audit/audit.module";
import { HR_ENTITIES } from "./entities/hr.entities";
import { HrController } from "./hr.controller";
import { HrNotificationService } from "./hr-notification.service";
import { HrPayrollHistoryController } from "./hr-payroll-history.controller";
import { HrPayrollHistoryService } from "./hr-payroll-history.service";
import { HrService } from "./hr.service";
import { HrRecruitmentController } from "./hr-recruitment.controller";
import { HrRecruitmentService } from "./hr-recruitment.service";
import { PartySensitiveDataService } from "../property-operations/party-sensitive-data.service";
@Module({imports:[TypeOrmModule.forFeature([...HR_ENTITIES,OrgEntity,UserEntity,UserMessageEntity]),AuditModule],controllers:[HrController,HrPayrollHistoryController,HrRecruitmentController],providers:[HrService,HrNotificationService,HrPayrollHistoryService,HrRecruitmentService,PartySensitiveDataService],exports:[HrService,HrPayrollHistoryService,HrRecruitmentService]})
export class HrModule {}
