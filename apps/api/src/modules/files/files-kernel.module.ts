import { type DynamicModule, Module, type ModuleMetadata, type Provider } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditModule } from "../audit/audit.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { FileBusinessAccessService } from "./file-business-access.service";
import { FileEntity } from "./entities/file.entity";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";
import { FileStorageService } from "./storage/file-storage.service";
import { LocalFileStorageProvider } from "./storage/local-file-storage.provider";

export interface FilesKernelModuleOptions {
  imports?: NonNullable<ModuleMetadata["imports"]>;
  propertyUnitAccessProvider: Provider;
}

@Module({})
export class FilesKernelModule {
  static register(options: FilesKernelModuleOptions): DynamicModule {
    return {
      module: FilesKernelModule,
      imports: [
        TypeOrmModule.forFeature([FileEntity]),
        AuditModule,
        DataScopesModule,
        ...(options.imports ?? [])
      ],
      controllers: [FilesController],
      providers: [
        FilesService,
        FileBusinessAccessService,
        FileStorageService,
        LocalFileStorageProvider,
        options.propertyUnitAccessProvider
      ],
      exports: [FilesService]
    };
  }
}
