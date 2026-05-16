import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { FileEntity } from "../files/entities/file.entity";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import { UserEntity } from "../users/entities/user.entity";
import { LeasingFollowEntity } from "./entities/leasing-follow.entity";
import { LeasingLeadStatusLogEntity } from "./entities/leasing-lead-status-log.entity";
import { LeasingLeadEntity } from "./entities/leasing-lead.entity";
import { LeasingQuoteEntity } from "./entities/leasing-quote.entity";
import { LeasingVisitEntity } from "./entities/leasing-visit.entity";
import { LeasingLeadPoolController } from "./leasing-lead-pool.controller";
import { LeasingLeadsController } from "./leasing-leads.controller";
import { LeasingQuotesController } from "./leasing-quotes.controller";
import { LeasingLeadsService } from "./leasing-leads.service";
import { LeasingStatisticsController } from "./leasing-statistics.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LeasingLeadEntity,
      LeasingLeadStatusLogEntity,
      LeasingFollowEntity,
      LeasingVisitEntity,
      LeasingQuoteEntity,
      UnitEntity,
      UserEntity,
      ParkTenantEntity,
      DictItemEntity,
      FileEntity
    ]),
    CodeRulesModule,
    DataScopesModule,
    FieldPoliciesModule
  ],
  controllers: [LeasingLeadPoolController, LeasingLeadsController, LeasingQuotesController, LeasingStatisticsController],
  providers: [LeasingLeadsService],
  exports: [LeasingLeadsService]
})
export class LeasingLeadsModule {}
