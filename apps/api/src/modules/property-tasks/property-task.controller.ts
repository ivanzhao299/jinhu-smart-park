import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query
} from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import {
  RequireAnyPermissions,
  RequirePermissions
} from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  PropertyTaskBlockDto,
  PropertyTaskListQueryDto,
  PropertyTaskMutationDto,
  PropertyTaskRebuildDto,
  PropertyTaskReleaseDto
} from "./dto/property-task.dto";
import { PropertyTaskService } from "./property-task.service";
import { CanonicalUuidPipe } from "./property-task.validation";

@Controller("property/tasks")
@RequireModule("asset")
export class PropertyTaskController {
  constructor(private readonly service: PropertyTaskService) {}

  @Post("internal/rebuild")
  @RequirePermissions(SYSTEM_PERMISSIONS.PROPERTY_TASK_REBUILD)
  rebuild(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Body() dto: PropertyTaskRebuildDto
  ) {
    return this.service.rebuild(scope, actor, dto);
  }

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.PROPERTY_TASK_READ)
  list(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: PropertyTaskListQueryDto
  ) {
    return this.service.list(scope, actor, query);
  }

  @Get(":taskId")
  @RequirePermissions(SYSTEM_PERMISSIONS.PROPERTY_TASK_READ)
  detail(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("taskId", CanonicalUuidPipe) taskId: string
  ) {
    return this.service.detail(scope, actor, taskId);
  }

  @Post(":taskId/claim")
  @RequirePermissions(SYSTEM_PERMISSIONS.PROPERTY_TASK_CLAIM)
  claim(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Param("taskId", CanonicalUuidPipe) taskId: string,
    @Body() dto: PropertyTaskMutationDto) {
    return this.service.claim(scope, actor, taskId, dto);
  }

  @Post(":taskId/start")
  @RequirePermissions(SYSTEM_PERMISSIONS.PROPERTY_TASK_PROCESS)
  start(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Param("taskId", CanonicalUuidPipe) taskId: string,
    @Body() dto: PropertyTaskMutationDto) {
    return this.service.start(scope, actor, taskId, dto);
  }

  @Post(":taskId/block")
  @RequirePermissions(SYSTEM_PERMISSIONS.PROPERTY_TASK_PROCESS)
  block(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Param("taskId", CanonicalUuidPipe) taskId: string,
    @Body() dto: PropertyTaskBlockDto) {
    return this.service.block(scope, actor, taskId, dto);
  }

  @Post(":taskId/unblock")
  @RequireAnyPermissions(
    SYSTEM_PERMISSIONS.PROPERTY_TASK_PROCESS,
    SYSTEM_PERMISSIONS.PROPERTY_TASK_SUPERVISE
  )
  unblock(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Param("taskId", CanonicalUuidPipe) taskId: string,
    @Body() dto: PropertyTaskMutationDto) {
    return this.service.unblock(scope, actor, taskId, dto);
  }

  @Post(":taskId/release")
  @RequireAnyPermissions(
    SYSTEM_PERMISSIONS.PROPERTY_TASK_RELEASE,
    SYSTEM_PERMISSIONS.PROPERTY_TASK_SUPERVISE
  )
  release(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Param("taskId", CanonicalUuidPipe) taskId: string,
    @Body() dto: PropertyTaskReleaseDto) {
    return this.service.release(scope, actor, taskId, dto);
  }
}
