import { ConflictException, NotFoundException } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { EntityManager } from "typeorm";

/** Every participant writer locks its parent before the participant. The
 * participant trigger reads the parent FOR SHARE, so the reverse order can
 * deadlock with cancel/publish and with plan-facts revisions. */
export async function lockTrainingParticipantPlan(
 manager: EntityManager, scope: TenantParkScope, participantId: string,
): Promise<string> {
 if (!manager.queryRunner?.isTransactionActive) {
  throw new ConflictException("TRAINING_WRITE_TRANSACTION_REQUIRED");
 }
 const rows: { id: string }[] = await manager.query(
  `SELECT p.id FROM hr_training_plan p
   JOIN hr_training_participant tp ON tp.tenant_id=p.tenant_id
    AND tp.park_id=p.park_id AND tp.plan_id=p.id
   WHERE p.tenant_id=$1 AND p.park_id=$2 AND tp.id=$3
    AND p.is_deleted=false FOR UPDATE OF p`,
  [scope.tenantId, scope.parkId, participantId],
 );
 if (rows.length !== 1) throw new NotFoundException("Training participant not found");
 return rows[0]!.id;
}
