import { Injectable } from "@nestjs/common";
import type {
  IdentityVerificationPort,
  TenantParkScope,
  VerifiedIdentityEvidence
} from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import { PropertyIdentityService } from "./property-identity.service";

@Injectable()
export class PropertyIdentityVerificationService implements IdentityVerificationPort {
  constructor(private readonly identityService: PropertyIdentityService) {}

  verifyForCheckIn(input: {
    manager: { readonly transactionContext: unknown };
    scope: TenantParkScope;
    bookingId: string;
    partyIds: readonly string[];
    expectedConsent: "granted";
  }): Promise<readonly VerifiedIdentityEvidence[]> {
    return this.identityService.verifyForCheckIn({
      ...input,
      manager: input.manager.transactionContext as EntityManager
    });
  }

  verifyForHousingMoveIn(input: {
    manager: { readonly transactionContext: unknown };
    scope: TenantParkScope;
    leaseId: string;
    partyIds: readonly string[];
    expectedConsent: "granted";
  }): Promise<readonly VerifiedIdentityEvidence[]> {
    return this.identityService.verifyForHousingMoveIn({
      ...input,
      manager: input.manager.transactionContext as EntityManager
    });
  }
}
