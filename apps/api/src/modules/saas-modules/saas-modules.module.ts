import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ModuleRegistryEntity } from "./entities/module-registry.entity";
import { PlanModuleEntity } from "./entities/plan-module.entity";
import { PlanEntity } from "./entities/plan.entity";
import { SaaSModuleEntity } from "./entities/saas-module.entity";
import { TenantModuleEntity } from "./entities/tenant-module.entity";
import { SaaSModulesController } from "./saas-modules.controller";
import { SaaSModulesService } from "./saas-modules.service";

@Module({
  imports: [TypeOrmModule.forFeature([ModuleRegistryEntity, SaaSModuleEntity, PlanEntity, PlanModuleEntity, TenantModuleEntity])],
  controllers: [SaaSModulesController],
  providers: [SaaSModulesService],
  exports: [SaaSModulesService]
})
export class SaaSModulesModule {}
