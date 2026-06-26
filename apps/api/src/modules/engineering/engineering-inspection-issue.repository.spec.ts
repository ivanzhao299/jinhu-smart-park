import assert from "node:assert/strict";
import test from "node:test";
import type { Repository } from "typeorm";
import {
  EngineeringInspectionStatus,
  EngineeringInspectionType,
  EngineeringIssueSeverity,
  EngineeringIssueSourceType,
  EngineeringIssueStatus,
  EngineeringIssueType
} from "./domain/engineering-project.enums";
import { EngineeringInspectionEntity } from "./entities/engineering-inspection.entity";
import { EngineeringIssueEntity } from "./entities/engineering-issue.entity";
import { EngineeringInspectionRepository } from "./repositories/engineering-inspection.repository";
import { EngineeringIssueRepository } from "./repositories/engineering-issue.repository";

class FakeQueryBuilder<T> {
  constructor(
    private readonly latestCode: string | null,
    private readonly entity: T | null = null
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

  async getRawOne(): Promise<{ inspectionCode?: string; issueCode?: string } | undefined> {
    if (!this.latestCode) return undefined;
    return this.latestCode.startsWith("GCXJ") ? { inspectionCode: this.latestCode } : { issueCode: this.latestCode };
  }

  async getOne(): Promise<T | null> {
    return this.entity;
  }

  async getCount(): Promise<number> {
    return this.entity ? 1 : 0;
  }

  async getRawMany(): Promise<Array<{ key: string; count: string }>> {
    return [];
  }

  async getMany(): Promise<T[]> {
    return this.entity ? [this.entity] : [];
  }
}

function createInspectionRepository(latestCode: string | null = null): {
  repository: Repository<EngineeringInspectionEntity>;
  saved: EngineeringInspectionEntity[];
} {
  const saved: EngineeringInspectionEntity[] = [];
  let selectedEntity: EngineeringInspectionEntity | null = null;
  const repository = {
    create: (input: Partial<EngineeringInspectionEntity>) =>
      ({
        id: "inspection-id",
        isDeleted: false,
        version: 1,
        createTime: new Date("2026-06-26T00:00:00.000Z"),
        updateTime: new Date("2026-06-26T00:00:00.000Z"),
        ...input,
        inspectionStatus: input.inspectionStatus ?? EngineeringInspectionStatus.DRAFT
      }) as EngineeringInspectionEntity,
    save: async (entity: EngineeringInspectionEntity) => {
      saved.push(entity);
      selectedEntity = entity;
      return entity;
    },
    exists: async ({ where }: { where: { tenantId: string; inspectionCode: string; isDeleted: boolean } }) =>
      saved.some((entity) => entity.tenantId === where.tenantId && entity.inspectionCode === where.inspectionCode && entity.isDeleted === where.isDeleted),
    findOne: async ({ where }: { where: { tenantId: string; inspectionCode: string; isDeleted: boolean } }) =>
      saved.find((entity) => entity.tenantId === where.tenantId && entity.inspectionCode === where.inspectionCode && entity.isDeleted === where.isDeleted) ?? null,
    createQueryBuilder: () => new FakeQueryBuilder(latestCode, selectedEntity)
  } as unknown as Repository<EngineeringInspectionEntity>;
  return { repository, saved };
}

function createIssueRepository(latestCode: string | null = null): {
  repository: Repository<EngineeringIssueEntity>;
  saved: EngineeringIssueEntity[];
} {
  const saved: EngineeringIssueEntity[] = [];
  let selectedEntity: EngineeringIssueEntity | null = null;
  const repository = {
    create: (input: Partial<EngineeringIssueEntity>) =>
      ({
        id: "issue-id",
        isDeleted: false,
        version: 1,
        createTime: new Date("2026-06-26T00:00:00.000Z"),
        updateTime: new Date("2026-06-26T00:00:00.000Z"),
        ...input,
        issueStatus: input.issueStatus ?? EngineeringIssueStatus.OPEN
      }) as EngineeringIssueEntity,
    save: async (entity: EngineeringIssueEntity) => {
      saved.push(entity);
      selectedEntity = entity;
      return entity;
    },
    exists: async ({ where }: { where: { tenantId: string; issueCode: string; isDeleted: boolean } }) =>
      saved.some((entity) => entity.tenantId === where.tenantId && entity.issueCode === where.issueCode && entity.isDeleted === where.isDeleted),
    findOne: async ({ where }: { where: { tenantId: string; issueCode: string; isDeleted: boolean } }) =>
      saved.find((entity) => entity.tenantId === where.tenantId && entity.issueCode === where.issueCode && entity.isDeleted === where.isDeleted) ?? null,
    createQueryBuilder: () => new FakeQueryBuilder(latestCode, selectedEntity)
  } as unknown as Repository<EngineeringIssueEntity>;
  return { repository, saved };
}

test("EngineeringInspectionRepository creates inspection with generated code and DRAFT status", async () => {
  const { repository } = createInspectionRepository("GCXJ20260626001");
  const inspections = new EngineeringInspectionRepository(repository);
  const saved = await inspections.createInspection(
    { tenantId: "tenant-a", parkId: "park-a" },
    "00000000-0000-0000-0000-000000000001",
    {
      projectId: "00000000-0000-0000-0000-000000000101",
      inspectionTitle: "A5 楼消防巡检",
      inspectionType: EngineeringInspectionType.SAFETY,
      inspectionDate: "2026-06-26",
      issueCount: 2,
      criticalIssueCount: 1
    }
  );

  assert.equal(saved.inspectionCode, "GCXJ20260626002");
  assert.equal(saved.inspectionStatus, EngineeringInspectionStatus.DRAFT);
  assert.equal(saved.issueCount, 2);
  assert.equal(saved.criticalIssueCount, 1);
  assert.equal(saved.createBy, "00000000-0000-0000-0000-000000000001");
});

test("EngineeringInspectionRepository can detect inspection code uniqueness inside a tenant", async () => {
  const { repository } = createInspectionRepository();
  const inspections = new EngineeringInspectionRepository(repository);
  await inspections.createInspection(
    { tenantId: "tenant-a", parkId: "park-a" },
    null,
    {
      projectId: "00000000-0000-0000-0000-000000000101",
      inspectionCode: "GCXJ20260626001",
      inspectionTitle: "弱电桥架巡检",
      inspectionType: EngineeringInspectionType.QUALITY,
      inspectionDate: "2026-06-26"
    }
  );

  assert.equal(await inspections.existsByCode({ tenantId: "tenant-a" }, "GCXJ20260626001"), true);
  assert.equal(await inspections.existsByCode({ tenantId: "tenant-b" }, "GCXJ20260626001"), false);
});

test("EngineeringIssueRepository creates issue with generated code and OPEN status", async () => {
  const { repository } = createIssueRepository("GCWT20260626001");
  const issues = new EngineeringIssueRepository(repository);
  const saved = await issues.createIssue(
    { tenantId: "tenant-a", parkId: "park-a" },
    "00000000-0000-0000-0000-000000000001",
    {
      projectId: "00000000-0000-0000-0000-000000000101",
      inspectionId: "00000000-0000-0000-0000-000000000201",
      issueTitle: "消防管线固定不牢",
      issueType: EngineeringIssueType.SAFETY,
      severity: EngineeringIssueSeverity.HIGH,
      description: "A5 三层消防管线支架松动",
      deadline: "2026-06-30"
    }
  );

  assert.equal(saved.issueCode, "GCWT20260626002");
  assert.equal(saved.issueStatus, EngineeringIssueStatus.OPEN);
  assert.equal(saved.sourceType, EngineeringIssueSourceType.INSPECTION);
  assert.equal(saved.sourceId, "00000000-0000-0000-0000-000000000201");
  assert.equal(saved.rectificationId, null);
});

test("EngineeringIssueRepository can detect issue code uniqueness and preserve rectification link", async () => {
  const { repository } = createIssueRepository();
  const issues = new EngineeringIssueRepository(repository);
  const saved = await issues.createIssue(
    { tenantId: "tenant-a", parkId: "park-a" },
    null,
    {
      projectId: "00000000-0000-0000-0000-000000000101",
      issueCode: "GCWT20260626001",
      issueTitle: "材料堆放不规范",
      issueType: EngineeringIssueType.CIVILIZED_CONSTRUCTION,
      severity: EngineeringIssueSeverity.MEDIUM,
      description: "施工材料占用通道",
      rectificationId: "00000000-0000-0000-0000-000000000301"
    }
  );

  assert.equal(await issues.existsByCode({ tenantId: "tenant-a" }, "GCWT20260626001"), true);
  assert.equal(await issues.existsByCode({ tenantId: "tenant-b" }, "GCWT20260626001"), false);
  assert.equal(saved.rectificationId, "00000000-0000-0000-0000-000000000301");
});
