import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditModule } from "../audit/audit.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { PropertyOperationsModule } from "../property-operations/property-operations.module";
import { FileBusinessAccessService } from "./file-business-access.service";
import { FileEntity } from "./entities/file.entity";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";
import { FileStorageService } from "./storage/file-storage.service";
import { LocalFileStorageProvider } from "./storage/local-file-storage.provider";

@Module({
  imports: [TypeOrmModule.forFeature([FileEntity]), AuditModule, DataScopesModule, forwardRef(() => PropertyOperationsModule)],
  controllers: [FilesController],
  providers: [FilesService, FileBusinessAccessService, FileStorageService, LocalFileStorageProvider],
  exports: [FilesService]
})
export class FilesModule {}
