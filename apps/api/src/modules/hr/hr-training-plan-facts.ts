import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";

// One effective projection for ordinary reads, reminders and source comparison.
export const trainingPlanFactsJoin = `LEFT JOIN LATERAL (
 SELECT course_title,start_date,end_date,sequence_no FROM hr_training_plan_fact_revision f
 WHERE f.tenant_id=p.tenant_id AND f.park_id=p.park_id AND f.plan_id=p.id
 ORDER BY f.sequence_no DESC LIMIT 1
) pf ON true`;
export const trainingPlanCourseTitle = `COALESCE(pf.course_title,p.snapshot->>'courseTitle')`;
export const trainingPlanStartDate = `COALESCE(pf.start_date,p.start_date)`;
export const trainingPlanEndDate = `COALESCE(pf.end_date,p.end_date)`;
export const trainingPlanFactRevision = `COALESCE(pf.sequence_no,0)`;
export type TrainingPlanFactChanges = { courseName?: string; startDate?: string; endDate?: string };
export function isTrainingCalendarDate(value: unknown): value is string {
 if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
 const parsed = new Date(`${value}T00:00:00Z`);
 return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0,10) === value;
}
export async function reviseTrainingPlanFactsInTransaction(
 manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, planId: string,
 expectedRevision: number, changes: TrainingPlanFactChanges, reason: string,
) {
 if (!manager.queryRunner?.isTransactionActive) throw new ConflictException("TRAINING_WRITE_TRANSACTION_REQUIRED");
 const has = (permission: string) => actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission);
 if (actor.tenantId !== scope.tenantId || actor.parkId !== scope.parkId || !has(HR_PERMISSIONS.HR_TRAINING_PLAN_MANAGE)
  || (changes.courseName !== undefined && !has(HR_PERMISSIONS.HR_TRAINING_COURSE_MANAGE))) throw new ForbiddenException();
 if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0
  || typeof reason !== "string" || !reason.trim() || reason.trim().length > 1000 || /[\0\p{Surrogate}]/u.test(reason)
  || Object.keys(changes).some(k => !["courseName","startDate","endDate"].includes(k))
  || Object.values(changes).every(v => v === undefined)
  || (changes.courseName !== undefined && (typeof changes.courseName !== "string" || !changes.courseName.trim() || changes.courseName.trim().length > 160 || /[\0\p{Surrogate}]/u.test(changes.courseName)))
  || (changes.startDate !== undefined && !isTrainingCalendarDate(changes.startDate))
  || (changes.endDate !== undefined && !isTrainingCalendarDate(changes.endDate))) throw new BadRequestException("TRAINING_PLAN_FACTS_INVALID");
 const parents = await manager.query(`SELECT id,status FROM hr_training_plan WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND NOT is_deleted FOR UPDATE`,[scope.tenantId,scope.parkId,planId]);
 if (parents.length !== 1) throw new NotFoundException("Training plan not found");
 if (!["published","in_progress","completed"].includes(parents[0].status)) throw new ConflictException("TRAINING_PLAN_FACTS_STATE_INVALID");
 // A new statement after the parent lock observes revisions committed while waiting.
 const current = (await manager.query(`SELECT ${trainingPlanCourseTitle} title,
  to_char(${trainingPlanStartDate},'YYYY-MM-DD') start,to_char(${trainingPlanEndDate},'YYYY-MM-DD') finish,
  ${trainingPlanFactRevision} revision FROM hr_training_plan p ${trainingPlanFactsJoin}
  WHERE p.tenant_id=$1 AND p.park_id=$2 AND p.id=$3`,[scope.tenantId,scope.parkId,planId]))[0];
 if (Number(current.revision) !== expectedRevision) throw new ConflictException("TRAINING_PLAN_FACTS_STALE");
 const title = changes.courseName?.trim() ?? current.title;
 const start = changes.startDate ?? current.start, finish = changes.endDate ?? current.finish;
 if (finish < start) throw new BadRequestException("TRAINING_PLAN_FACTS_DATE_RANGE_INVALID");
 if (title === current.title && start === current.start && finish === current.finish) return {sequenceNo: expectedRevision, unchanged: true};
 const rows = typeormQueryRows<{id:string;sequenceNo:number}>(await manager.query(
  `INSERT INTO hr_training_plan_fact_revision(tenant_id,park_id,plan_id,sequence_no,course_title,start_date,end_date,reason,create_by)
   VALUES($1,$2,$3,$4,$5,$6::date,$7::date,$8,$9) RETURNING id,sequence_no "sequenceNo"`,
  [scope.tenantId,scope.parkId,planId,expectedRevision+1,title,start,finish,reason.trim(),actor.sub],
 ));
 if (rows.length !== 1) throw new ConflictException("TRAINING_PLAN_FACTS_WRITE_FAILED");
 return {...rows[0]!,unchanged:false};
}
