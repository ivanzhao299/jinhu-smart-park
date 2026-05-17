import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { LeasingContractEntity } from "../leasing-contracts/entities/leasing-contract.entity";
import { LeasingReceivableEntity } from "../leasing-receivables/entities/leasing-receivable.entity";
import { LeasingReceivableStatusLogEntity } from "../leasing-receivables/entities/leasing-receivable-status-log.entity";
import { LeasingContractChangesController, LeasingContractNestedChangesController } from "./leasing-contract-changes.controller";
import { LeasingContractChangesService } from "./leasing-contract-changes.service";
import { LeasingContractActionLogEntity } from "./entities/leasing-contract-action-log.entity";
import { LeasingContractChangeEntity } from "./entities/leasing-contract-change.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LeasingContractChangeEntity,
      LeasingContractActionLogEntity,
      LeasingContractEntity,
      LeasingReceivableEntity,
      LeasingReceivableStatusLogEntity,
      DictItemEntity
    ]),
    CodeRulesModule,
    DataScopesModule,
    FieldPoliciesModule
  ],
  controllers: [LeasingContractChangesController, LeasingContractNestedChangesController],
  providers: [LeasingContractChangesService],
  exports: [LeasingContractChangesService]
})
export class LeasingContractChangesModule {}
