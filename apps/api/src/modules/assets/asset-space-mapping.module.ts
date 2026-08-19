import { Module } from "@nestjs/common";
import { AssetSpaceMappingService } from "./asset-space-mapping.service";

@Module({
  providers: [AssetSpaceMappingService],
  exports: [AssetSpaceMappingService]
})
export class AssetSpaceMappingModule {}
