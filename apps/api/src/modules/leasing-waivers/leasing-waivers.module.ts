import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { LeasingReceivableStatusLogEntity } from "../leasing-receivables/entities/leasing-receivable-status-log.entity";
import { LeasingReceivableEntity } from "../leasing-receivables/entities/leasing-receivable.entity";
import { LeasingWaiverEntity } from "./entities/leasing-waiver.entity";
import { LeasingWaiversController } from "./leasing-waivers.controller";
import { LeasingWaiversService } from "./leasing-waivers.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LeasingWaiverEntity,
      LeasingReceivableEntity,
      LeasingReceivableStatusLogEntity,
      DictItemEntity
    ]),
    CodeRulesModule,
    DataScopesModule,
    FieldPoliciesModule
  ],
  controllers: [LeasingWaiversController],
  providers: [LeasingWaiversService],
  exports: [LeasingWaiversService]
})
export class LeasingWaiversModule {}
