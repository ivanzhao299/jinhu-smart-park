import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AdminIssuesService } from "./admin-issues.service";
import { AdminIssueRunnerResultDto } from "./dto/admin-issue.dto";
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
  const scopedRepository = {
    findOne: async () => issue as AdminIssueReportEntity,
    save: async (value: unknown) => value,
    createQueryBuilder: () => ({
      setLock() { return this; },
      where() { return this; },
      getOne: async () => issue as AdminIssueReportEntity
    })
  };
  const repository = {
    ...scopedRepository,
    manager: {
      transaction: async (work: (manager: { getRepository: () => typeof scopedRepository }) => Promise<unknown>) => work({
        getRepository: () => scopedRepository
      })
    }
  };
  return new AdminIssuesService(repository as never);
}

const scope = { tenantId: "tenant-1", parkId: "park-1" };
const actor = { sub: "admin-1", username: "admin", realName: "Admin", permissions: [], isSuper: true };

describe("AdminIssuesService", () => {
  it("keeps schema migration separate from the disabled minimum-permission Runner seed", () => {
    const migration = readFileSync(resolve(process.cwd(), "../../database/migrations/000190_admin_issue_runner_repair.sql"), "utf8");
    const seed = readFileSync(resolve(process.cwd(), "../../database/seeds/production/000005_admin_issue_runner_baseline.sql"), "utf8");
    assert.doesNotMatch(migration, /INSERT INTO (sys_permission|sys_role|sys_user|rel_)/);
    assert.match(seed, /ON CONFLICT \(tenant_id, code\) WHERE is_deleted = false/);
    assert.doesNotMatch(seed, /ON CONFLICT \(tenant_id, park_id, code\)/);
    assert.doesNotMatch(seed, /Every active role may submit feedback/);
    assert.match(seed, /Removed from dedicated Runner role/);
    assert.match(seed, /!SMART_PARK_RUNNER_CREDENTIAL_NOT_INITIALIZED!/);
    assert.match(seed, /false, 'disabled'/);
  });

  it("declares authenticated-user access on create, mine, and detail handlers", () => {
    const controller = readFileSync(resolve(process.cwd(), "src/modules/admin-issues/admin-issues.controller.ts"), "utf8");
    assert.match(controller, /@Post\(\)\s+@RequireAuthenticated\(\)/);
    assert.match(controller, /@Get\("mine"\)\s+@RequireAuthenticated\(\)/);
    assert.match(controller, /@Get\(":issueNo"\)\s+@RequireAuthenticated\(\)/);
  });

  it("keeps Runner activation and deployment rollback artifacts bounded", () => {
    const activation = readFileSync(resolve(process.cwd(), "../../.github/workflows/activate-smart-park-runner.yml"), "utf8");
    const deployment = readFileSync(resolve(process.cwd(), "../../.github/workflows/deploy-production.yml"), "utf8");
    const ci = readFileSync(resolve(process.cwd(), "../../.github/workflows/ci.yml"), "utf8");
    assert.match(activation, /webfactory\/ssh-agent@v0\.9\.0/);
    assert.match(activation, /ssh-keyscan/);
    assert.match(activation, /trap cleanup_remote_runner_activation EXIT HUP INT TERM/);
    assert.match(activation, /trap cleanup_runner_activation EXIT HUP INT TERM/);
    assert.match(activation, /Remove local credential artifacts/);
    assert.match(deployment, /cleanup_rollback_snapshot/);
    assert.match(deployment, /run_production_seed/);
    assert.match(deployment, /000001_s1_production_core/);
    assert.match(deployment, /Production seed changes require an API-capable full deployment/);
    assert.match(deployment, /Diagnose 000189 asset scope parity \(read-only\)/);
    assert.match(deployment, /Enforce 000189 asset scope parity before deployment/);
    const diagnosticStart = deployment.indexOf("Diagnose 000189 asset scope parity (read-only)");
    const diagnosticEnd = deployment.indexOf("Ensure required production secrets");
    assert.notEqual(diagnosticStart, -1);
    assert.notEqual(diagnosticEnd, -1);
    assert.doesNotMatch(
      deployment.slice(diagnosticStart, diagnosticEnd),
      /(?:rsync|\.release\.json|pnpm|prod:deploy|db:migrate|db:seed|go-live-uat)/
    );
    assert.ok(
      deployment.indexOf("Ensure required production secrets") <
        deployment.indexOf("Enforce 000189 asset scope parity before deployment")
    );
    assert.doesNotMatch(deployment, /RUN_PRODUCTION_SEED=yes/);
    assert.match(deployment, /rollback_release\(\) \{\s+trap - ERR/);
    assert.match(deployment, /Rollback failed; preserving source snapshot for manual recovery/);
    const rollbackStart = deployment.indexOf("rollback_release()");
    const rollbackEnd = deployment.indexOf("trap rollback_release ERR");
    assert.notEqual(rollbackStart, -1);
    assert.notEqual(rollbackEnd, -1);
    const rollbackRelease = deployment.slice(rollbackStart, rollbackEnd);
    assert.match(rollbackRelease, /docker compose --env-file \.env\.production/);
    assert.match(rollbackRelease, /MODE=full sh scripts\/prod-healthcheck\.sh/);
    assert.match(rollbackRelease, /PRUNE_DOCKER_BUILD_CACHE=yes sh scripts\/prod-docker-cleanup\.sh/);
    assert.doesNotMatch(rollbackRelease, /(?:pnpm db:migrate|pnpm prod:deploy|RUN_PRODUCTION_SEED)/);
    assert.ok(deployment.split("cleanup_rollback_snapshot").length >= 4);
    assert.match(ci, /Detect database and release changes/);
    assert.match(
      ci,
      /database\/\(migrations\|migration-prerequisites\|migration-replacements\|seeds\)/
    );
    assert.match(ci, /database\/\(migration-history-aliases\|migration-replacements\)\\\.txt/);
    assert.match(ci, /prod-deploy\|prod-healthcheck\|prod-docker-cleanup/);
    assert.match(ci, /ci\|deploy-production/);
    assert.equal(ci.match(/ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod/g)?.length, 2);
    assert.match(ci, /git diff --name-only "\$BEFORE_SHA" "\$CURRENT_SHA"/);
  });

  it("requires explicit acceptance criteria before Runner approval", async () => {
    const service = serviceFor(fixture());
    await assert.rejects(
      () => service.triage(scope, actor as never, "SP-1", { status: "APPROVED" }),
      BadRequestException
    );
  });

  it("validates the final trimmed acceptance criteria before approval", async () => {
    const issue = fixture();
    issue.acceptanceCriteria = "existing criteria";
    await assert.rejects(
      () => serviceFor(issue).triage(scope, actor as never, "SP-1", { status: "APPROVED", acceptance_criteria: "   " }),
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
    issue.status = "IN_PROGRESS"; issue.runnerStatus = "CLAIMED"; issue.runnerId = "runner-1";
    issue.leaseToken = "8ff79b54-4953-4e6f-8540-539403b96a84";
    issue.leaseExpiresAt = new Date(Date.now() + 60_000);
    await assert.rejects(
      () => serviceFor(issue).recordResult(scope, actor as never, "SP-1", {
        runner_id: "runner-1", lease_token: issue.leaseToken!, runner_status: "SUCCEEDED", summary: "done"
      }),
      BadRequestException
    );
  });

  it("requires CI, deployment, and production health gates before release", async () => {
    const issue = fixture();
    issue.status = "IN_PROGRESS"; issue.runnerStatus = "CLAIMED"; issue.runnerId = "runner-1";
    issue.leaseToken = "8ff79b54-4953-4e6f-8540-539403b96a84";
    issue.leaseExpiresAt = new Date(Date.now() + 60_000);
    await assert.rejects(
      () => serviceFor(issue).recordResult(scope, actor as never, "SP-1", {
        runner_id: "runner-1", lease_token: issue.leaseToken!, runner_status: "SUCCEEDED", summary: "done",
        implementation_commit: "abcdef1", changed_files: ["apps/api/src/example.ts"],
        validation_evidence: { status: "PASS" },
        release_evidence: {
          ci: { status: "PASS" }, deployment: { status: "PASS" },
          production_health: { status: "FAIL" as "PASS" }
        }
      }),
      BadRequestException
    );
  });

  it("rejects an incomplete structured release evidence DTO", async () => {
    const dto = plainToInstance(AdminIssueRunnerResultDto, {
      runner_id: "runner-1",
      lease_token: "8ff79b54-4953-4e6f-8540-539403b96a84",
      runner_status: "SUCCEEDED",
      summary: "done",
      release_evidence: {
        ci: { status: "PASS" },
        deployment: { status: "PASS" }
      }
    });
    const errors = await validate(dto);
    assert.ok(errors.some((error) => error.property === "release_evidence"));
  });

  it("rejects expired Runner leases", async () => {
    const issue = fixture();
    issue.status = "IN_PROGRESS"; issue.runnerStatus = "CLAIMED"; issue.runnerId = "runner-1";
    issue.leaseToken = "8ff79b54-4953-4e6f-8540-539403b96a84";
    issue.leaseExpiresAt = new Date(Date.now() - 1);
    await assert.rejects(
      () => serviceFor(issue).recordResult(scope, actor as never, "SP-1", {
        runner_id: "runner-1", lease_token: issue.leaseToken!, runner_status: "FAILED", summary: "failed"
      }),
      ConflictException
    );
  });

  it("renews only the current Runner's active lease", async () => {
    const issue = fixture();
    issue.status = "IN_PROGRESS"; issue.runnerStatus = "CLAIMED"; issue.runnerId = "runner-1";
    issue.leaseToken = "8ff79b54-4953-4e6f-8540-539403b96a84";
    issue.leaseExpiresAt = new Date(Date.now() + 30_000);
    const previousExpiry = issue.leaseExpiresAt;

    await assert.rejects(
      () => serviceFor(issue).renew(scope, actor as never, "SP-1", { runner_id: "runner-2", lease_token: issue.leaseToken! }),
      ConflictException
    );
    const renewed = await serviceFor(issue).renew(scope, actor as never, "SP-1", {
      runner_id: "runner-1", lease_token: issue.leaseToken!
    });
    assert.ok(renewed.leaseExpiresAt! > previousExpiry);
  });

  it("blocks triage while a Runner holds an active lease", async () => {
    const issue = fixture();
    issue.status = "IN_PROGRESS"; issue.runnerStatus = "CLAIMED"; issue.runnerId = "runner-1";
    issue.leaseToken = "8ff79b54-4953-4e6f-8540-539403b96a84";
    issue.leaseExpiresAt = new Date(Date.now() + 60_000);
    await assert.rejects(
      () => serviceFor(issue).triage(scope, actor as never, "SP-1", { status: "REJECTED" }),
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

  it("allows a failed Runner result to be triaged and requeued explicitly", async () => {
    const issue = fixture();
    issue.status = "IN_PROGRESS"; issue.runnerStatus = "CLAIMED"; issue.runnerId = "runner-1";
    issue.leaseToken = "8ff79b54-4953-4e6f-8540-539403b96a84";
    issue.leaseExpiresAt = new Date(Date.now() + 60_000);
    await serviceFor(issue).recordResult(scope, actor as never, "SP-1", {
      runner_id: "runner-1", lease_token: issue.leaseToken, runner_status: "FAILED", summary: "failed"
    });
    assert.equal(issue.runnerStatus, "FAILED");
    assert.equal(issue.leaseToken, null);

    await serviceFor(issue).triage(scope, actor as never, "SP-1", {
      status: "APPROVED", acceptance_criteria: "修复失败原因后重新执行"
    });
    assert.equal(issue.status, "APPROVED");
    assert.equal(issue.runnerStatus, "READY");
  });
});
