import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import { PartySensitiveDataService } from "../property-operations/party-sensitive-data.service";

export interface PartyDataKeyRotationResult {
  receiptId: string;
  activeKeyId: string;
  partyCount: number;
  snapshotCount: number;
  draftCount: number;
  replayed: boolean;
}

interface CipherRow {
  id: string;
  encrypted_payload: string;
  encryption_key_id: string;
}

@Injectable()
export class PartyDataKeyRotationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly sensitiveData: PartySensitiveDataService,
    private readonly auditService: AuditService
  ) {}

  rotate(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    requestKey: string
  ): Promise<PartyDataKeyRotationResult> {
    const normalizedRequestKey = requestKey.trim();
    if (!normalizedRequestKey || normalizedRequestKey.length > 128) {
      throw new BadRequestException("Rotation request key must contain 1 to 128 characters");
    }
    return this.dataSource.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `party-data-key-rotation:${scope.tenantId}:${scope.parkId}`
      ]);
      const activeKeyId = this.sensitiveData.activeKeyId();
      const existing = await this.receipt(manager, scope, normalizedRequestKey);
      if (existing) {
        if (existing.activeKeyId !== activeKeyId) {
          throw new ConflictException("Rotation request key is bound to a different active key");
        }
        return { ...existing, replayed: true };
      }
      const draftInventory = await manager.query(
        `SELECT submission.id::text,
                submission.draft_encryption_key_id,
                party.identity_number_encrypted AS encrypted_payload,
                party.identity_number_encryption_key_id AS encryption_key_id
         FROM public.biz_party_identity_submission submission
         JOIN public.biz_party party
           ON party.tenant_id=submission.tenant_id
          AND party.park_id=submission.park_id
          AND party.id=submission.party_id
         WHERE submission.tenant_id=$1 AND submission.park_id=$2
           AND submission.id=party.current_identity_submission_id
           AND submission.identity_version=party.identity_version
           AND submission.status='draft'
           AND submission.draft_encryption_key_id IS NOT NULL
         ORDER BY submission.id
         FOR UPDATE OF submission, party`,
        [scope.tenantId, scope.parkId]
      ) as Array<CipherRow & { draft_encryption_key_id: string }>;
      for (const row of draftInventory) {
        if (!row.encrypted_payload || row.encryption_key_id !== row.draft_encryption_key_id) {
          throw new Error("Party identity draft encryption metadata is inconsistent");
        }
        this.decryptRequired(row);
      }
      const partyInventory = await manager.query(
        `SELECT id::text, identity_number_encrypted AS encrypted_payload,
                identity_number_encryption_key_id AS encryption_key_id
         FROM public.biz_party
         WHERE tenant_id=$1 AND park_id=$2
           AND identity_number_encrypted IS NOT NULL
         ORDER BY id
         FOR UPDATE`,
        [scope.tenantId, scope.parkId]
      ) as CipherRow[];
      for (const row of partyInventory) this.decryptRequired(row);
      const parties = partyInventory.filter((row) => row.encryption_key_id !== activeKeyId);
      for (const row of parties) {
        const plaintext = this.decryptRequired(row);
        await manager.query(
          `UPDATE public.biz_party
           SET identity_number_encrypted=$4,
               identity_number_encryption_key_id=$3,
               update_by=$5,
               update_time=now(),
               version=version+1
           WHERE tenant_id=$1 AND park_id=$2 AND id=$6::uuid`,
          [scope.tenantId, scope.parkId, activeKeyId,
            this.sensitiveData.encrypt(plaintext), actor.sub, row.id]
        );
      }

      const snapshotInventory = await manager.query(
        `SELECT id::text, encrypted_payload, encryption_key_id
         FROM public.biz_party_identity_snapshot
         WHERE tenant_id=$1 AND park_id=$2
         ORDER BY id
         FOR UPDATE`,
        [scope.tenantId, scope.parkId]
      ) as CipherRow[];
      for (const row of snapshotInventory) this.decryptRequired(row);
      const snapshots = snapshotInventory.filter((row) => row.encryption_key_id !== activeKeyId);
      for (const row of snapshots) {
        const plaintext = this.decryptRequired(row);
        await manager.query(
          `UPDATE public.biz_party_identity_snapshot
           SET encrypted_payload=$4, encryption_key_id=$3
           WHERE tenant_id=$1 AND park_id=$2 AND id=$5::uuid`,
          [scope.tenantId, scope.parkId, activeKeyId,
            this.sensitiveData.encrypt(plaintext), row.id]
        );
      }

      const draftRows = await manager.query(
        `UPDATE public.biz_party_identity_submission
         AS submission
         SET draft_encryption_key_id=$3,
             update_by=$4,
             update_time=now(),
             version=submission.version+1
         FROM public.biz_party party
         WHERE submission.tenant_id=$1 AND submission.park_id=$2
           AND party.tenant_id=submission.tenant_id
           AND party.park_id=submission.park_id
           AND party.id=submission.party_id
           AND submission.id=party.current_identity_submission_id
           AND submission.identity_version=party.identity_version
           AND submission.status='draft'
           AND submission.draft_encryption_key_id IS NOT NULL
           AND submission.draft_encryption_key_id IS DISTINCT FROM $3
         RETURNING submission.id`,
        [scope.tenantId, scope.parkId, activeKeyId, actor.sub]
      ) as Array<{ id: string }>;
      const expectedDraftCount = draftInventory.filter(
        (row) => row.draft_encryption_key_id !== activeKeyId
      ).length;
      if (draftRows.length !== expectedDraftCount) {
        throw new Error("Party identity draft rotation count drifted");
      }

      const fromKeyIds = [...new Set([
        ...parties.map((row) => row.encryption_key_id),
        ...snapshots.map((row) => row.encryption_key_id),
        ...draftInventory
          .filter((row) => row.draft_encryption_key_id !== activeKeyId)
          .map((row) => row.draft_encryption_key_id)
      ])].sort();

      const receiptRows = await manager.query(
        `INSERT INTO public.biz_party_data_key_rotation_receipt(
           tenant_id, park_id, request_key, active_key_id,
           party_count, snapshot_count, draft_count, actor_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::uuid)
         RETURNING id::text`,
        [scope.tenantId, scope.parkId, normalizedRequestKey, activeKeyId,
          parties.length, snapshots.length, draftRows.length, actor.sub]
      ) as Array<{ id: string }>;
      const receiptId = receiptRows[0]?.id;
      if (!receiptId) throw new Error("Party data key rotation receipt was not created");

      await this.auditService.recordOperationRequired({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        userId: actor.sub,
        username: actor.username,
        realName: actor.realName ?? null,
        roleCodes: actor.roles,
        module: "property-identity",
        resource: "party-data-key-rotation",
        action: "party.data-key.rotate",
        bizType: "party_data_key_rotation",
        bizId: receiptId,
        afterJson: {
          fromKeyIds,
          activeKeyId,
          partyCount: parties.length,
          snapshotCount: snapshots.length,
          draftCount: draftRows.length
        },
        method: "INTERNAL",
        path: "party-data-key-rotation",
        success: true,
        requestId: normalizedRequestKey,
        idempotencyKey: normalizedRequestKey
      }, manager);

      return {
        receiptId,
        activeKeyId,
        partyCount: parties.length,
        snapshotCount: snapshots.length,
        draftCount: draftRows.length,
        replayed: false
      };
    });
  }

  private decryptRequired(row: CipherRow): string {
    if (!this.sensitiveData.hasKey(row.encryption_key_id)) {
      throw new Error(`Party data encryption key ${row.encryption_key_id} is not configured`);
    }
    const plaintext = this.sensitiveData.decrypt(row.encrypted_payload, row.encryption_key_id);
    if (plaintext === null) throw new Error("Party data ciphertext envelope is invalid");
    return plaintext;
  }

  private async receipt(
    manager: EntityManager,
    scope: TenantParkScope,
    requestKey: string
  ): Promise<Omit<PartyDataKeyRotationResult, "replayed"> | null> {
    const rows = await manager.query(
      `SELECT id::text, active_key_id, party_count, snapshot_count, draft_count
       FROM public.biz_party_data_key_rotation_receipt
       WHERE tenant_id=$1 AND park_id=$2 AND request_key=$3
       LIMIT 1`,
      [scope.tenantId, scope.parkId, requestKey]
    ) as Array<{
      id: string;
      active_key_id: string;
      party_count: number;
      snapshot_count: number;
      draft_count: number;
    }>;
    const row = rows[0];
    return row ? {
      receiptId: row.id,
      activeKeyId: row.active_key_id,
      partyCount: Number(row.party_count),
      snapshotCount: Number(row.snapshot_count),
      draftCount: Number(row.draft_count)
    } : null;
  }
}
