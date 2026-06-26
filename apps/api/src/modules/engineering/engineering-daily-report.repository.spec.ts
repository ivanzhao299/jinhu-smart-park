import assert from "node:assert/strict";
import test from "node:test";
import type { Repository } from "typeorm";
import { EngineeringDailyReportStatus, EngineeringWeatherType } from "./domain/engineering-project.enums";
import { EngineeringDailyReportEntity } from "./entities/engineering-daily-report.entity";
import { EngineeringDailyReportRepository } from "./repositories/engineering-daily-report.repository";

class FakeQueryBuilder {
  constructor(
    private readonly latestReportCode: string | null,
    private readonly entity: EngineeringDailyReportEntity | null = null
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

  limit(): this {
    return this;
  }

  async getRawOne(): Promise<{ reportCode: string } | undefined> {
    return this.latestReportCode ? { reportCode: this.latestReportCode } : undefined;
  }

  async getOne(): Promise<EngineeringDailyReportEntity | null> {
    return this.entity;
  }
}

function createFakeRepository(latestReportCode: string | null = null): {
  repository: Repository<EngineeringDailyReportEntity>;
  saved: EngineeringDailyReportEntity[];
} {
  const saved: EngineeringDailyReportEntity[] = [];
  let selectedEntity: EngineeringDailyReportEntity | null = null;
  const repository = {
    create: (input: Partial<EngineeringDailyReportEntity>) =>
      ({
        id: "daily-report-id",
        isDeleted: false,
        version: 1,
        createTime: new Date("2026-06-26T00:00:00.000Z"),
        updateTime: new Date("2026-06-26T00:00:00.000Z"),
        ...input,
        reportStatus: input.reportStatus ?? EngineeringDailyReportStatus.DRAFT
      }) as EngineeringDailyReportEntity,
    save: async (entity: EngineeringDailyReportEntity) => {
      saved.push(entity);
      selectedEntity = entity;
      return entity;
    },
    exists: async ({ where }: { where: { tenantId: string; reportCode: string; isDeleted: boolean } }) =>
      saved.some((entity) => entity.tenantId === where.tenantId && entity.reportCode === where.reportCode && entity.isDeleted === where.isDeleted),
    createQueryBuilder: () => new FakeQueryBuilder(latestReportCode, selectedEntity)
  } as unknown as Repository<EngineeringDailyReportEntity>;
  return { repository, saved };
}

test("EngineeringDailyReportRepository creates report with generated code and DRAFT status", async () => {
  const { repository } = createFakeRepository("GCRB20260626001");
  const reports = new EngineeringDailyReportRepository(repository);
  const saved = await reports.createDailyReport(
    { tenantId: "tenant-a", parkId: "park-a" },
    "00000000-0000-0000-0000-000000000001",
    {
      projectId: "00000000-0000-0000-0000-000000000101",
      reportDate: "2026-06-26",
      weather: EngineeringWeatherType.SUNNY,
      workContent: "完成消防管线开槽",
      workerCount: 8,
      managerCount: 2,
      progressPercent: 30
    }
  );

  assert.equal(saved.tenantId, "tenant-a");
  assert.equal(saved.parkId, "park-a");
  assert.equal(saved.reportCode, "GCRB20260626002");
  assert.equal(saved.reportStatus, EngineeringDailyReportStatus.DRAFT);
  assert.equal(saved.progressPercent, 30);
  assert.equal(saved.createBy, "00000000-0000-0000-0000-000000000001");
});

test("EngineeringDailyReportRepository can detect report code uniqueness inside a tenant", async () => {
  const { repository } = createFakeRepository();
  const reports = new EngineeringDailyReportRepository(repository);
  await reports.createDailyReport(
    { tenantId: "tenant-a", parkId: "park-a" },
    null,
    {
      projectId: "00000000-0000-0000-0000-000000000101",
      reportCode: "GCRB20260626001",
      reportDate: "2026-06-26",
      weather: EngineeringWeatherType.CLOUDY,
      workContent: "完成弱电桥架安装"
    }
  );

  assert.equal(await reports.existsByCode({ tenantId: "tenant-a" }, "GCRB20260626001"), true);
  assert.equal(await reports.existsByCode({ tenantId: "tenant-b" }, "GCRB20260626001"), false);
});

test("EngineeringDailyReportRepository updateStatus persists controlled status fields", async () => {
  const { repository } = createFakeRepository();
  const reports = new EngineeringDailyReportRepository(repository);
  const saved = await reports.createDailyReport(
    { tenantId: "tenant-a", parkId: "park-a" },
    null,
    {
      projectId: "00000000-0000-0000-0000-000000000101",
      reportDate: "2026-06-26",
      weather: EngineeringWeatherType.OVERCAST,
      workContent: "完成安全围挡检查"
    }
  );

  const submitted = await reports.updateStatus(
    { tenantId: "tenant-a", parkId: "park-a" },
    "00000000-0000-0000-0000-000000000001",
    saved.id,
    {
      reportStatus: EngineeringDailyReportStatus.SUBMITTED,
      submittedAt: new Date("2026-06-26T02:00:00.000Z"),
      submittedBy: "00000000-0000-0000-0000-000000000001"
    }
  );
  assert.equal(submitted.reportStatus, EngineeringDailyReportStatus.SUBMITTED);
  assert.equal(submitted.submittedBy, "00000000-0000-0000-0000-000000000001");
});
