import { ConflictException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { type IdentityVerificationPort, type TenantParkScope } from "@jinhu/shared";
import { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PartyEntity } from "../property-operations/entities/party.entity";
import { PropertyOccupancyEntity } from "../property-operations/entities/property-occupancy.entity";
import {
  PROPERTY_OCCUPANCY_PORT,
  type PropertyOccupancyPort
} from "../property-operations/property-occupancy.port";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import { PropertyIdentityVerificationService } from "../property-identity/property-identity-verification.service";
import type { AddHomestayGuestDto, IssueHomestayCredentialDto } from "./dto/homestay.dto";
import {
  HomestayBookingEntity,
  HomestayBookingGuestEntity,
  HomestayStayCredentialEntity,
  HomestayTurnoverTaskEntity
} from "./entities/homestay.entities";
import {
  assertHomestayCheckInWindow,
  assertHomestayGuestIdentityVerified,
  assertHomestayGuestRegistrationOpen,
  assertHomestayGuestRosterComplete,
  turnoverLockEnd
} from "./homestay-booking.policy";
import { projectHomestayCredential } from "./homestay-projections";
import { HomestayTransactionSupportService } from "./homestay-transaction-support.service";

@Injectable()
export class HomestayStayCommandService {
  constructor(
    @Inject(PROPERTY_OCCUPANCY_PORT)
    private readonly propertyOccupanciesService: PropertyOccupancyPort,
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly dataSource: DataSource,
    private readonly transactionSupport: HomestayTransactionSupportService,
    @Optional()
    private readonly identityVerifier?: PropertyIdentityVerificationService
  ) {}

  async addGuest(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    bookingId: string,
    dto: AddHomestayGuestDto
  ) {
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.transactionSupport.lockBooking(manager, scope, bookingId);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      assertHomestayGuestRegistrationOpen(booking.status);
      const party = await manager.getRepository(PartyEntity).createQueryBuilder("party")
        .addSelect("party.identityNumberHash")
        .where("party.id = :partyId", { partyId: dto.party_id })
        .andWhere("party.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("party.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("party.is_deleted = false")
        .setLock("pessimistic_read")
        .getOne();
      if (!party || party.partyType !== "person") throw new NotFoundException("Guest party not found");
      assertHomestayGuestIdentityVerified(dto.verification_status, party);
      const repository = manager.getRepository(HomestayBookingGuestEntity);
      let entity = await repository.findOne({ where: {
        tenantId: scope.tenantId, parkId: scope.parkId, bookingId,
        partyId: dto.party_id, isDeleted: false
      } });
      if (!entity) {
        const activeGuestCount = await repository.count({ where: {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          bookingId,
          isDeleted: false
        } });
        if (activeGuestCount >= booking.guestCount) {
          throw new ConflictException("Active guests cannot exceed booking guest count");
        }
        entity = repository.create({ tenantId: scope.tenantId,
          parkId: scope.parkId, bookingId, partyId: dto.party_id, createBy: actor.sub });
      }
      const existingPrimary = await repository.findOne({ where: { tenantId: scope.tenantId,
        parkId: scope.parkId, bookingId, isPrimary: true, isDeleted: false } });
      entity.isPrimary = entity.isPrimary || (dto.is_primary && !existingPrimary);
      entity.verificationStatus = dto.verification_status;
      entity.verifiedBy = dto.verification_status === "verified" ? actor.sub : null;
      entity.verifiedAt = dto.verification_status === "verified" ? new Date() : null;
      entity.updateBy = actor.sub;
      return repository.save(entity);
    });
  }

  async issueCredential(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    bookingId: string,
    dto: IssueHomestayCredentialDto
  ) {
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.transactionSupport.lockBooking(manager, scope, bookingId);
      this.transactionSupport.assertStatus(booking, ["confirmed", "checked_in"],
        "Credentials require a confirmed or checked-in booking");
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      const repository = manager.getRepository(HomestayStayCredentialEntity);
      const saved = await repository.save(repository.create({ tenantId: scope.tenantId,
        parkId: scope.parkId, bookingId, credentialType: dto.credential_type,
        credentialLabel: dto.credential_label.trim(),
        credentialReference: dto.credential_reference?.trim() ?? null,
        lockDeviceId: dto.lock_device_id?.trim() ?? null,
        temporaryCodeTaskStatus: dto.lock_device_id ? "reserved_not_connected" : "not_applicable",
        status: "issued", issuedAt: new Date(), returnedAt: null,
        createBy: actor.sub, updateBy: actor.sub }));
      return projectHomestayCredential(saved);
    });
  }

  async returnCredential(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    bookingId: string,
    credentialId: string
  ) {
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.transactionSupport.lockBooking(manager, scope, bookingId);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      const repository = manager.getRepository(HomestayStayCredentialEntity);
      const credential = await repository.findOne({ where: { id: credentialId, bookingId,
        tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      lock: { mode: "pessimistic_write" } });
      if (!credential) throw new NotFoundException("Stay credential not found");
      if (credential.status === "returned") return projectHomestayCredential(credential);
      if (credential.status !== "issued") {
        throw new ConflictException("Only issued credentials can be returned");
      }
      credential.status = "returned";
      credential.returnedAt = new Date();
      credential.updateBy = actor.sub;
      return projectHomestayCredential(await repository.save(credential));
    });
  }

  async markCredentialLost(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    bookingId: string,
    credentialId: string,
    reason: string
  ) {
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.transactionSupport.lockBooking(manager, scope, bookingId);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      const repository = manager.getRepository(HomestayStayCredentialEntity);
      const credential = await repository.findOne({ where: { id: credentialId, bookingId,
        tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      lock: { mode: "pessimistic_write" } });
      if (!credential) throw new NotFoundException("Stay credential not found");
      if (credential.status === "lost") return projectHomestayCredential(credential);
      if (credential.status !== "issued") {
        throw new ConflictException("Only issued credentials can be marked as lost");
      }
      if (!reason.trim()) throw new ConflictException("Credential loss reason is required");
      credential.status = "lost";
      credential.updateBy = actor.sub;
      return projectHomestayCredential(await repository.save(credential));
    });
  }

  async checkIn(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.transactionSupport.lockBooking(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      if (booking.status === "checked_in") return booking;
      this.transactionSupport.assertStatus(booking, ["confirmed"], "Only confirmed bookings can check in");
      await this.transactionSupport.assertUnitBookable(manager, scope, booking.unitId);
      await this.transactionSupport.assertActiveBookingOccupancy(manager, scope, booking);
      const now = new Date();
      assertHomestayCheckInWindow(now,
        this.transactionSupport.businessDateStart(booking.arrivalDate),
        this.transactionSupport.businessDateStart(booking.departureDate));
      const guestRows = await manager.query(
        `SELECT guest.party_id::text AS "partyId" FROM rel_homestay_booking_guest guest
          JOIN biz_party party ON party.tenant_id=guest.tenant_id AND party.park_id=guest.park_id
            AND party.id=guest.party_id AND party.party_type='person' AND party.is_deleted=false
         WHERE guest.tenant_id=$1 AND guest.park_id=$2 AND guest.booking_id=$3
          AND guest.is_deleted=false ORDER BY guest.party_id FOR UPDATE OF guest,party`,
        [scope.tenantId, scope.parkId, id]
      ) as Array<{ partyId: string }>;
      assertHomestayGuestRosterComplete(booking.guestCount, guestRows.length);
      if (!this.identityVerifier) throw new ConflictException("Property identity runtime is unavailable");
      const identityEvidence = await (this.identityVerifier as IdentityVerificationPort).verifyForCheckIn({
        manager: { transactionContext: manager }, scope, bookingId: booking.id,
        partyIds: guestRows.map((row) => row.partyId), expectedConsent: "granted"
      });
      assertHomestayGuestRosterComplete(booking.guestCount, identityEvidence.length);
      const pendingTurnovers = await manager.getRepository(HomestayTurnoverTaskEntity)
        .createQueryBuilder("task")
        .where("task.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("task.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("task.unit_id = :unitId", { unitId: booking.unitId })
        .andWhere("task.status <> 'completed'").andWhere("task.is_deleted = false").getCount();
      if (pendingTurnovers > 0) throw new ConflictException("Unit turnover must be completed before check-in");
      const issuedCredentials = await manager.getRepository(HomestayStayCredentialEntity).count({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, bookingId: id,
          status: "issued", isDeleted: false }
      });
      if (issuedCredentials < 1) {
        throw new ConflictException("At least one issued key, card, or voucher is required");
      }
      const before = booking.status;
      booking.status = "checked_in";
      booking.actualCheckInTime = now;
      booking.updateBy = actor.sub;
      const saved = await manager.getRepository(HomestayBookingEntity).save(booking);
      await this.transactionSupport.log(manager, scope, actor, saved, "check_in", before,
        saved.status, "办理入住", { identity_evidence: identityEvidence });
      return saved;
    });
  }

  async checkOut(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.transactionSupport.lockBooking(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      if (booking.status === "checked_out") return booking;
      this.transactionSupport.assertStatus(booking, ["checked_in"], "Only checked-in bookings can check out");
      const issuedCredentials = await manager.getRepository(HomestayStayCredentialEntity).count({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, bookingId: id,
          status: "issued", isDeleted: false }
      });
      if (issuedCredentials > 0) {
        throw new ConflictException("All issued credentials must be returned before checkout");
      }
      const now = new Date();
      if (booking.occupancyId) await this.propertyOccupanciesService.releaseInTransaction(
        manager, scope, actor, booking.occupancyId, "guest_checked_out", "completed");
      const future = await manager.getRepository(PropertyOccupancyEntity).createQueryBuilder("occupancy")
        .where("occupancy.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("occupancy.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("occupancy.unit_id = :unitId", { unitId: booking.unitId })
        .andWhere("occupancy.is_deleted = false")
        .andWhere("(occupancy.status = 'active' OR (occupancy.status = 'held' AND (occupancy.hold_expires_at IS NULL OR occupancy.hold_expires_at > :now)))")
        .andWhere("occupancy.end_at > :now", { now: now.toISOString() })
        .orderBy("occupancy.start_at", "ASC").getOne();
      const lockEnd = turnoverLockEnd(now, future?.startAt ?? null);
      const turnoverRepository = manager.getRepository(HomestayTurnoverTaskEntity);
      const task = await turnoverRepository.save(turnoverRepository.create({
        tenantId: scope.tenantId, parkId: scope.parkId, bookingId: booking.id,
        unitId: booking.unitId, occupancyId: null, status: "pending",
        photoFileIds: [], consumables: [], createBy: actor.sub, updateBy: actor.sub
      }));
      if (lockEnd) {
        const turnoverOccupancy = await this.propertyOccupanciesService.createInTransaction(
          manager, scope, actor, { unit_id: booking.unitId, source_domain: "operations",
            source_type: "homestay_turnover", source_id: task.id,
            start_at: now.toISOString(), end_at: lockEnd.toISOString(), status: "active",
            remark: `Turnover after ${booking.bookingCode}` }, undefined,
          { sourceType: "homestay_turnover", sourceId: task.id });
        task.occupancyId = turnoverOccupancy.id;
      }
      await turnoverRepository.save(task);
      const before = booking.status;
      booking.status = "checked_out";
      booking.actualCheckOutTime = now;
      booking.updateBy = actor.sub;
      const saved = await manager.getRepository(HomestayBookingEntity).save(booking);
      await this.transactionSupport.log(manager, scope, actor, saved, "check_out", before,
        saved.status, "退房并生成保洁任务", { turnover_task_id: task.id });
      return { booking: saved, turnover: task };
    });
  }
}
