import { Module } from "@nestjs/common";
import { FILE_PROPERTY_UNIT_ACCESS_PORT } from "./file-property-unit-access.port";
import { FilesKernelModule } from "./files-kernel.module";
import { HrLeafPropertyUnitAccessAdapter } from "./hr-leaf-property-unit-access.adapter";

@Module({
  imports: [
    FilesKernelModule.register({
      propertyUnitAccessProvider: {
        provide: FILE_PROPERTY_UNIT_ACCESS_PORT,
        useClass: HrLeafPropertyUnitAccessAdapter
      }
    })
  ],
  exports: [FilesKernelModule]
})
export class HrFilesModule {}
