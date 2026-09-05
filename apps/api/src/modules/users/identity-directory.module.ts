import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserEntity } from "./entities/user.entity";
import { IdentityDirectoryService } from "./identity-directory.service";

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  providers: [IdentityDirectoryService],
  exports: [IdentityDirectoryService]
})
export class IdentityDirectoryModule {}
