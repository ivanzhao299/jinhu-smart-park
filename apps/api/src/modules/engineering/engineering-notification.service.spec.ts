import assert from "node:assert/strict";
import test from "node:test";
import type { Repository } from "typeorm";
import { UserMessageEntity } from "../workflow/entities/user-message.entity";
import { EngineeringNotificationService } from "./engineering-notification.service";

const EVENT = {
  eventId: "event-001",
  eventType: "EngineeringRectificationOverdueEvent",
  tenantId: "tenant-a",
  parkId: "park-a",
  projectId: "00000000-0000-0000-0000-000000000101",
  entityId: "00000000-0000-0000-0000-000000000601",
  actorUserId: "00000000-0000-0000-0000-000000000801",
  payload: {
    rectificationCode: "GCZG20260626001",
    notificationRecipients: ["00000000-0000-0000-0000-000000000901", "00000000-0000-0000-0000-000000000901"],
    notificationTitle: "整改任务已逾期",
    notificationContent: "请立即处理逾期整改",
    notificationTargetUrl: "/engineering/rectifications/00000000-0000-0000-0000-000000000601",
    notificationPriority: "urgent"
  }
};

function makeService(): { service: EngineeringNotificationService; insertedValues: UserMessageEntity[] } {
  const insertedValues: UserMessageEntity[] = [];
  const queryBuilder = {
    insert: () => queryBuilder,
    into: () => queryBuilder,
    values: (values: UserMessageEntity[]) => {
      insertedValues.push(...values);
      return queryBuilder;
    },
    orIgnore: () => queryBuilder,
    execute: async () => ({ identifiers: [], generatedMaps: [], raw: [] })
  };
  const repository = {
    create: (input: Partial<UserMessageEntity>) => input as UserMessageEntity,
    createQueryBuilder: () => queryBuilder
  } as unknown as Repository<UserMessageEntity>;
  return { service: new EngineeringNotificationService(repository), insertedValues };
}

test("EngineeringNotificationService writes deduped engineering messages to workflow inbox", async () => {
  const { service, insertedValues } = makeService();

  const result = await service.publishFromEvent(EVENT);

  assert.equal(result.recipients, 1);
  assert.equal(insertedValues.length, 1);
  assert.equal(insertedValues[0]?.tenantId, EVENT.tenantId);
  assert.equal(insertedValues[0]?.parkId, EVENT.parkId);
  assert.equal(insertedValues[0]?.recipientId, "00000000-0000-0000-0000-000000000901");
  assert.equal(insertedValues[0]?.category, "engineering");
  assert.equal(insertedValues[0]?.priority, "urgent");
  assert.equal(insertedValues[0]?.bizType, "engineering_rectification");
  assert.equal(insertedValues[0]?.targetUrl, "/engineering/rectifications/00000000-0000-0000-0000-000000000601");
  assert.equal(insertedValues[0]?.uniqueKey, "engineering:event-001:00000000-0000-0000-0000-000000000901");
});

test("EngineeringNotificationService skips events without recipients", async () => {
  const { service, insertedValues } = makeService();

  const result = await service.publishFromEvent({ ...EVENT, payload: { rectificationCode: "GCZG20260626001" } });

  assert.equal(result.recipients, 0);
  assert.equal(insertedValues.length, 0);
});
