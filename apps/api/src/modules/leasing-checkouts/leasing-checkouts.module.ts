import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { FileEntity } from "../files/entities/file.entity";
import { LeasingContractActionLogEntity } from "../leasing-contract-changes/entities/leasing-contract-action-log.entity";
import { LeasingContractStatusLogEntity } from "../leasing-contracts/entities/leasing-contract-status-log.entity";
import { LeasingContractEntity } from "../leasing-contracts/entities/leasing-contract.entity";
import { LeasingContractUnitEntity } from "../leasing-contracts/entities/leasing-contract-unit.entity";
import { LeasingReceivableStatusLogEntity } from "../leasing-receivables/entities/leasing-receivable-status-log.entity";
import { LeasingReceivableEntity } from "../leasing-receivables/entities/leasing-receivable.entity";
import { UnitStatusLogEntity } from "../units/entities/unit-status-log.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import { LeasingContractNestedCheckoutsController, LeasingCheckoutsController, LeasingRefundsController } from "./leasing-checkouts.controller";
import { LeasingCheckoutsService } from "./leasing-checkouts.service";
import { LeasingCheckoutEntity } from "./entities/leasing-checkout.entity";
import { LeasingRefundEntity } from "./entities/leasing-refund.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LeasingCheckoutEntity,
      LeasingRefundEntity,
      LeasingContractEntity,
      LeasingContractUnitEntity,
      LeasingContractStatusLogEntity,
      LeasingContractActionLogEntity,
      LeasingReceivableEntity,
      LeasingReceivableStatusLogEntity,
      UnitEntity,
      UnitStatusLogEntity,
      FileEntity,
      DictItemEntity
    ]),
    CodeRulesModule,
    DataScopesModule,
    FieldPoliciesModule
  ],
  controllers: [LeasingCheckoutsController, LeasingContractNestedCheckoutsController, LeasingRefundsController],
  providers: [LeasingCheckoutsService],
  exports: [LeasingCheckoutsService]
})
export class LeasingCheckoutsModule {}
