import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { OrgEntity } from "./entities/org.entity";
import { PostEntity } from "./entities/post.entity";
import { UserOrgEntity } from "./entities/user-org.entity";
import { OrgsController } from "./orgs.controller";
import { OrgsService } from "./orgs.service";
import { UserEntity } from "../users/entities/user.entity";

@Module({
  imports: [TypeOrmModule.forFeature([OrgEntity, PostEntity, UserOrgEntity, UserEntity]), DataScopesModule, FieldPoliciesModule],
  controllers: [OrgsController],
  providers: [OrgsService],
  exports: [OrgsService, TypeOrmModule]
})
export class OrgsModule {}
