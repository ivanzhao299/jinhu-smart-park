import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import { randomUUID } from "node:crypto";
import type { EntityManager } from "typeorm";
import { FileEntity } from "../files/entities/file.entity";
import { PartyEntity } from "../property-operations/entities/party.entity";
import { HousingLeaseEntity } from "./entities/housing.entities";
import { parseHousingCalendarDate } from "./housing-billing.policy";

export type HousingFileValidation = {
  mimePrefix?: string;
  allowedMimeTypes?: readonly string[];
  bizType?: string;
  allowedBizTypes?: readonly string[];
  bizId?: string;
  lock?: boolean;
};

export type HousingReceivableBusinessKey = {
  sourceType: string;
  sourceId: string;
  chargeType: string;
  periodStart: string;
  periodEnd: string;
};

@Injectable()
export class HousingTransactionSupportService {
  async lockLease(manager: EntityManager, scope: TenantParkScope, id: string) {
    const lease = await manager.getRepository(HousingLeaseEntity).findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      lock: { mode: "pessimistic_write" }
    });
    if (!lease) throw new NotFoundException("Housing lease not found");
    return lease;
  }

  async mustParty(manager: EntityManager, scope: TenantParkScope, id: string) {
    const party = await manager.getRepository(PartyEntity).findOne({
      where: {
        id,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        partyType: "person",
        isDeleted: false
      }
    });
    if (!party) throw new NotFoundException("Individual housing tenant party not found");
    return party;
  }

  async assertFiles(
    manager: EntityManager,
    scope: TenantParkScope,
    ids: string[],
    options?: HousingFileValidation
  ) {
    if (!ids.length) return [] as FileEntity[];
    const builder = manager.getRepository(FileEntity).createQueryBuilder("file")
      .where("file.tenant_id=:tenantId", { tenantId: scope.tenantId })
      .andWhere("file.park_id=:parkId", { parkId: scope.parkId })
      .andWhere("file.id IN (:...ids)", { ids })
      .andWhere("file.status=1")
      .andWhere("file.is_deleted=false");
    if (options?.lock !== false) builder.setLock("pessimistic_write");
    const files = await builder.getMany();
    this.assertFileCardinality(files, ids);
    this.assertFilePolicy(files, options);
    return files;
  }

  assertStatus(
    lease: Pick<HousingLeaseEntity, "status">,
    allowed: HousingLeaseEntity["status"][]
  ) {
    if (!allowed.includes(lease.status)) {
      throw new ConflictException(`Lease status ${lease.status} does not allow this action`);
    }
  }

  assertDatePeriod(start: string, end: string) {
    if (parseHousingCalendarDate(start) >= parseHousingCalendarDate(end)) {
      throw new BadRequestException("Start date must be before end date");
    }
  }

  addDays(dateValue: string, days: number) {
    const date = parseHousingCalendarDate(dateValue);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  businessDateStart(dateValue: string) {
    return new Date(`${dateValue.slice(0, 10)}T00:00:00+08:00`);
  }

  generateCode(prefix: string) {
    return `${prefix}${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}${randomUUID().slice(0, 6).toUpperCase()}`;
  }

  async lockBusinessKey(manager: EntityManager, key: string) {
    await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [key]);
  }

  receivableBusinessKey(
    scope: TenantParkScope,
    leaseId: string,
    input: HousingReceivableBusinessKey
  ) {
    return [
      "housing-receivable",
      scope.tenantId,
      scope.parkId,
      leaseId,
      input.sourceType,
      input.sourceId,
      input.chargeType,
      input.periodStart,
      input.periodEnd
    ].join("|");
  }

  isDatabaseConflict(error: unknown) {
    if (!error || typeof error !== "object") return false;
    return ["23505", "23P01"].includes(String((error as { code?: unknown }).code ?? ""));
  }

  isUniqueViolation(error: unknown) {
    return Boolean(
      error
      && typeof error === "object"
      && (error as { code?: unknown }).code === "23505"
    );
  }

  private assertFileCardinality(files: FileEntity[], ids: string[]) {
    if (files.length !== new Set(ids).size) {
      throw new NotFoundException("One or more attachment files were not found");
    }
  }

  private assertFilePolicy(files: FileEntity[], options?: HousingFileValidation) {
    if (options?.mimePrefix && files.some((file) => !file.mimeType.startsWith(options.mimePrefix!))) {
      throw new BadRequestException(`Attachment MIME type must start with ${options.mimePrefix}`);
    }
    if (options?.allowedMimeTypes && files.some((file) => !options.allowedMimeTypes!.includes(file.mimeType))) {
      throw new BadRequestException("Attachment MIME type is not allowed for this workflow");
    }
    if (options?.bizType && files.some((file) => file.bizType !== options.bizType)) {
      throw new BadRequestException(`Attachment business type must be ${options.bizType}`);
    }
    if (options?.allowedBizTypes && files.some((file) => !options.allowedBizTypes!.includes(file.bizType))) {
      throw new BadRequestException(`Attachment business type must be one of ${options.allowedBizTypes.join(", ")}`);
    }
    if (options?.bizId && files.some((file) => file.bizId !== options.bizId)) {
      throw new BadRequestException("Attachment is not associated with the current housing record");
    }
  }
}
