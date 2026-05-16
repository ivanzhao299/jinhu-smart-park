import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { DictTypeEntity } from "../dicts/entities/dict-type.entity";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { FileEntity } from "../files/entities/file.entity";
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
      FileEntity,
      DictTypeEntity,
      DictItemEntity
    ]),
    CodeRulesModule,
    DataScopesModule,
    FieldPoliciesModule
  ],
  controllers: [ParkTenantsController],
  providers: [ParkTenantsService, ParkTenantContactsService, ParkTenantQualificationsService],
  exports: [ParkTenantsService, ParkTenantContactsService, ParkTenantQualificationsService]
})
export class ParkTenantsModule {}
