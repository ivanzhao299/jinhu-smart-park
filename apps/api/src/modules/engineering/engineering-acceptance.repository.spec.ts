import assert from "node:assert/strict";
import test from "node:test";
import type { Repository } from "typeorm";
import { EngineeringAcceptanceStatus, EngineeringAcceptanceType } from "./domain/engineering-project.enums";
import { EngineeringAcceptanceEntity } from "./entities/engineering-acceptance.entity";
import { EngineeringAcceptanceRepository } from "./repositories/engineering-acceptance.repository";

class FakeQueryBuilder {
  constructor(
    private readonly latestAcceptanceCode: string | null,
    private readonly entity: EngineeringAcceptanceEntity | null = null
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

  async getRawOne(): Promise<{ acceptanceCode: string } | undefined> {
    return this.latestAcceptanceCode ? { acceptanceCode: this.latestAcceptanceCode } : undefined;
  }

  async getOne(): Promise<EngineeringAcceptanceEntity | null> {
    return this.entity;
  }
}

function createFakeRepository(latestAcceptanceCode: string | null = null): {
  repository: Repository<EngineeringAcceptanceEntity>;
  saved: EngineeringAcceptanceEntity[];
} {
  const saved: EngineeringAcceptanceEntity[] = [];
  let selectedEntity: EngineeringAcceptanceEntity | null = null;
  const repository = {
    create: (input: Partial<EngineeringAcceptanceEntity>) =>
      ({
        id: "acceptance-id",
        isDeleted: false,
        version: 1,
        createTime: new Date("2026-06-26T00:00:00.000Z"),
        updateTime: new Date("2026-06-26T00:00:00.000Z"),
        ...input,
        acceptanceStatus: input.acceptanceStatus ?? EngineeringAcceptanceStatus.DRAFT
      }) as EngineeringAcceptanceEntity,
    save: async (entity: EngineeringAcceptanceEntity) => {
      saved.push(entity);
      selectedEntity = entity;
      return entity;
    },
    exists: async ({ where }: { where: { tenantId: string; acceptanceCode: string; isDeleted: boolean } }) =>
      saved.some(
        (entity) => entity.tenantId === where.tenantId && entity.acceptanceCode === where.acceptanceCode && entity.isDeleted === where.isDeleted
      ),
    createQueryBuilder: () => new FakeQueryBuilder(latestAcceptanceCode, selectedEntity)
  } as unknown as Repository<EngineeringAcceptanceEntity>;
  return { repository, saved };
}

test("EngineeringAcceptanceRepository creates acceptance with generated code and DRAFT status", async () => {
  const { repository } = createFakeRepository("GCYS20260626001");
  const acceptances = new EngineeringAcceptanceRepository(repository);
  const saved = await acceptances.createAcceptance(
    { tenantId: "tenant-a", parkId: "park-a" },
    "00000000-0000-0000-0000-000000000001",
    {
      projectId: "00000000-0000-0000-0000-000000000101",
      acceptanceName: "消防系统阶段验收",
      acceptanceType: EngineeringAcceptanceType.STAGE,
      plannedAcceptanceDate: "2026-06-26"
    }
  );

  assert.equal(saved.tenantId, "tenant-a");
  assert.equal(saved.parkId, "park-a");
  assert.equal(saved.acceptanceCode, "GCYS20260626002");
  assert.equal(saved.acceptanceStatus, EngineeringAcceptanceStatus.DRAFT);
  assert.equal(saved.createBy, "00000000-0000-0000-0000-000000000001");
});

test("EngineeringAcceptanceRepository can detect acceptance code uniqueness inside a tenant", async () => {
  const { repository } = createFakeRepository();
  const acceptances = new EngineeringAcceptanceRepository(repository);
  await acceptances.createAcceptance(
    { tenantId: "tenant-a", parkId: "park-a" },
    null,
    {
      projectId: "00000000-0000-0000-0000-000000000101",
      acceptanceCode: "GCYS20260626001",
      acceptanceName: "隐蔽工程验收",
      acceptanceType: EngineeringAcceptanceType.HIDDEN_WORK,
      plannedAcceptanceDate: "2026-06-26"
    }
  );

  assert.equal(await acceptances.existsByCode({ tenantId: "tenant-a" }, "GCYS20260626001"), true);
  assert.equal(await acceptances.existsByCode({ tenantId: "tenant-b" }, "GCYS20260626001"), false);
});

test("EngineeringAcceptanceRepository updateStatus persists controlled status fields", async () => {
  const { repository } = createFakeRepository();
  const acceptances = new EngineeringAcceptanceRepository(repository);
  const saved = await acceptances.createAcceptance(
    { tenantId: "tenant-a", parkId: "park-a" },
    null,
    {
      projectId: "00000000-0000-0000-0000-000000000101",
      acceptanceName: "竣工验收",
      acceptanceType: EngineeringAcceptanceType.COMPLETION,
      plannedAcceptanceDate: "2026-06-26"
    }
  );

  const submitted = await acceptances.updateStatus(
    { tenantId: "tenant-a", parkId: "park-a" },
    "00000000-0000-0000-0000-000000000001",
    saved.id,
    {
      acceptanceStatus: EngineeringAcceptanceStatus.SUBMITTED,
      submittedAt: new Date("2026-06-26T02:00:00.000Z"),
      submittedBy: "00000000-0000-0000-0000-000000000001"
    }
  );
  assert.equal(submitted.acceptanceStatus, EngineeringAcceptanceStatus.SUBMITTED);
  assert.equal(submitted.submittedBy, "00000000-0000-0000-0000-000000000001");
});
