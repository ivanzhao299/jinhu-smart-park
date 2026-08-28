import { Body,Controller,Get,Param,ParseUUIDPipe,Post,Put,Query,UseInterceptors } from "@nestjs/common";
import { HR_PERMISSIONS,type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import {
  ApproveHrLegacyDictionaryDto,
  CreateHrLegacyDictionaryDraftDto,
  HrLegacyDictionaryListQueryDto,
  UpdateHrLegacyDictionaryItemDto,
} from "./dto/hr-legacy-dictionary.dto";
import { HrLegacyDictionaryService } from "./hr-legacy-dictionary.service";

@Controller("hr/legacy-dictionaries")
@RequireModule("hr")
export class HrLegacyDictionaryController {
  constructor(private readonly service:HrLegacyDictionaryService){}

  @Get()
  @RequirePermissions(HR_PERMISSIONS.HR_LEGACY_DICTIONARY_READ)
  list(@CurrentScope()scope:TenantParkScope,@CurrentUser()actor:JwtPrincipal,@Query()query:HrLegacyDictionaryListQueryDto){return this.service.list(scope,actor,query);}

  @Get(":id/items")
  @RequirePermissions(HR_PERMISSIONS.HR_LEGACY_DICTIONARY_READ)
  items(@CurrentScope()scope:TenantParkScope,@CurrentUser()actor:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string){return this.service.items(scope,actor,id);}

  @Post("drafts")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_LEGACY_DICTIONARY_MANAGE)
  @AuditLog({module:"人力资源管理",resource:"hr.legacy_dictionary",action:"创建玉舟迁移字典草稿",bizType:"hr_legacy_dictionary_version",captureBody:false})
  createDraft(@CurrentScope()scope:TenantParkScope,@CurrentUser()actor:JwtPrincipal,@Body()dto:CreateHrLegacyDictionaryDraftDto){return this.service.createDraft(scope,actor,dto);}

  @Put(":id/items/:itemId")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_LEGACY_DICTIONARY_MANAGE)
  @AuditLog({module:"人力资源管理",resource:"hr.legacy_dictionary",action:"复核玉舟迁移字典项",bizType:"hr_legacy_dictionary_version",bizIdParam:"id",captureBody:false})
  updateItem(@CurrentScope()scope:TenantParkScope,@CurrentUser()actor:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string,@Param("itemId",new ParseUUIDPipe())itemId:string,@Body()dto:UpdateHrLegacyDictionaryItemDto){return this.service.updateItem(scope,actor,id,itemId,dto);}

  @Post(":id/approve")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_LEGACY_DICTIONARY_APPROVE)
  @AuditLog({module:"人力资源管理",resource:"hr.legacy_dictionary",action:"批准玉舟迁移字典版本",bizType:"hr_legacy_dictionary_version",bizIdParam:"id",captureBody:false})
  approve(@CurrentScope()scope:TenantParkScope,@CurrentUser()actor:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string,@Body()dto:ApproveHrLegacyDictionaryDto){return this.service.approve(scope,actor,id,dto);}
}
