import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TenantEntity } from "./entities/tenant.entity";
import { TenantStatusService } from "./tenant-status.service";

@Module({
  imports: [TypeOrmModule.forFeature([TenantEntity])],
  providers: [TenantStatusService],
  exports: [TenantStatusService]
})
export class TenantStatusModule {}
