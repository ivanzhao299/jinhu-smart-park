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
import { HrLifecycleController } from "./hr-lifecycle.controller";
import { HrLifecycleService } from "./hr-lifecycle.service";
import { HrTrainingController } from "./hr-training.controller";
import { HrTrainingService } from "./hr-training.service";
import {HrRewardsController} from "./hr-rewards.controller";import {HrRewardsService} from "./hr-rewards.service";
import {HrGoalReportController} from "./hr-goal-report.controller";import {HrGoalReportService} from "./hr-goal-report.service";
import {HrPerformanceReviewController} from "./hr-performance-review.controller";import {HrPerformanceReviewService} from "./hr-performance-review.service";
import {HrPerformanceEvaluationService} from "./hr-performance-evaluation.service";
@Module({imports:[TypeOrmModule.forFeature([...HR_ENTITIES,OrgEntity,UserEntity,UserMessageEntity]),AuditModule],controllers:[HrController,HrGoalReportController,HrPerformanceReviewController,HrPayrollHistoryController,HrRecruitmentController,HrLifecycleController,HrTrainingController,HrRewardsController],providers:[HrService,HrGoalReportService,HrPerformanceReviewService,HrPerformanceEvaluationService,HrNotificationService,HrPayrollHistoryService,HrRecruitmentService,HrLifecycleService,HrTrainingService,HrRewardsService,PartySensitiveDataService],exports:[HrService,HrGoalReportService,HrPerformanceReviewService,HrPerformanceEvaluationService,HrPayrollHistoryService,HrRecruitmentService,HrLifecycleService,HrTrainingService,HrRewardsService]})
export class HrModule {}
