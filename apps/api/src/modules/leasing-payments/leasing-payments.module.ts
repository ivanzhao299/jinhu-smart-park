import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { FileEntity } from "../files/entities/file.entity";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { LeasingReceivableStatusLogEntity } from "../leasing-receivables/entities/leasing-receivable-status-log.entity";
import { LeasingReceivableEntity } from "../leasing-receivables/entities/leasing-receivable.entity";
import { LeasingPaymentReceivableEntity } from "./entities/leasing-payment-receivable.entity";
import { LeasingPaymentEntity } from "./entities/leasing-payment.entity";
import { LeasingPaymentsController } from "./leasing-payments.controller";
import { LeasingPaymentsService } from "./leasing-payments.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LeasingPaymentEntity,
      LeasingPaymentReceivableEntity,
      LeasingReceivableEntity,
      LeasingReceivableStatusLogEntity,
      ParkTenantEntity,
      FileEntity,
      DictItemEntity
    ]),
    CodeRulesModule,
    DataScopesModule,
    FieldPoliciesModule
  ],
  controllers: [LeasingPaymentsController],
  providers: [LeasingPaymentsService],
  exports: [LeasingPaymentsService]
})
export class LeasingPaymentsModule {}
