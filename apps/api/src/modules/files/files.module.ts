import { forwardRef, Module } from "@nestjs/common";
import { PropertyOperationsModule } from "../property-operations/property-operations.module";
import { FILE_PROPERTY_UNIT_ACCESS_PORT } from "./file-property-unit-access.port";
import { FilesKernelModule } from "./files-kernel.module";
import { IntegratedPropertyUnitAccessAdapter } from "./integrated-property-unit-access.adapter";

@Module({
  imports: [
    FilesKernelModule.register({
      imports: [forwardRef(() => PropertyOperationsModule)],
      propertyUnitAccessProvider: {
        provide: FILE_PROPERTY_UNIT_ACCESS_PORT,
        useClass: IntegratedPropertyUnitAccessAdapter
      }
    })
  ],
  exports: [FilesKernelModule]
})
export class FilesModule {}
