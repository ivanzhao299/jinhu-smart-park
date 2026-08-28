import { Controller,Get,Param,ParseUUIDPipe,Query } from "@nestjs/common";
import { HR_PERMISSIONS,type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequireAnyPermissions,RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrLegacyArchiveQueryDto } from "./dto/hr-legacy-archive.dto";
import { HrLegacyArchiveService } from "./hr-legacy-archive.service";

@Controller("hr/legacy-archive")
@RequireModule("hr")
export class HrLegacyArchiveController {
  constructor(private readonly service:HrLegacyArchiveService){}

  @Get()
  @RequireAnyPermissions(HR_PERMISSIONS.HR_LEGACY_ARCHIVE_READ,HR_PERMISSIONS.HR_LEGACY_ARCHIVE_TEAM_READ,HR_PERMISSIONS.HR_LEGACY_ARCHIVE_SELF_READ)
  list(@CurrentScope()scope:TenantParkScope,@CurrentUser()actor:JwtPrincipal,@Query()query:HrLegacyArchiveQueryDto){return this.service.list(scope,actor,query);}

  @Get("unclaimed")
  @RequirePermissions(HR_PERMISSIONS.HR_LEGACY_ARCHIVE_UNCLAIMED_READ)
  unclaimed(@CurrentScope()scope:TenantParkScope,@CurrentUser()actor:JwtPrincipal,@Query()query:HrLegacyArchiveQueryDto){return this.service.listUnclaimed(scope,actor,query);}

  @Get("employees/:employeeId")
  @RequireAnyPermissions(HR_PERMISSIONS.HR_LEGACY_ARCHIVE_READ,HR_PERMISSIONS.HR_LEGACY_ARCHIVE_TEAM_READ,HR_PERMISSIONS.HR_LEGACY_ARCHIVE_SELF_READ)
  employee(@CurrentScope()scope:TenantParkScope,@CurrentUser()actor:JwtPrincipal,@Param("employeeId",new ParseUUIDPipe())employeeId:string,@Query()query:HrLegacyArchiveQueryDto){return this.service.list(scope,actor,{...query,employee_id:employeeId});}

  @Get(":id")
  @RequireAnyPermissions(HR_PERMISSIONS.HR_LEGACY_ARCHIVE_READ,HR_PERMISSIONS.HR_LEGACY_ARCHIVE_TEAM_READ,HR_PERMISSIONS.HR_LEGACY_ARCHIVE_SELF_READ)
  detail(@CurrentScope()scope:TenantParkScope,@CurrentUser()actor:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string){return this.service.detail(scope,actor,id);}
}
