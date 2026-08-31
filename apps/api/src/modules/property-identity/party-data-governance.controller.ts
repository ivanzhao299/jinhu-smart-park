import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { PROPERTY_BUSINESS_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  CreateConsentFactDto, CreateDataSubjectRequestDto, CreateLegalHoldDto,
  ClassifyLegacyRetentionDto, CompleteDataSubjectRequestDto, DecideDataSubjectRequestDto,
  ExecuteRetentionDueDto, ReleaseLegalHoldDto,
  UpdateRetentionPolicyDto, WithdrawConsentFactDto
} from "./dto/party-data-governance.dto";
import { PartyDataGovernanceService } from "./party-data-governance.service";

@Controller("property/party-data-governance")
@RequireModule("asset")
export class PartyDataGovernanceController {
  constructor(private readonly service: PartyDataGovernanceService) {}

  @Post("parties/:partyId/consent-facts")
  @RequirePermissions(PROPERTY_BUSINESS_PERMISSIONS.PARTY_CONSENT_MANAGE)
  createConsent(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Param("partyId", new ParseUUIDPipe({ version: "4" })) partyId: string,
    @Headers("x-idempotency-key") key: string | undefined, @Body() dto: CreateConsentFactDto) {
    return this.service.createConsent(scope, actor, partyId, key, dto);
  }

  @Post("parties/:partyId/consent-facts/:factId/withdraw")
  @RequirePermissions(PROPERTY_BUSINESS_PERMISSIONS.PARTY_CONSENT_MANAGE)
  withdrawConsent(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Param("partyId", new ParseUUIDPipe({ version: "4" })) partyId: string,
    @Param("factId", new ParseUUIDPipe({ version: "4" })) factId: string,
    @Headers("x-idempotency-key") key: string | undefined, @Body() dto: WithdrawConsentFactDto) {
    return this.service.withdrawConsent(scope, actor, partyId, factId, key, dto);
  }

  @Post("subject-requests")
  @RequirePermissions(PROPERTY_BUSINESS_PERMISSIONS.PARTY_SUBJECT_RIGHTS_MANAGE)
  createRequest(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Headers("x-idempotency-key") key: string | undefined, @Body() dto: CreateDataSubjectRequestDto) {
    return this.service.createSubjectRequest(scope, actor, key, dto);
  }

  @Post("subject-requests/:requestId/decision")
  @RequirePermissions(PROPERTY_BUSINESS_PERMISSIONS.PARTY_SUBJECT_RIGHTS_MANAGE)
  decideRequest(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Param("requestId", new ParseUUIDPipe({ version: "4" })) requestId: string,
    @Headers("x-idempotency-key") key: string | undefined, @Body() dto: DecideDataSubjectRequestDto) {
    return this.service.decideSubjectRequest(scope, actor, requestId, key, dto);
  }

  @Get("subject-requests/:requestId")
  @RequirePermissions(PROPERTY_BUSINESS_PERMISSIONS.PARTY_SUBJECT_RIGHTS_MANAGE)
  getRequest(@CurrentScope() scope: TenantParkScope,
    @Param("requestId", new ParseUUIDPipe({ version: "4" })) requestId: string) {
    return this.service.getSubjectRequest(scope, requestId);
  }

  @Post("subject-requests/:requestId/complete")
  @RequirePermissions(PROPERTY_BUSINESS_PERMISSIONS.PARTY_SUBJECT_RIGHTS_MANAGE)
  completeRequest(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Param("requestId", new ParseUUIDPipe({ version: "4" })) requestId: string,
    @Headers("x-idempotency-key") key: string | undefined, @Body() dto: CompleteDataSubjectRequestDto) {
    return this.service.completeSubjectRequest(scope, actor, requestId, key, dto);
  }

  @Post("legal-holds")
  @RequirePermissions(PROPERTY_BUSINESS_PERMISSIONS.PARTY_LEGAL_HOLD_MANAGE)
  createHold(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Headers("x-idempotency-key") key: string | undefined, @Body() dto: CreateLegalHoldDto) {
    return this.service.createLegalHold(scope, actor, key, dto);
  }

  @Post("legal-holds/:holdId/release")
  @RequirePermissions(PROPERTY_BUSINESS_PERMISSIONS.PARTY_LEGAL_HOLD_MANAGE)
  releaseHold(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Param("holdId", new ParseUUIDPipe({ version: "4" })) holdId: string,
    @Headers("x-idempotency-key") key: string | undefined, @Body() dto: ReleaseLegalHoldDto) {
    return this.service.releaseLegalHold(scope, actor, holdId, key, dto);
  }

  @Get("parties/:partyId/status")
  @RequirePermissions(PROPERTY_BUSINESS_PERMISSIONS.PARTY_CONSENT_MANAGE)
  getStatus(@CurrentScope() scope: TenantParkScope,
    @Param("partyId", new ParseUUIDPipe({ version: "4" })) partyId: string) {
    return this.service.getStatus(scope, partyId);
  }

  @Get("retention-policy")
  @RequirePermissions(PROPERTY_BUSINESS_PERMISSIONS.PARTY_RETENTION_MANAGE)
  getPolicy(@CurrentScope() scope: TenantParkScope) { return this.service.getRetentionPolicy(scope); }

  @Put("retention-policy")
  @RequirePermissions(PROPERTY_BUSINESS_PERMISSIONS.PARTY_RETENTION_MANAGE)
  updatePolicy(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Headers("x-idempotency-key") key: string | undefined, @Body() dto: UpdateRetentionPolicyDto) {
    return this.service.updateRetentionPolicy(scope, actor, key, dto);
  }

  @Post("retention-actions/execute-due")
  @RequirePermissions(PROPERTY_BUSINESS_PERMISSIONS.PARTY_RETENTION_MANAGE)
  executeDue(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Headers("x-idempotency-key") key: string | undefined, @Body() dto: ExecuteRetentionDueDto) {
    return this.service.executeRetentionDue(scope, actor, key, dto.limit ?? 100);
  }

  @Post("retention-actions/classify-legacy")
  @RequirePermissions(PROPERTY_BUSINESS_PERMISSIONS.PARTY_RETENTION_MANAGE)
  classifyLegacy(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Headers("x-idempotency-key") key: string | undefined, @Body() dto: ClassifyLegacyRetentionDto) {
    return this.service.classifyLegacyRetention(scope, actor, key, dto);
  }
}
