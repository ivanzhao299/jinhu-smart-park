import { ConfigService } from "@nestjs/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { DataSource, type EntityManager, type QueryRunner } from "typeorm";
import { BuildingEntity } from "../buildings/entities/building.entity";
import { FileEntity } from "../files/entities/file.entity";
import { FloorEntity } from "../floors/entities/floor.entity";
import { PropertyIdentityService } from "../property-identity/property-identity.service";
import { PropertyIdentityVerificationService } from
  "../property-identity/property-identity-verification.service";
import { PropertyOccupancyEntity } from
  "../property-operations/entities/property-occupancy.entity";
import { PropertyOperationConfigEntity } from
  "../property-operations/entities/property-operation-config.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import {
  HomestayBookingActionLogEntity,
  HomestayBookingEntity,
  HomestayStayCredentialEntity,
  HomestayTurnoverTaskEntity
} from "./entities/homestay.entities";
import { HomestayService } from "./homestay.service";
import { HomestayStayCommandService } from "./homestay-stay-command.service";
import { HomestayTransactionSupportService } from "./homestay-transaction-support.service";

const databaseUrl = process.env.PROPERTY_IDENTITY_PG_URL;
const entities = [
  BuildingEntity,
  FileEntity,
  FloorEntity,
  UnitEntity,
  PropertyOccupancyEntity,
  PropertyOperationConfigEntity,
  HomestayBookingEntity,
  HomestayStayCredentialEntity,
  HomestayTurnoverTaskEntity,
  HomestayBookingActionLogEntity
];

