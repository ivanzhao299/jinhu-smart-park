import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { FileEntity } from "../files/entities/file.entity";
import { LeasingReceivableStatusLogEntity } from "../leasing-receivables/entities/leasing-receivable-status-log.entity";
import { LeasingReceivableEntity } from "../leasing-receivables/entities/leasing-receivable.entity";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { LeasingInvoiceReceivableEntity } from "./entities/leasing-invoice-receivable.entity";
import { LeasingInvoiceEntity } from "./entities/leasing-invoice.entity";
import { LeasingInvoicesController } from "./leasing-invoices.controller";
import { LeasingInvoicesService } from "./leasing-invoices.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LeasingInvoiceEntity,
      LeasingInvoiceReceivableEntity,
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
  controllers: [LeasingInvoicesController],
  providers: [LeasingInvoicesService],
  exports: [LeasingInvoicesService]
})
export class LeasingInvoicesModule {}
