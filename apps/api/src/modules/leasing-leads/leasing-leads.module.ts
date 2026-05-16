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
import { LeasingLeadEntity } from "./entities/leasing-lead.entity";
import { LeasingVisitEntity } from "./entities/leasing-visit.entity";
import { LeasingLeadsController } from "./leasing-leads.controller";
import { LeasingLeadsService } from "./leasing-leads.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([LeasingLeadEntity, LeasingFollowEntity, LeasingVisitEntity, UnitEntity, UserEntity, ParkTenantEntity, DictItemEntity, FileEntity]),
    CodeRulesModule,
    DataScopesModule,
    FieldPoliciesModule
  ],
  controllers: [LeasingLeadsController],
  providers: [LeasingLeadsService],
  exports: [LeasingLeadsService]
})
export class LeasingLeadsModule {}
