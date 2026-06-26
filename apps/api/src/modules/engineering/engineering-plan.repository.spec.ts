import assert from "node:assert/strict";
import test from "node:test";
import type { Repository } from "typeorm";
import { EngineeringPlanLevel, EngineeringPlanStatus, EngineeringPlanType, EngineeringRiskLevel } from "./domain/engineering-project.enums";
import { EngineeringPlanEntity } from "./entities/engineering-plan.entity";
import { EngineeringPlanRepository } from "./repositories/engineering-plan.repository";

class FakeQueryBuilder {
  constructor(private readonly latestPlanCode: string | null) {}

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

  async getRawOne(): Promise<{ planCode: string } | undefined> {
    return this.latestPlanCode ? { planCode: this.latestPlanCode } : undefined;
  }
}

function createFakeRepository(latestPlanCode: string | null = null): {
  repository: Repository<EngineeringPlanEntity>;
  saved: EngineeringPlanEntity[];
} {
  const saved: EngineeringPlanEntity[] = [];
  const repository = {
    create: (input: Partial<EngineeringPlanEntity>) =>
      ({
        id: "plan-id",
        isDeleted: false,
        version: 1,
        createTime: new Date("2026-06-26T00:00:00.000Z"),
        updateTime: new Date("2026-06-26T00:00:00.000Z"),
        ...input,
        status: input.status ?? EngineeringPlanStatus.DRAFT,
        planLevel: input.planLevel ?? EngineeringPlanLevel.L1,
        riskLevel: input.riskLevel ?? EngineeringRiskLevel.LOW
      }) as EngineeringPlanEntity,
    save: async (entity: EngineeringPlanEntity) => {
      saved.push(entity);
      return entity;
    },
    exists: async ({ where }: { where: { tenantId: string; planCode: string; isDeleted: boolean } }) =>
      saved.some((entity) => entity.tenantId === where.tenantId && entity.planCode === where.planCode && entity.isDeleted === where.isDeleted),
    createQueryBuilder: () => new FakeQueryBuilder(latestPlanCode)
  } as unknown as Repository<EngineeringPlanEntity>;
  return { repository, saved };
}

test("EngineeringPlanRepository creates plan with generated code and DRAFT status", async () => {
  const { repository } = createFakeRepository("GCJH20260626001");
  const plans = new EngineeringPlanRepository(repository);
  const saved = await plans.createPlan(
    { tenantId: "tenant-a", parkId: "park-a" },
    "00000000-0000-0000-0000-000000000001",
    {
      projectId: "00000000-0000-0000-0000-000000000101",
      planName: "消防改造总计划",
      planType: EngineeringPlanType.MASTER,
      weight: "100.00"
    }
  );

  assert.equal(saved.tenantId, "tenant-a");
  assert.equal(saved.parkId, "park-a");
  assert.equal(saved.planCode, "GCJH20260626002");
  assert.equal(saved.status, EngineeringPlanStatus.DRAFT);
  assert.equal(saved.actualProgressPercent, 0);
  assert.equal(saved.createBy, "00000000-0000-0000-0000-000000000001");
});

test("EngineeringPlanRepository can detect plan code uniqueness inside a tenant", async () => {
  const { repository } = createFakeRepository();
  const plans = new EngineeringPlanRepository(repository);
  await plans.createPlan(
    { tenantId: "tenant-a", parkId: "park-a" },
    null,
    {
      projectId: "00000000-0000-0000-0000-000000000101",
      planCode: "GCJH20260626001",
      planName: "弱电改造计划",
      planType: EngineeringPlanType.PHASE
    }
  );

  assert.equal(await plans.existsByCode({ tenantId: "tenant-a" }, "GCJH20260626001"), true);
  assert.equal(await plans.existsByCode({ tenantId: "tenant-b" }, "GCJH20260626001"), false);
});

test("EngineeringPlanRepository updateProgress and updateStatus persist controlled fields", async () => {
  const entity = {
    id: "plan-id",
    tenantId: "tenant-a",
    parkId: "park-a",
    isDeleted: false,
    status: EngineeringPlanStatus.DRAFT,
    actualProgressPercent: 0,
    delayDays: 0
  } as EngineeringPlanEntity;
  const repository = {
    createQueryBuilder: () => ({
      where() {
        return this;
      },
      andWhere() {
        return this;
      },
      getOne: async () => entity
    }),
    save: async (input: EngineeringPlanEntity) => input
  } as unknown as Repository<EngineeringPlanEntity>;
  const plans = new EngineeringPlanRepository(repository);

  const progress = await plans.updateProgress(
    { tenantId: "tenant-a", parkId: "park-a" },
    "00000000-0000-0000-0000-000000000001",
    entity.id,
    {
      actualProgressPercent: 55,
      status: EngineeringPlanStatus.IN_PROGRESS,
      delayDays: 2
    }
  );
  assert.equal(progress.actualProgressPercent, 55);
  assert.equal(progress.status, EngineeringPlanStatus.IN_PROGRESS);
  assert.equal(progress.delayDays, 2);

  const status = await plans.updateStatus(
    { tenantId: "tenant-a", parkId: "park-a" },
    "00000000-0000-0000-0000-000000000001",
    entity.id,
    {
      status: EngineeringPlanStatus.COMPLETED,
      actualProgressPercent: 100,
      delayDays: 0
    }
  );
  assert.equal(status.status, EngineeringPlanStatus.COMPLETED);
  assert.equal(status.actualProgressPercent, 100);
});
