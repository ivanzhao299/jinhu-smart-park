import { Injectable } from "@nestjs/common";
import {
  SYSTEM_PERMISSIONS,
  type HousingTenantResponse,
  type PaginatedResult,
  type PartyListItemResponse,
  type TenantParkScope
} from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { CreatePartyDto, PartyQueryDto } from "../property-operations/dto/party.dto";
import { PartiesService } from "../property-operations/parties.service";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";

type HousingTenantProjectionSource = Pick<
  PartyListItemResponse,
  "id" | "displayName" | "verificationStatus" | "identityNumberMasked" | "mobile" | "email"
>;

@Injectable()
export class HousingTenantService {
  constructor(
    private readonly partiesService: PartiesService,
    private readonly unitAccessService: PropertyUnitAccessService
  ) {}

  async list(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: PartyQueryDto
  ): Promise<PaginatedResult<HousingTenantResponse>> {
    const housingUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    const result = await this.partiesService.listForDomainProjection(
      scope,
      { ...query, party_type: "person" },
      actor,
      housingUnitIds
    );
    return {
      ...result,
      items: result.items.map((tenant) => this.project(tenant, actor))
    };
  }

  async create(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreatePartyDto
  ): Promise<HousingTenantResponse> {
    const tenant = await this.partiesService.create(scope, actor, {
      ...dto,
      party_type: "person",
      source_domain: "housing_rental"
    });
    return this.project(tenant, actor);
  }

  project(
    tenant: HousingTenantProjectionSource,
    actor: JwtPrincipal
  ): HousingTenantResponse {
    const canManage = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_TENANT_MANAGE);
    const canReadSensitive = this.hasPermission(actor, SYSTEM_PERMISSIONS.PARTY_SENSITIVE_READ);
    return {
      id: tenant.id,
      displayName: tenant.displayName,
      verificationStatus: tenant.verificationStatus,
      ...(canReadSensitive ? {
        identityNumberMasked: tenant.identityNumberMasked
      } : {}),
      ...(canManage ? {
        mobile: this.maskMobile(tenant.mobile ?? null),
        email: this.maskEmail(tenant.email ?? null)
      } : {})
    };
  }

  private maskMobile(value: string | null): string | null {
    if (value === null) return null;
    if (/^\d{11}$/u.test(value)) return `${value.slice(0, 3)}****${value.slice(-4)}`;
    if (value.length <= 4) return "****";
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }

  private maskEmail(value: string | null): string | null {
    if (value === null) return null;
    const separatorIndex = value.indexOf("@");
    if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
      if (value.length <= 4) return "****";
      return `${value.slice(0, 2)}***${value.slice(-2)}`;
    }
    const name = value.slice(0, separatorIndex);
    const domain = value.slice(separatorIndex + 1);
    return `${name.slice(0, Math.min(2, name.length))}***@${domain}`;
  }

  private hasPermission(actor: JwtPrincipal, permission: string) {
    return Boolean(
      actor.isSuper
      || actor.permissions.includes("*")
      || actor.permissions.includes(permission)
    );
  }
}