test("homestay check-in freezes verified identity evidence and file drift fails closed atomically", {
  skip: !databaseUrl,
  timeout: 30_000
}, async () => {
  const admin = new DataSource({ type: "postgres", url: databaseUrl, entities });
  const checkInSource = new DataSource({ type: "postgres", url: databaseUrl, entities });
  const driftSource = new DataSource({ type: "postgres", url: databaseUrl, entities });
  await Promise.all([admin.initialize(), checkInSource.initialize(), driftSource.initialize()]);
  const checkInRunner = checkInSource.createQueryRunner();
  const driftRunner = driftSource.createQueryRunner();
  await Promise.all([checkInRunner.connect(), driftRunner.connect()]);

  const ids = {
    tenant: randomUUID(), park: randomUUID(), actor: randomUUID(), verifier: randomUUID(),
    building: randomUUID(), floor: randomUUID(), unit: randomUUID(), occupancy: randomUUID(),
    booking: randomUUID(), guest: randomUUID(), credential: randomUUID(), party: randomUUID(),
    queue: randomUUID(), file: randomUUID()
  };
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const scope = { tenantId: ids.tenant, parkId: ids.park };
  const actor = {
    sub: ids.actor,
    username: "checkin-operator",
    realName: "PG Check-in Operator",
    tenantId: ids.tenant,
    parkId: ids.park,
    roles: [],
    permissions: ["*"],
    isSuper: true
  };
  const digest = "a".repeat(64);
  const driftDigest = "b".repeat(64);
  const policyHash = "c".repeat(64);
  const today = businessDate(new Date());
  const tomorrow = businessDate(new Date(Date.now() + 86_400_000));
  let submissionId = "";
  let primaryError: unknown = null;

  try {
    await admin.transaction(async (manager) => {
      await manager.query("SET CONSTRAINTS ALL DEFERRED");
      await manager.query(
        `INSERT INTO biz_building(id,tenant_id,park_id,building_code,building_name)
         VALUES($1,$2,$3,$4,'Identity PG building')`,
        [ids.building, ids.tenant, ids.park, `B-ID-${suffix}`]
      );
      await manager.query(
        `INSERT INTO biz_floor(id,tenant_id,park_id,building_id,floor_code,floor_no,floor_name)
         VALUES($1,$2,$3,$4,$5,1,'Identity PG floor')`,
        [ids.floor, ids.tenant, ids.park, ids.building, `F-ID-${suffix}`]
      );
      await manager.query(
        `INSERT INTO biz_unit(id,tenant_id,park_id,unit_code,building_id,floor_id,unit_name,
           usage_type,unit_area,use_area,rental_status,fitting_status,status)
         VALUES($1,$2,$3,$4,$5,$6,'Identity PG unit',1,40,40,1,1,1)`,
        [ids.unit, ids.tenant, ids.park, `U-ID-${suffix}`, ids.building, ids.floor]
      );
      await manager.query(
        `INSERT INTO biz_property_operation_config(
           id,tenant_id,park_id,unit_id,operating_mode,operating_status)
         VALUES(uuid_generate_v4(),$1,$2,$3,'short_stay','enabled')`,
        [ids.tenant, ids.park, ids.unit]
      );
      await manager.query(
        `INSERT INTO biz_party(id,tenant_id,park_id,party_type,display_name,
           source_domain,consent_status)
         VALUES($1,$2,$3,'person','Verified guest','homestay','granted')`,
        [ids.party, ids.tenant, ids.park]
      );
      await manager.query(
        `INSERT INTO biz_party_identity_verification_queue(
           id,tenant_id,park_id,queue_code,display_name,status,
           eligibility_policy_version,eligibility_policy_snapshot,eligibility_policy_hash)
         VALUES($1,$2,$3,$4,'Identity PG queue','active',1,'{}'::jsonb,$5)`,
        [ids.queue, ids.tenant, ids.park, `identity-pg-${suffix}`, policyHash]
      );
      const draft = await manager.query(
        `SELECT id::text,version FROM fn_party_identity_create_draft_cas(
           $1,$2,$3::uuid,$4::uuid,0,NULL,NULL,NULL)`,
        [ids.tenant, ids.park, ids.party, ids.actor]
      ) as Array<{ id: string; version: number }>;
      submissionId = draft[0]!.id;
      await manager.query(
        `INSERT INTO sys_file(id,tenant_id,park_id,file_code,original_name,stored_name,
           file_url,file_size,mime_type,md5,content_sha256,biz_type,biz_id,storage_path,status)
         VALUES($1,$2,$3,$4,'identity.jpg','identity.jpg','/identity.jpg',128,
           'image/jpeg',$5,$6,'party_identity_evidence',$7,'identity/identity.jpg',1)`,
        [ids.file, ids.tenant, ids.park, `ID-${suffix}`, "d".repeat(32), digest, submissionId]
      );
      const updated = await manager.query(
        `SELECT version FROM fn_party_identity_update_draft_cas(
           $1,$2,$3::uuid,$4::uuid,$5,'id_card','encrypted-payload',$6,
           '11************02','hmac-sha256',1,'test-key',1,$7::uuid[])`,
        [ids.tenant, ids.park, submissionId, ids.actor, draft[0]!.version,
          `identity-${suffix}`, [ids.file]]
      ) as Array<{ version: number }>;
      const submitted = await manager.query(
        `SELECT version FROM fn_party_identity_submit_cas(
           $1,$2,$3::uuid,$4::uuid,$5,$6::uuid,'{}'::jsonb,$7)`,
        [ids.tenant, ids.park, submissionId, ids.actor, updated[0]!.version,
          ids.queue, policyHash]
      ) as Array<{ version: number }>;
      const claimed = await manager.query(
        `SELECT version,assignment_version AS "assignmentVersion"
           FROM fn_party_identity_assignment_cas(
             $1,$2,$3::uuid,$4::uuid,'claim',$4::uuid,NULL,$5,$6,0)`,
        [ids.tenant, ids.park, submissionId, ids.verifier, `claim-${suffix}`,
          submitted[0]!.version]
      ) as Array<{ version: number; assignmentVersion: number }>;
      await manager.query(
        `SELECT id FROM fn_party_identity_decision_cas(
           $1,$2,$3::uuid,$4::uuid,'verified',NULL,$5,$6)`,
        [ids.tenant, ids.park, submissionId, ids.verifier, claimed[0]!.version,
          claimed[0]!.assignmentVersion]
      );
      await manager.query(
        `INSERT INTO biz_property_occupancy(id,tenant_id,park_id,unit_id,source_domain,
           source_type,source_id,start_at,end_at,status)
         VALUES($1,$2,$3,$4,'homestay','homestay_booking',$5,
           $6::date::timestamp AT TIME ZONE 'Asia/Shanghai',
           $7::date::timestamp AT TIME ZONE 'Asia/Shanghai','active')`,
        [ids.occupancy, ids.tenant, ids.park, ids.unit, ids.booking, today, tomorrow]
      );
      await manager.query(
        `INSERT INTO biz_homestay_booking(id,tenant_id,park_id,booking_code,unit_id,
           occupancy_id,status,arrival_date,departure_date,guest_count)
         VALUES($1,$2,$3,$4,$5,$6,'confirmed',$7,$8,1)`,
        [ids.booking, ids.tenant, ids.park, `HS-ID-${suffix}`, ids.unit,
          ids.occupancy, today, tomorrow]
      );
      await manager.query(
        `INSERT INTO rel_homestay_booking_guest(
           id,tenant_id,park_id,booking_id,party_id,is_primary)
         VALUES($1,$2,$3,$4,$5,true)`,
        [ids.guest, ids.tenant, ids.park, ids.booking, ids.party]
      );
      await manager.query(
        `INSERT INTO biz_homestay_stay_credential(
           id,tenant_id,park_id,booking_id,credential_type,credential_label,status)
         VALUES($1,$2,$3,$4,'key','Identity PG key','issued')`,
        [ids.credential, ids.tenant, ids.park, ids.booking]
      );
    });

    const identity = new PropertyIdentityService(admin, {} as never);
    const verifier = new PropertyIdentityVerificationService(identity);
    const transactionDataSource = transactionFacade(checkInRunner);
    const support = new HomestayTransactionSupportService();
    const access = { assertAccess: async () => undefined };
    const stayCommands = new HomestayStayCommandService(
      {} as never, access as never, transactionDataSource as never, support, verifier
    );
    const service = new HomestayService(
      {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      {} as never,
      access as never,
      transactionDataSource as never,
      new ConfigService(),
      undefined,
      undefined,
      verifier,
      undefined,
      support,
      undefined,
      undefined,
      stayCommands
    );

    const success = await service.checkIn(scope, actor, ids.booking);
    assert.equal(success.status, "checked_in");
    const successRows = await admin.query(
      `SELECT booking.status,booking.actual_check_in_time,
         action.snapshot->'identity_evidence' AS evidence
       FROM biz_homestay_booking booking
       JOIN biz_homestay_booking_action_log action
         ON action.booking_id=booking.id AND action.action='check_in'
       WHERE booking.id=$1`, [ids.booking]
    ) as Array<{ status: string; actual_check_in_time: Date; evidence: Array<{
      submissionId: string; files: Array<{ fileId: string; fileVersion: number; contentSha256: string }>
    }> }>;
    assert.equal(successRows[0]?.status, "checked_in");
    assert.ok(successRows[0]?.actual_check_in_time);
    assert.equal(successRows[0]?.evidence[0]?.submissionId, submissionId);
    assert.deepEqual(successRows[0]?.evidence[0]?.files, [{
      fileId: ids.file,
      fileVersion: 1,
      contentSha256: digest
    }]);

    await admin.query(
      `UPDATE biz_homestay_booking
         SET status='confirmed',actual_check_in_time=NULL,version=version+1
       WHERE id=$1`, [ids.booking]
    );
    await admin.query(
      "DELETE FROM biz_homestay_booking_action_log WHERE booking_id=$1",
      [ids.booking]
    );

    await driftRunner.startTransaction();
    await driftRunner.query(
      `UPDATE sys_file SET content_sha256=$1,version=version+1 WHERE id=$2`,
      [driftDigest, ids.file]
    );
    const checkInPid = Number((await checkInRunner.query(
      "SELECT pg_backend_pid()::int AS pid"
    ) as Array<{ pid: number }>)[0]!.pid);
    let settled = false;
    const competingCheckIn = service.checkIn(scope, actor, ids.booking)
      .finally(() => { settled = true; });
    const waited = await waitForDatabaseLock(admin, checkInPid, () => settled);
    assert.equal(waited, true, "check-in must wait on the competing frozen-file update");
    await driftRunner.commitTransaction();
    await assert.rejects(competingCheckIn, identitySnapshotStale);

    const residual = await admin.query(
      `SELECT booking.status,booking.actual_check_in_time,
         (SELECT count(*)::int FROM biz_homestay_booking_action_log action
           WHERE action.booking_id=booking.id) AS action_count,
         file.version AS file_version,file.content_sha256,
         frozen.file_version AS frozen_version,frozen.content_sha256 AS frozen_sha
       FROM biz_homestay_booking booking
       JOIN sys_file file ON file.id=$2
       JOIN rel_party_identity_snapshot_file frozen ON frozen.file_id=file.id
       WHERE booking.id=$1`, [ids.booking, ids.file]
    ) as Array<Record<string, unknown>>;
    assert.deepEqual(residual[0], {
      status: "confirmed",
      actual_check_in_time: null,
      action_count: 0,
      file_version: 2,
      content_sha256: driftDigest,
      frozen_version: 1,
      frozen_sha: digest
    });
  } catch (error) {
    primaryError = error;
  } finally {
    let cleanupError: unknown = null;
    try {
      if (driftRunner.isTransactionActive) await driftRunner.rollbackTransaction();
      await Promise.allSettled([checkInRunner.release(), driftRunner.release()]);
      if (admin.isInitialized) await cleanupIdentityFixture(admin, scope);
    } catch (error) {
      cleanupError = error;
    } finally {
      await Promise.allSettled([admin.destroy(), checkInSource.destroy(), driftSource.destroy()]);
    }
    if (primaryError && cleanupError) {
      throw new AggregateError([primaryError, cleanupError], "identity PostgreSQL test and fixture cleanup both failed");
    }
    if (primaryError) throw primaryError;
    if (cleanupError) throw cleanupError;
  }
});

async function cleanupIdentityFixture(
  dataSource: DataSource,
  scope: { tenantId: string; parkId: string }
): Promise<void> {
  const tables = [
    "biz_homestay_booking_action_log",
    "biz_homestay_stay_credential",
    "rel_homestay_booking_guest",
    "biz_homestay_booking",
    "biz_property_occupancy",
    "rel_party_identity_snapshot_file",
    "rel_party_identity_draft_file",
    "biz_party_identity_decision",
    "biz_party_identity_assignment_audit",
    "biz_party_identity_submission",
    "biz_party_identity_snapshot",
    "sys_file",
    "biz_party_identity_verification_queue",
    "biz_party",
    "biz_property_operation_config",
    "biz_unit",
    "biz_floor",
    "biz_building"
  ] as const;
  await dataSource.transaction(async (manager) => {
    await manager.query("SET CONSTRAINTS ALL DEFERRED");
    await manager.query("SELECT set_config('session_replication_role','replica',true)");
    await manager.query(
      `UPDATE biz_party
          SET current_identity_submission_id=NULL,
              current_verified_submission_id=NULL
        WHERE tenant_id=$1 AND park_id=$2`,
      [scope.tenantId, scope.parkId]
    );
    for (const table of tables) {
      await manager.query(
        `DELETE FROM ${table} WHERE tenant_id=$1 AND park_id=$2`,
        [scope.tenantId, scope.parkId]
      );
    }
  });
  const residual = await dataSource.query(
    `SELECT coalesce(sum(residual),0)::int AS residual
       FROM (${tables.map((table) => `SELECT count(*) AS residual FROM ${table} WHERE tenant_id=$1 AND park_id=$2`).join(" UNION ALL ")}) fixture`,
    [scope.tenantId, scope.parkId]
  ) as Array<{ residual: number }>;
  assert.equal(residual[0]?.residual, 0, "identity PostgreSQL fixture cleanup must reach zero");
}

function transactionFacade(runner: QueryRunner) {
  return {
    transaction: async <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> => {
      await runner.startTransaction();
      try {
        const result = await work(runner.manager);
        await runner.commitTransaction();
        return result;
      } catch (error) {
        await runner.rollbackTransaction();
        throw error;
      }
    }
  };
}

async function waitForDatabaseLock(
  dataSource: DataSource,
  pid: number,
  settled: () => boolean
): Promise<boolean> {
  for (let attempt = 0; attempt < 100 && !settled(); attempt += 1) {
    const rows = await dataSource.query(
      `SELECT wait_event_type AS "waitEventType"
       FROM pg_stat_activity WHERE pid=$1`, [pid]
    ) as Array<{ waitEventType: string | null }>;
    if (rows[0]?.waitEventType === "Lock") return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

function identitySnapshotStale(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("getResponse" in error)) return false;
  const response = (error as { getResponse(): unknown }).getResponse();
  return Boolean(response && typeof response === "object"
    && (response as { errorCode?: unknown }).errorCode === "identity-snapshot-stale");
}

function businessDate(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);
}
