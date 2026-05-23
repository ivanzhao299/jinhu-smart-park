import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { DictTypeEntity } from "../dicts/entities/dict-type.entity";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { FileEntity } from "../files/entities/file.entity";
import { IotModule } from "../iot/iot.module";
import { LeasingCheckoutEntity } from "../leasing-checkouts/entities/leasing-checkout.entity";
import { LeasingRefundEntity } from "../leasing-checkouts/entities/leasing-refund.entity";
import { LeasingContractChangeEntity } from "../leasing-contract-changes/entities/leasing-contract-change.entity";
import { LeasingContractEntity } from "../leasing-contracts/entities/leasing-contract.entity";
import { LeasingInvoiceEntity } from "../leasing-invoices/entities/leasing-invoice.entity";
import { LeasingPaymentEntity } from "../leasing-payments/entities/leasing-payment.entity";
import { LeasingReceivableEntity } from "../leasing-receivables/entities/leasing-receivable.entity";
import { SafetyEmergencyModule } from "../safety-emergency/safety-emergency.module";
import { SafetyHazardsModule } from "../safety-hazards/safety-hazards.module";
import { SafetyWorkPermitsModule } from "../safety-work-permits/safety-work-permits.module";
import { WorkOrdersModule } from "../work-orders/work-orders.module";
import { ParkTenantContactEntity } from "./entities/park-tenant-contact.entity";
import { ParkTenantQualificationEntity } from "./entities/park-tenant-qualification.entity";
import { ParkTenantRiskLogEntity } from "./entities/park-tenant-risk-log.entity";
import { ParkTenantEntity } from "./entities/park-tenant.entity";
import { ParkTenantContactsService } from "./park-tenant-contacts.service";
import { ParkTenantQualificationsService } from "./park-tenant-qualifications.service";
import { ParkTenantsController } from "./park-tenants.controller";
import { ParkTenantsService } from "./park-tenants.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ParkTenantEntity,
      ParkTenantContactEntity,
      ParkTenantQualificationEntity,
      ParkTenantRiskLogEntity,
      LeasingContractEntity,
      LeasingContractChangeEntity,
      LeasingCheckoutEntity,
      LeasingRefundEntity,
      LeasingReceivableEntity,
      LeasingPaymentEntity,
      LeasingInvoiceEntity,
      FileEntity,
      DictTypeEntity,
      DictItemEntity
    ]),
    CodeRulesModule,
    DataScopesModule,
    FieldPoliciesModule,
    WorkOrdersModule,
    SafetyHazardsModule,
    SafetyEmergencyModule,
    SafetyWorkPermitsModule,
    IotModule
  ],
  controllers: [ParkTenantsController],
  providers: [ParkTenantsService, ParkTenantContactsService, ParkTenantQualificationsService],
  exports: [ParkTenantsService, ParkTenantContactsService, ParkTenantQualificationsService]
})
export class ParkTenantsModule {}
