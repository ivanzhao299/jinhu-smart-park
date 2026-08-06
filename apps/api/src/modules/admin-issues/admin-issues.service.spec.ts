import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { AdminIssuesService } from "./admin-issues.service";
import type { AdminIssueReportEntity } from "./entities/admin-issue-report.entity";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function fixture(): Partial<AdminIssueReportEntity> & Pick<AdminIssueReportEntity, "tenantId" | "parkId" | "issueNo" | "reporterId" | "status" | "runnerStatus"> {
  return {
    tenantId: "tenant-1", parkId: "park-1", issueNo: "SP-1", reporterId: "reporter-1",
    status: "TRIAGED", runnerStatus: "NONE", acceptanceCriteria: null, moduleCode: null,
    remark: null, approvedBy: null, approvedAt: null, runnerId: null, leaseToken: null,
    leaseExpiresAt: null, implementationCommit: null, changedFiles: [], validationEvidence: {},
    releaseEvidence: {}, resolutionSummary: null, updateBy: null
  };
}

function serviceFor(issue: ReturnType<typeof fixture>) {
  const repository = {
    findOne: async () => issue as AdminIssueReportEntity,
    save: async (value: unknown) => value
  };
  return new AdminIssuesService(repository as never);
}

const scope = { tenantId: "tenant-1", parkId: "park-1" };
const actor = { sub: "admin-1", username: "admin", realName: "Admin", permissions: [], isSuper: true };

describe("AdminIssuesService", () => {
  it("ships a disabled minimum-permission Runner identity baseline", () => {
    const migration = readFileSync(resolve(process.cwd(), "../../database/migrations/000190_admin_issue_runner_repair.sql"), "utf8");
    assert.match(migration, /SMART_PARK_RUNNER/);
    assert.match(migration, /!SMART_PARK_RUNNER_CREDENTIAL_NOT_INITIALIZED!/);
    assert.match(migration, /admin_issue:runner/);
    assert.match(migration, /false, 'disabled'/);
  });
  it("requires explicit acceptance criteria before Runner approval", async () => {
    const service = serviceFor(fixture());
    await assert.rejects(
      () => service.triage(scope, actor as never, "SP-1", { status: "APPROVED" }),
      BadRequestException
    );
  });

  it("moves an approved issue into the existing Runner-ready projection", async () => {
    const issue = fixture();
    const result = await serviceFor(issue).triage(scope, actor as never, "SP-1", {
      status: "APPROVED", acceptance_criteria: "测试通过且生产健康检查通过"
    });
    assert.equal(result.status, "APPROVED");
    assert.equal(result.runnerStatus, "READY");
    assert.equal(result.approvedBy, "admin-1");
  });

  it("rejects a false success without validation and release evidence", async () => {
    const issue = fixture();
    issue.status = "IN_PROGRESS"; issue.runnerStatus = "RUNNING";
    issue.leaseToken = "8ff79b54-4953-4e6f-8540-539403b96a84";
    issue.leaseExpiresAt = new Date(Date.now() + 60_000);
    await assert.rejects(
      () => serviceFor(issue).recordResult(scope, actor as never, "SP-1", {
        lease_token: issue.leaseToken!, runner_status: "SUCCEEDED", summary: "done"
      }),
      BadRequestException
    );
  });

  it("rejects expired Runner leases", async () => {
    const issue = fixture();
    issue.leaseToken = "8ff79b54-4953-4e6f-8540-539403b96a84";
    issue.leaseExpiresAt = new Date(Date.now() - 1);
    await assert.rejects(
      () => serviceFor(issue).recordResult(scope, actor as never, "SP-1", {
        lease_token: issue.leaseToken!, runner_status: "FAILED", summary: "failed"
      }),
      ConflictException
    );
  });

  it("allows an abandoned expired claim to be recovered by another Runner", async () => {
    const issue = fixture();
    issue.status = "IN_PROGRESS"; issue.runnerStatus = "CLAIMED";
    issue.leaseToken = "8ff79b54-4953-4e6f-8540-539403b96a84";
    issue.leaseExpiresAt = new Date(Date.now() - 1);
    const repository = {
      manager: { transaction: async (work: (manager: unknown) => Promise<unknown>) => work({
        getRepository: () => ({
          createQueryBuilder: () => ({ setLock() { return this; }, where() { return this; }, getOne: async () => issue }),
          save: async (value: unknown) => value
        })
      }) }
    };
    const recovered = await new AdminIssuesService(repository as never).claim(scope, actor as never, "SP-1", { runner_id: "runner-2" });
    assert.equal(recovered.runnerId, "runner-2");
    assert.notEqual(recovered.leaseToken, "8ff79b54-4953-4e6f-8540-539403b96a84");
  });
});
