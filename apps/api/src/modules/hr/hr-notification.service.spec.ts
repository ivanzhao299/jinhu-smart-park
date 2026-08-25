import { strict as assert } from "node:assert";
import test from "node:test";
import type { TenantParkScope } from "@jinhu/shared";
import type { EntityManager, Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { UserMessageEntity } from "../workflow/entities/user-message.entity";
import { HrAttendanceRequestEntity,HrEmployeeEntity, HrWorkReportEntity } from "./entities/hr.entities";
import { HrNotificationService } from "./hr-notification.service";

const scope: TenantParkScope = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  parkId: "00000000-0000-0000-0000-000000000002"
};
const actor = { sub: "00000000-0000-0000-0000-000000000003" } as JwtPrincipal;

function report(status: string): HrWorkReportEntity {
  return {
    id: "00000000-0000-0000-0000-000000000010",
    employeeId: "00000000-0000-0000-0000-000000000011",
    reviewerEmployeeId: "00000000-0000-0000-0000-000000000012",
    reportType: "weekly",
    periodStart: "2026-08-17",
    periodEnd: "2026-08-23",
    status,
    reviewComment: status === "returned" ? "请补充风险应对计划" : null
  } as HrWorkReportEntity;
}

function harness(employee: Partial<HrEmployeeEntity>) {
  const inserted: Array<Record<string, unknown>> = [];
  const messageRepository = {
    create: (value: Record<string, unknown>) => value,
    createQueryBuilder: () => ({
      insert: () => ({
        into: () => ({
          values: (value: Record<string, unknown>) => ({
            orIgnore: () => ({ execute: async () => { inserted.push(value); } })
          })
        })
      })
    })
  } as unknown as Repository<UserMessageEntity>;
  const manager = {
    getRepository: (entity: unknown) => entity === HrEmployeeEntity
      ? { findOne: async () => employee }
      : messageRepository
  } as unknown as EntityManager;
  return { inserted, manager, service: new HrNotificationService(messageRepository) };
}

test("submitted report becomes an HR workflow inbox item for the reviewer", async () => {
  const { inserted, manager, service } = harness({ userId: "00000000-0000-0000-0000-000000000020" });
  await service.publishWorkReportSubmitted(scope, actor, report("submitted"), manager);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0]?.category, "hr");
  assert.equal(inserted[0]?.action, "review");
  assert.equal(inserted[0]?.targetUrl, "/hr/work-reports");
  assert.match(String(inserted[0]?.uniqueKey), /submitted/);
});

test("returned report becomes a high-priority supplement item for the employee", async () => {
  const { inserted, manager, service } = harness({ userId: "00000000-0000-0000-0000-000000000021" });
  await service.publishWorkReportReviewed(scope, actor, report("returned"), manager);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0]?.priority, "high");
  assert.equal(inserted[0]?.action, "supplement");
  assert.equal(inserted[0]?.content, "负责人已退回，请进入工作汇报查看意见并补充。");
});

test("notification is skipped when no linked system account exists", async () => {
  const { inserted, manager, service } = harness({ userId: null });
  await service.publishWorkReportSubmitted(scope, actor, report("submitted"), manager);
  assert.equal(inserted.length, 0);
});

test("confirmed report becomes a normal confirmation item for the employee", async () => {
  const { inserted, manager, service } = harness({ userId: "00000000-0000-0000-0000-000000000022" });
  await service.publishWorkReportReviewed(scope, actor, report("confirmed"), manager);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0]?.priority, "normal");
  assert.equal(inserted[0]?.action, "confirmed");
});

test("notification is skipped when the actor is also the recipient", async () => {
  const { inserted, manager, service } = harness({ userId: actor.sub });
  await service.publishWorkReportReviewed(scope, actor, report("returned"), manager);
  assert.equal(inserted.length, 0);
});

test("submitted attendance request becomes a body-free workflow review item",async()=>{
 const {inserted,service,manager:baseManager}=harness({});
 const fallback=(entity:unknown)=>(baseManager as unknown as {getRepository:(value:unknown)=>unknown}).getRepository(entity);const manager={getRepository:(entity:unknown)=>entity===HrEmployeeEntity?{findOne:async(input:{where:{id:string}})=>input.where.id==="employee-1"?{managerEmployeeId:"manager-1"}:{userId:"user-manager"}}:fallback(entity)} as unknown as EntityManager;
 const request={id:"request-1",employeeId:"employee-1",requestType:"leave",status:"submitted"} as HrAttendanceRequestEntity;
 await service.publishAttendanceRequestSubmitted(scope,actor,request,manager);
 assert.equal(inserted.length,1);assert.equal(inserted[0]?.sourceType,"hr_attendance_request");assert.equal(inserted[0]?.targetUrl,"/hr/attendance");assert.equal(inserted[0]?.action,"review");assert.deepEqual(inserted[0]?.payload,{requestType:"leave",status:"submitted"});assert.doesNotMatch(JSON.stringify(inserted[0]),/reason|medical/u);
});

test("returned attendance request notifies the employee without review body",async()=>{
 const {inserted,service,manager:baseManager}=harness({});const fallback=(entity:unknown)=>(baseManager as unknown as {getRepository:(value:unknown)=>unknown}).getRepository(entity);const manager={getRepository:(entity:unknown)=>entity===HrEmployeeEntity?{findOne:async()=>({userId:"user-employee"})}:fallback(entity)} as unknown as EntityManager;
 await service.publishAttendanceRequestReviewed(scope,actor,{id:"request-2",employeeId:"employee-2",requestType:"correction",status:"returned",reviewComment:"sensitive"} as HrAttendanceRequestEntity,manager);
 assert.equal(inserted.length,1);assert.equal(inserted[0]?.priority,"high");assert.equal(inserted[0]?.action,"supplement");assert.doesNotMatch(String(inserted[0]?.content),/sensitive/u);
});
