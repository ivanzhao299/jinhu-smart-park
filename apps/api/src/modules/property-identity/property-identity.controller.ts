import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query
} from "@nestjs/common";
import {
  PROPERTY_BUSINESS_PERMISSIONS,
  type TenantParkScope
} from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import {
  ClaimIdentityDto,
  CreateIdentityDraftDto,
  DecideIdentityDto,
  IdentityAuditListQueryDto,
  IdentitySubmissionListQueryDto,
  ReassignIdentityDto,
  SubmitIdentityDto,
  UpdateIdentityDraftDto,
  WithdrawIdentityDto
} from "./dto/identity-submission.dto";
import { PropertyIdentityService } from "./property-identity.service";

@Controller("property/identity-submissions")
@RequireModule("asset")
export class PropertyIdentityController {
  constructor(private readonly service: PropertyIdentityService) {}

  @Get()
  @RequirePermissions(
    PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PARTY_READ
  )
  list(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: IdentitySubmissionListQueryDto
  ) {
    return this.service.list(scope, actor, query);
  }

  @Get(":submissionId")
  @RequirePermissions(
    PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PARTY_READ
  )
  detail(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("submissionId", new ParseUUIDPipe({ version: "4" })) submissionId: string
  ) {
    return this.service.detail(scope, actor, submissionId);
  }

  @Post()
  @RequirePermissions(
    PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_UPDATE
  )
  @AuditLog({
    module: "共享房产底座",
    resource: "biz.party_identity_submission",
    action: "创建身份核验草稿",
    bizType: "party_identity_submission",
    captureBody: false
  })
  create(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Headers("x-idempotency-key") headerKey: string | undefined,
    @Body() dto: CreateIdentityDraftDto
  ) {
    return this.service.create(scope, actor, headerKey, dto);
  }

  @Put(":submissionId")
  @RequirePermissions(
    PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_UPDATE
  )
  @AuditLog({
    module: "共享房产底座",
    resource: "biz.party_identity_submission",
    action: "修改身份核验草稿",
    bizType: "party_identity_submission",
    bizIdParam: "submissionId",
    captureBody: false
  })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("submissionId", new ParseUUIDPipe({ version: "4" })) submissionId: string,
    @Headers("x-idempotency-key") headerKey: string | undefined,
    @Body() dto: UpdateIdentityDraftDto
  ) {
    return this.service.update(scope, actor, submissionId, headerKey, dto);
  }

  @Post(":submissionId/submit")
  @RequirePermissions(
    PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_UPDATE
  )
  submit(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("submissionId", new ParseUUIDPipe({ version: "4" })) submissionId: string,
    @Headers("x-idempotency-key") headerKey: string | undefined,
    @Body() dto: SubmitIdentityDto
  ) {
    return this.service.submit(scope, actor, submissionId, headerKey, dto);
  }

  @Post(":submissionId/claim")
  @RequirePermissions(
    PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY
  )
  claim(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("submissionId", new ParseUUIDPipe({ version: "4" })) submissionId: string,
    @Headers("x-idempotency-key") headerKey: string | undefined,
    @Body() dto: ClaimIdentityDto
  ) {
    return this.service.claim(scope, actor, submissionId, headerKey, dto);
  }

  @Post(":submissionId/reassign")
  @RequirePermissions(
    PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY
  )
  reassign(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("submissionId", new ParseUUIDPipe({ version: "4" })) submissionId: string,
    @Headers("x-idempotency-key") headerKey: string | undefined,
    @Body() dto: ReassignIdentityDto
  ) {
    return this.service.reassign(scope, actor, submissionId, headerKey, dto);
  }

  @Post(":submissionId/decisions")
  @RequirePermissions(
    PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY
  )
  decide(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("submissionId", new ParseUUIDPipe({ version: "4" })) submissionId: string,
    @Headers("x-idempotency-key") headerKey: string | undefined,
    @Body() dto: DecideIdentityDto
  ) {
    return this.service.decide(scope, actor, submissionId, headerKey, dto);
  }

  @Post(":submissionId/withdraw")
  @RequirePermissions(
    PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_UPDATE
  )
  withdraw(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("submissionId", new ParseUUIDPipe({ version: "4" })) submissionId: string,
    @Headers("x-idempotency-key") headerKey: string | undefined,
    @Body() dto: WithdrawIdentityDto
  ) {
    return this.service.withdraw(scope, actor, submissionId, headerKey, dto);
  }

  @Get(":submissionId/audit")
  @RequirePermissions(
    PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PARTY_SENSITIVE_READ,
    "audit:read"
  )
  audit(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("submissionId", new ParseUUIDPipe({ version: "4" })) submissionId: string,
    @Query() query: IdentityAuditListQueryDto
  ) {
    return this.service.audit(scope, actor, submissionId, query);
  }
}
