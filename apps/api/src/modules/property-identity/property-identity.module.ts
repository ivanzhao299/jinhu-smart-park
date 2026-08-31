import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PartySensitiveDataService } from "../property-operations/party-sensitive-data.service";
import {
  PartyIdentityAssignmentAuditEntity,
  PartyIdentityDecisionEntity,
  PartyIdentityDraftFileEntity,
  PartyIdentitySnapshotEntity,
  PartyIdentitySnapshotFileEntity,
  PartyIdentitySubmissionEntity,
  PartyIdentityVerificationQueueEntity
} from "./entities/property-identity.entities";
import { PropertyIdentityController } from "./property-identity.controller";
import { PropertyIdentityService } from "./property-identity.service";
import { PropertyIdentityVerificationService } from "./property-identity-verification.service";
import { LegacyPartyIdentityAdapter } from "./legacy-party-identity.adapter";
import { AuditModule } from "../audit/audit.module";
import { PartyDataKeyRotationService } from "./party-data-key-rotation.service";
import { PartyDataGovernanceController } from "./party-data-governance.controller";
import { PartyDataGovernanceService } from "./party-data-governance.service";

@Module({
  imports: [
    AuditModule,
    TypeOrmModule.forFeature([
      PartyIdentityVerificationQueueEntity,
      PartyIdentitySubmissionEntity,
      PartyIdentitySnapshotEntity,
      PartyIdentityDecisionEntity,
      PartyIdentityAssignmentAuditEntity,
      PartyIdentitySnapshotFileEntity,
      PartyIdentityDraftFileEntity
    ])
  ],
  controllers: [PropertyIdentityController, PartyDataGovernanceController],
  providers: [
    PartySensitiveDataService,
    PropertyIdentityService,
    PropertyIdentityVerificationService,
    LegacyPartyIdentityAdapter,
    PartyDataKeyRotationService,
    PartyDataGovernanceService
  ],
  exports: [
    PropertyIdentityService,
    PropertyIdentityVerificationService,
    LegacyPartyIdentityAdapter,
    PartyDataKeyRotationService,
    PartyDataGovernanceService
  ]
})
export class PropertyIdentityModule {}
