import { Module } from "@nestjs/common";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { AssetSpaceMappingService } from "./asset-space-mapping.service";

@Module({
  imports: [DataScopesModule],
  providers: [AssetSpaceMappingService],
  exports: [AssetSpaceMappingService]
})
export class AssetSpaceMappingModule {}
