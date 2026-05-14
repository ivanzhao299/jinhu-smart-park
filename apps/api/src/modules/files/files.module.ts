import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditModule } from "../audit/audit.module";
import { FileEntity } from "./entities/file.entity";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";
import { FileStorageService } from "./storage/file-storage.service";
import { LocalFileStorageProvider } from "./storage/local-file-storage.provider";

@Module({
  imports: [TypeOrmModule.forFeature([FileEntity]), AuditModule],
  controllers: [FilesController],
  providers: [FilesService, FileStorageService, LocalFileStorageProvider],
  exports: [FilesService]
})
export class FilesModule {}
