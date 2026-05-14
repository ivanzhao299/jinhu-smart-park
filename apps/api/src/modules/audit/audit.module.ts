import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";
import { LoginLogEntity } from "./entities/login-log.entity";
import { OpLogEntity } from "./entities/op-log.entity";

@Module({
  imports: [TypeOrmModule.forFeature([LoginLogEntity, OpLogEntity])],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [TypeOrmModule, AuditService]
})
export class AuditModule {}
