import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { FileEntity } from "../files/entities/file.entity";
import { LeasingLeadEntity } from "../leasing-leads/entities/leasing-lead.entity";
import { LeasingQuoteEntity } from "../leasing-leads/entities/leasing-quote.entity";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { UnitStatusLogEntity } from "../units/entities/unit-status-log.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import { LeasingContractUnitEntity } from "./entities/leasing-contract-unit.entity";
import { LeasingContractStatusLogEntity } from "./entities/leasing-contract-status-log.entity";
import { LeasingContractEntity } from "./entities/leasing-contract.entity";
import { LeasingContractsController } from "./leasing-contracts.controller";
import { LeasingContractsService } from "./leasing-contracts.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LeasingContractEntity,
      LeasingContractUnitEntity,
      LeasingContractStatusLogEntity,
      ParkTenantEntity,
      UnitEntity,
      UnitStatusLogEntity,
      LeasingLeadEntity,
      LeasingQuoteEntity,
      FileEntity,
      DictItemEntity
    ]),
    CodeRulesModule,
    DataScopesModule,
    FieldPoliciesModule
  ],
  controllers: [LeasingContractsController],
  providers: [LeasingContractsService],
  exports: [LeasingContractsService]
})
export class LeasingContractsModule {}
