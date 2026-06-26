import assert from "node:assert/strict";
import test from "node:test";
import type { Repository } from "typeorm";
import { EngineeringProjectStatus, EngineeringProjectType } from "./domain/engineering-project.enums";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringProjectRepository } from "./repositories/engineering-project.repository";

class FakeQueryBuilder {
  constructor(private readonly latestProjectCode: string | null) {}

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

  async getRawOne(): Promise<{ projectCode: string } | undefined> {
    return this.latestProjectCode ? { projectCode: this.latestProjectCode } : undefined;
  }
}

function createFakeRepository(latestProjectCode: string | null = null): {
  repository: Repository<EngineeringProjectEntity>;
  saved: EngineeringProjectEntity[];
} {
  const saved: EngineeringProjectEntity[] = [];
  const repository = {
    create: (input: Partial<EngineeringProjectEntity>) =>
      ({
        id: "project-id",
        isDeleted: false,
        version: 1,
        createTime: new Date("2026-06-26T00:00:00.000Z"),
        updateTime: new Date("2026-06-26T00:00:00.000Z"),
        ...input,
        status: input.status ?? EngineeringProjectStatus.DRAFT,
        progressPercent: input.progressPercent ?? 0
      }) as EngineeringProjectEntity,
    save: async (entity: EngineeringProjectEntity) => {
      saved.push(entity);
      return entity;
    },
    exists: async ({ where }: { where: { tenantId: string; projectCode: string; isDeleted: boolean } }) =>
      saved.some((entity) => entity.tenantId === where.tenantId && entity.projectCode === where.projectCode && entity.isDeleted === where.isDeleted),
    createQueryBuilder: () => new FakeQueryBuilder(latestProjectCode)
  } as unknown as Repository<EngineeringProjectEntity>;
  return { repository, saved };
}

test("EngineeringProjectRepository creates project with generated code and DRAFT status", async () => {
  const { repository } = createFakeRepository("GC20260626001");
  const projects = new EngineeringProjectRepository(repository);
  const saved = await projects.createProject(
    { tenantId: "tenant-a", parkId: "park-a" },
    "00000000-0000-0000-0000-000000000001",
    {
      projectName: "A5 楼消防改造",
      projectType: EngineeringProjectType.FIRE_PROTECTION,
      budgetAmount: "120000.00"
    }
  );

  assert.equal(saved.tenantId, "tenant-a");
  assert.equal(saved.parkId, "park-a");
  assert.equal(saved.projectCode, "GC20260626002");
  assert.equal(saved.status, EngineeringProjectStatus.DRAFT);
  assert.equal(saved.progressPercent, 0);
  assert.equal(saved.createBy, "00000000-0000-0000-0000-000000000001");
});

test("EngineeringProjectRepository can detect project code uniqueness inside a tenant", async () => {
  const { repository } = createFakeRepository();
  const projects = new EngineeringProjectRepository(repository);
  await projects.createProject(
    { tenantId: "tenant-a", parkId: "park-a" },
    null,
    {
      projectCode: "GC20260626001",
      projectName: "弱电改造",
      projectType: EngineeringProjectType.WEAK_CURRENT
    }
  );

  assert.equal(await projects.existsByCode({ tenantId: "tenant-a" }, "GC20260626001"), true);
  assert.equal(await projects.existsByCode({ tenantId: "tenant-b" }, "GC20260626001"), false);
});
