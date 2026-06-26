import assert from "node:assert/strict";
import test from "node:test";
import type { Repository } from "typeorm";
import { EngineeringProjectStatus } from "./domain/engineering-project.enums";
import { EngineeringProjectAction } from "./domain/engineering-project-state-machine.types";
import { EngineeringEventLogEntity } from "./entities/engineering-event-log.entity";
import { EngineeringEventPublisher } from "./events/engineering-event.publisher";
import { ENGINEERING_EVENT_TYPES } from "./events/engineering-event.types";

const TENANT_ID = "tenant-a";
const PARK_ID = "park-a";
const PROJECT_ID = "00000000-0000-0000-0000-000000000101";
const PLAN_ID = "00000000-0000-0000-0000-000000000201";
const DAILY_REPORT_ID = "00000000-0000-0000-0000-000000000301";
const INSPECTION_ID = "00000000-0000-0000-0000-000000000401";
const ISSUE_ID = "00000000-0000-0000-0000-000000000501";
const RECTIFICATION_ID = "00000000-0000-0000-0000-000000000601";
const ACCEPTANCE_ID = "00000000-0000-0000-0000-000000000701";
const ACTOR_ID = "00000000-0000-0000-0000-000000000801";

interface Harness {
  publisher: EngineeringEventPublisher;
  savedLogs: EngineeringEventLogEntity[];
}

function makeHarness(): Harness {
  const savedLogs: EngineeringEventLogEntity[] = [];
  const repository = {
    create: (input: Partial<EngineeringEventLogEntity>) => input as EngineeringEventLogEntity,
    save: async (entity: EngineeringEventLogEntity) => {
      savedLogs.push(entity);
      return entity;
    }
  } as unknown as Repository<EngineeringEventLogEntity>;
  return { publisher: new EngineeringEventPublisher(repository), savedLogs };
}

test("EngineeringEventPublisher persists project status events to event log", async () => {
  const { publisher, savedLogs } = makeHarness();

  const event = await publisher.publishProjectStatusChanged({
    tenantId: TENANT_ID,
    parkId: PARK_ID,
    projectId: PROJECT_ID,
    fromStatus: EngineeringProjectStatus.DRAFT,
    toStatus: EngineeringProjectStatus.SUBMITTED,
    action: EngineeringProjectAction.SUBMIT,
    actorUserId: ACTOR_ID,
    reason: "提交立项",
    comment: "进入审批",
    workflowInstanceId: null,
    requestId: "req-event-001"
  });

  assert.equal(savedLogs.length, 1);
  assert.equal(savedLogs[0]?.eventId, event.eventId);
  assert.equal(savedLogs[0]?.eventType, "EngineeringProjectStatusChangedEvent");
  assert.equal(savedLogs[0]?.tenantId, TENANT_ID);
  assert.equal(savedLogs[0]?.parkId, PARK_ID);
  assert.equal(savedLogs[0]?.projectId, PROJECT_ID);
  assert.equal(savedLogs[0]?.entityId, PROJECT_ID);
  assert.equal(savedLogs[0]?.actorUserId, ACTOR_ID);
  assert.ok(savedLogs[0]?.occurredAt instanceof Date);
  assert.deepEqual(savedLogs[0]?.payload, {
    fromStatus: EngineeringProjectStatus.DRAFT,
    toStatus: EngineeringProjectStatus.SUBMITTED,
    action: EngineeringProjectAction.SUBMIT,
    reason: "提交立项",
    comment: "进入审批",
    workflowInstanceId: null,
    requestId: "req-event-001"
  });
});

test("EngineeringEventPublisher persists all Phase 1 runtime event categories", async () => {
  const { publisher, savedLogs } = makeHarness();

  await publisher.publishPlanEvent({
    eventType: "EngineeringPlanCreatedEvent",
    tenantId: TENANT_ID,
    parkId: PARK_ID,
    projectId: PROJECT_ID,
    planId: PLAN_ID,
    actorUserId: ACTOR_ID,
    payload: { planCode: "GCJH20260626001" }
  });
  await publisher.publishDailyReportEvent({
    eventType: "EngineeringDailyReportSubmittedEvent",
    tenantId: TENANT_ID,
    parkId: PARK_ID,
    projectId: PROJECT_ID,
    dailyReportId: DAILY_REPORT_ID,
    actorUserId: ACTOR_ID,
    payload: { reportCode: "GCRB20260626001" }
  });
  await publisher.publishInspectionEvent({
    eventType: "EngineeringInspectionSubmittedEvent",
    tenantId: TENANT_ID,
    parkId: PARK_ID,
    projectId: PROJECT_ID,
    inspectionId: INSPECTION_ID,
    actorUserId: ACTOR_ID,
    payload: { inspectionCode: "GCXJ20260626001" }
  });
  await publisher.publishIssueEvent({
    eventType: "EngineeringIssueCreatedEvent",
    tenantId: TENANT_ID,
    parkId: PARK_ID,
    projectId: PROJECT_ID,
    issueId: ISSUE_ID,
    actorUserId: ACTOR_ID,
    payload: { issueTitle: "消防通道占用" }
  });
  await publisher.publishRectificationEvent({
    eventType: "EngineeringRectificationCreatedEvent",
    tenantId: TENANT_ID,
    parkId: PARK_ID,
    projectId: PROJECT_ID,
    rectificationId: RECTIFICATION_ID,
    issueId: ISSUE_ID,
    actorUserId: ACTOR_ID,
    payload: { rectificationTitle: "清理消防通道" }
  });
  await publisher.publishAcceptanceEvent({
    eventType: "EngineeringAcceptancePassedEvent",
    tenantId: TENANT_ID,
    parkId: PARK_ID,
    projectId: PROJECT_ID,
    acceptanceId: ACCEPTANCE_ID,
    actorUserId: ACTOR_ID,
    payload: { acceptanceName: "阶段验收" }
  });

  assert.deepEqual(
    savedLogs.map((log) => [log.eventType, log.entityId, log.parkId]),
    [
      ["EngineeringPlanCreatedEvent", PLAN_ID, PARK_ID],
      ["EngineeringDailyReportSubmittedEvent", DAILY_REPORT_ID, PARK_ID],
      ["EngineeringInspectionSubmittedEvent", INSPECTION_ID, PARK_ID],
      ["EngineeringIssueCreatedEvent", ISSUE_ID, PARK_ID],
      ["EngineeringRectificationCreatedEvent", RECTIFICATION_ID, PARK_ID],
      ["EngineeringAcceptancePassedEvent", ACCEPTANCE_ID, PARK_ID]
    ]
  );
  assert.equal(savedLogs[4]?.payload.rectificationTitle, "清理消防通道");
});

test("ENGINEERING_EVENT_TYPES contains required project lifecycle events", () => {
  for (const eventType of [
    "EngineeringProjectStatusChangedEvent",
    "EngineeringPlanCreatedEvent",
    "EngineeringDailyReportSubmittedEvent",
    "EngineeringIssueCreatedEvent",
    "EngineeringRectificationOverdueEvent",
    "EngineeringAcceptancePassedEvent",
    "EngineeringTransferReadyEvent"
  ]) {
    assert.ok(ENGINEERING_EVENT_TYPES.includes(eventType as (typeof ENGINEERING_EVENT_TYPES)[number]));
  }
});
