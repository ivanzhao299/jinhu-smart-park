import assert from "node:assert/strict";
import test from "node:test";
import type { Repository } from "typeorm";
import { EngineeringIssueSeverity, EngineeringRectificationStatus } from "./domain/engineering-project.enums";
import { EngineeringRectificationEntity } from "./entities/engineering-rectification.entity";
import { EngineeringRectificationRepository } from "./repositories/engineering-rectification.repository";

class FakeQueryBuilder {
  constructor(
    private readonly latestCode: string | null,
    private readonly entity: EngineeringRectificationEntity | null = null
  ) {}

  select(): this {
    return this;
  }

  where(): this {
    return this;
  }

  andWhere(): this {
    return this;
  }

  orderBy(): this {
    return this;
  }

  addOrderBy(): this {
    return this;
  }

  limit(): this {
    return this;
  }

  async getRawOne(): Promise<{ rectificationCode?: string } | undefined> {
    return this.latestCode ? { rectificationCode: this.latestCode } : undefined;
  }

  async getOne(): Promise<EngineeringRectificationEntity | null> {
    return this.entity;
  }

  async getRawMany(): Promise<Array<{ key: string; count: string }>> {
    return [];
  }

  async getMany(): Promise<EngineeringRectificationEntity[]> {
    return this.entity ? [this.entity] : [];
  }
}

function createFakeRepository(latestCode: string | null = null): {
  repository: Repository<EngineeringRectificationEntity>;
  saved: EngineeringRectificationEntity[];
} {
  const saved: EngineeringRectificationEntity[] = [];
  let selectedEntity: EngineeringRectificationEntity | null = null;
  const repository = {
    create: (input: Partial<EngineeringRectificationEntity>) =>
      ({
        id: "rectification-id",
        isDeleted: false,
        version: 1,
        createTime: new Date("2026-06-26T00:00:00.000Z"),
        updateTime: new Date("2026-06-26T00:00:00.000Z"),
        ...input,
        status: input.status ?? EngineeringRectificationStatus.PENDING
      }) as EngineeringRectificationEntity,
    save: async (entity: EngineeringRectificationEntity) => {
      const next = saved.findIndex((item) => item.id === entity.id);
      if (next >= 0) {
        saved[next] = entity;
      } else {
        saved.push(entity);
      }
      selectedEntity = entity;
      return entity;
    },
    exists: async ({ where }: { where: { tenantId: string; rectificationCode: string; isDeleted: boolean } }) =>
      saved.some(
        (entity) => entity.tenantId === where.tenantId && entity.rectificationCode === where.rectificationCode && entity.isDeleted === where.isDeleted
      ),
    createQueryBuilder: () => new FakeQueryBuilder(latestCode, selectedEntity)
  } as unknown as Repository<EngineeringRectificationEntity>;
  return { repository, saved };
}

test("EngineeringRectificationRepository creates rectification with generated code and PENDING status", async () => {
  const { repository } = createFakeRepository("GCZG20260626001");
  const rectifications = new EngineeringRectificationRepository(repository);
  const saved = await rectifications.createRectification(
    { tenantId: "tenant-a", parkId: "park-a" },
    "00000000-0000-0000-0000-000000000001",
    {
      projectId: "00000000-0000-0000-0000-000000000101",
      issueId: "00000000-0000-0000-0000-000000000201",
      inspectionId: "00000000-0000-0000-0000-000000000301",
      rectificationTitle: "消防管线固定整改",
      description: "A5 三层消防管线支架松动，需重新固定。",
      severity: EngineeringIssueSeverity.HIGH,
      deadline: "2026-06-30"
    }
  );

  assert.equal(saved.rectificationCode, "GCZG20260626002");
  assert.equal(saved.status, EngineeringRectificationStatus.PENDING);
  assert.equal(saved.issueId, "00000000-0000-0000-0000-000000000201");
  assert.equal(saved.deadline, "2026-06-30");
  assert.equal(saved.createBy, "00000000-0000-0000-0000-000000000001");
});

test("EngineeringRectificationRepository can detect rectification code uniqueness inside a tenant", async () => {
  const { repository } = createFakeRepository();
  const rectifications = new EngineeringRectificationRepository(repository);
  await rectifications.createRectification(
    { tenantId: "tenant-a", parkId: "park-a" },
    null,
    {
      projectId: "00000000-0000-0000-0000-000000000101",
      rectificationCode: "GCZG20260626001",
      rectificationTitle: "材料堆放整改",
      description: "施工材料占用通道。",
      severity: EngineeringIssueSeverity.MEDIUM
    }
  );

  assert.equal(await rectifications.existsByCode({ tenantId: "tenant-a" }, "GCZG20260626001"), true);
  assert.equal(await rectifications.existsByCode({ tenantId: "tenant-b" }, "GCZG20260626001"), false);
});

test("EngineeringRectificationRepository updateStatus persists controlled status fields", async () => {
  const { repository } = createFakeRepository();
  const rectifications = new EngineeringRectificationRepository(repository);
  const saved = await rectifications.createRectification(
    { tenantId: "tenant-a", parkId: "park-a" },
    null,
    {
      projectId: "00000000-0000-0000-0000-000000000101",
      rectificationTitle: "临边防护整改",
      description: "临边防护栏杆缺失。",
      severity: EngineeringIssueSeverity.CRITICAL
    }
  );

  const submitted = await rectifications.updateStatus(
    { tenantId: "tenant-a", parkId: "park-a" },
    "00000000-0000-0000-0000-000000000001",
    saved.id,
    {
      status: EngineeringRectificationStatus.SUBMITTED,
      submittedAt: new Date("2026-06-26T02:00:00.000Z"),
      submittedBy: "00000000-0000-0000-0000-000000000001",
      feedback: "已完成临边防护恢复。"
    }
  );

  assert.equal(submitted.status, EngineeringRectificationStatus.SUBMITTED);
  assert.equal(submitted.submittedBy, "00000000-0000-0000-0000-000000000001");
  assert.equal(submitted.feedback, "已完成临边防护恢复。");
});
