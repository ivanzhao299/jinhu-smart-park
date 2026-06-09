import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { LeasingContractUnitEntity } from "../leasing-contracts/entities/leasing-contract-unit.entity";
import { LeasingContractEntity } from "../leasing-contracts/entities/leasing-contract.entity";
import { LeasingPaymentReceivableEntity } from "../leasing-payments/entities/leasing-payment-receivable.entity";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { LeasingReceivableStatusLogEntity } from "./entities/leasing-receivable-status-log.entity";
import { LeasingReceivableEntity } from "./entities/leasing-receivable.entity";
import { LeasingContractReceivablesController } from "./leasing-contract-receivables.controller";
import { LeasingReceivablesController } from "./leasing-receivables.controller";
import { LeasingReceivablesService } from "./leasing-receivables.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LeasingReceivableEntity,
      LeasingReceivableStatusLogEntity,
      LeasingContractEntity,
      LeasingContractUnitEntity,
      LeasingPaymentReceivableEntity,
      ParkTenantEntity,
      DictItemEntity
    ]),
    CodeRulesModule,
    DataScopesModule,
    FieldPoliciesModule
  ],
  controllers: [LeasingReceivablesController, LeasingContractReceivablesController],
  providers: [LeasingReceivablesService],
  exports: [LeasingReceivablesService]
})
export class LeasingReceivablesModule {}
