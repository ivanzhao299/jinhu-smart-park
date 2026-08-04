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

@Module({
  imports: [
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
  controllers: [PropertyIdentityController],
  providers: [
    PartySensitiveDataService,
    PropertyIdentityService,
    PropertyIdentityVerificationService,
    LegacyPartyIdentityAdapter
  ],
  exports: [
    PropertyIdentityService,
    PropertyIdentityVerificationService,
    LegacyPartyIdentityAdapter
  ]
})
export class PropertyIdentityModule {}
