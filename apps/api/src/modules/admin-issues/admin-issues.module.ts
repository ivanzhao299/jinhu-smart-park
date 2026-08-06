import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminIssuesController } from "./admin-issues.controller";
import { AdminIssuesService } from "./admin-issues.service";
import { AdminIssueReportEntity } from "./entities/admin-issue-report.entity";

@Module({
  imports: [TypeOrmModule.forFeature([AdminIssueReportEntity])],
  controllers: [AdminIssuesController],
  providers: [AdminIssuesService],
  exports: [AdminIssuesService]
})
export class AdminIssuesModule {}
