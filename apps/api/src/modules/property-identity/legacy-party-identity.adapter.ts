import { Injectable } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { propertyIdentityError } from "./property-identity.error";
import { PropertyIdentityService } from "./property-identity.service";

interface LegacyCurrentIdentityRow {
  identity_version: string | number;
  submission_id: string | null;
  submission_status: "draft" | "pending_verification" | "verified" | "rejected" | "withdrawn" | null;
  submission_version: number | null;
  assignment_version: number | null;
}

@Injectable()
export class LegacyPartyIdentityAdapter {
  constructor(
    private readonly dataSource: DataSource,
    private readonly identityService: PropertyIdentityService
  ) {}

  async writeDraft(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    partyId: string,
    clientKey: string | undefined,
    documentType: "id_card" | "passport" | null,
    identityNumber: string | null,
    manager: EntityManager
  ) {
    let current = await this.current(scope, partyId, manager);
    if (current.submission_status === "pending_verification" && current.submission_id) {
      const withdrawn = await this.identityService.withdraw(
        scope,
        actor,
        current.submission_id,
        clientKey,
        {
          clientKey: clientKey ?? "",
          expectedVersion: current.submission_version!,
          reason: "legacy-party-identity-update"
        },
        manager
      );
      current = {
        ...current,
        submission_status: "withdrawn",
        submission_version: withdrawn.version
      };
    }

    let submissionId = current.submission_id;
    let submissionVersion = current.submission_version;
    if (current.submission_status !== "draft") {
      const supersededStatus = current.submission_status === "pending_verification"
        ? "withdrawn"
        : current.submission_status;
      const superseded = current.submission_id && supersededStatus
        ? {
          supersedesSubmissionId: current.submission_id,
          expectedSupersededStatus: supersededStatus,
          expectedSupersededVersion: current.submission_version!
        }
        : {};
      const created = await this.identityService.create(
        scope,
        actor,
        clientKey,
        {
          clientKey: clientKey ?? "",
          partyId,
          expectedIdentityVersion: Number(current.identity_version),
          ...superseded
        },
        manager
      );
      submissionId = created.id;
      submissionVersion = created.version;
    }
    if (!submissionId || !submissionVersion) {
      throw propertyIdentityError("property-runtime-unavailable");
    }
    return this.identityService.update(
      scope,
      actor,
      submissionId,
      clientKey,
      {
        clientKey: clientKey ?? "",
        expectedVersion: submissionVersion,
        documentType,
        identityNumber,
        pendingFileIds: []
      },
      manager
    );
  }

  async decide(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    partyId: string,
    clientKey: string | undefined,
    decision: "verified" | "rejected",
    reason: string | null | undefined,
    manager: EntityManager
  ) {
    const current = await this.current(scope, partyId, manager);
    if (
      current.submission_status !== "pending_verification"
      || !current.submission_id
      || current.submission_version == null
      || current.assignment_version == null
    ) {
      throw propertyIdentityError("property-resource-not-found");
    }
    if (decision === "rejected" && !reason?.trim()) {
      throw propertyIdentityError("property-validation-failed");
    }
    return this.identityService.decide(
      scope,
      actor,
      current.submission_id,
      clientKey,
      {
        clientKey: clientKey ?? "",
        expectedVersion: current.submission_version,
        expectedAssignmentVersion: current.assignment_version,
        decision,
        reason: reason?.trim() || undefined
      },
      manager
    );
  }

  identitySummaries(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    partyIds: readonly string[]
  ) {
    return this.identityService.partyIdentitySummary(
      this.dataSource.manager,
      scope,
      partyIds,
      actor
    );
  }

  private async current(
    scope: TenantParkScope,
    partyId: string,
    manager: EntityManager
  ): Promise<LegacyCurrentIdentityRow> {
    const rows = await manager.query(
      `SELECT p.identity_version,
         s.id AS submission_id,
         s.status AS submission_status,
         s.version AS submission_version,
         s.assignment_version
       FROM public.biz_party p
       LEFT JOIN public.biz_party_identity_submission s
         ON s.tenant_id=p.tenant_id AND s.park_id=p.park_id
        AND s.id=p.current_identity_submission_id
       WHERE p.tenant_id=$1 AND p.park_id=$2 AND p.id=$3::uuid
         AND p.is_deleted=false`,
      [scope.tenantId, scope.parkId, partyId]
    ) as LegacyCurrentIdentityRow[];
    if (!rows[0]) throw propertyIdentityError("property-resource-not-found");
    return rows[0];
  }
}
