import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { request as httpRequest } from "node:http";
import { arch, platform, release } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import test from "node:test";
import {
  Controller,
  ConflictException,
  ForbiddenException,
  Get,
  Headers,
  HttpException,
  Injectable,
  Module,
  NotFoundException,
  Param,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
  type ArgumentsHost
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { Response } from "express";
import type { ClsService } from "nestjs-cls";
import { ApiExceptionFilter } from "./api-exception.filter";

test("ApiExceptionFilter translates PostgreSQL exclusion conflicts to HTTP 409", () => {
  let statusCode = 0;
  let payload: unknown;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: unknown) {
      payload = body;
      return this;
    }
  } as unknown as Response;
  const host = {
    switchToHttp: () => ({ getResponse: () => response })
  } as unknown as ArgumentsHost;
  const cls = { getId: () => "request-1" } as unknown as ClsService;

  new ApiExceptionFilter(cls).catch({ code: "23P01" }, host);

  assert.equal(statusCode, 409);
  assert.deepEqual(payload, {
    code: 409,
    message: "Resource conflicts with an existing active record",
    data: null,
    request_id: "request-1",
    server_time: (payload as { server_time: number }).server_time
  });
});

test("ApiExceptionFilter preserves only the exact approval-required business data", () => {
  let payload: unknown;
  const response = {
    status() {
      return this;
    },
    json(body: unknown) {
      payload = body;
      return this;
    }
  } as unknown as Response;
  const host = {
    switchToHttp: () => ({ getResponse: () => response })
  } as unknown as ArgumentsHost;
  const cls = { getId: () => "request-approval" } as unknown as ClsService;

  new ApiExceptionFilter(cls).catch(
    new ConflictException({
      message: "approval-required",
      errorCode: "approval-required",
      actionId: "property.mode-transition.request",
      targetId: "unit-1",
      approvalAvailable: false
    }),
    host
  );

  assert.deepEqual(payload, {
    code: 409,
    message: "approval-required",
    data: {
      errorCode: "approval-required",
      actionId: "property.mode-transition.request",
      targetId: "unit-1",
      approvalAvailable: false
    },
    request_id: "request-approval",
    server_time: (payload as { server_time: number }).server_time
  });
});

test("ApiExceptionFilter does not echo arbitrary structured exception data", () => {
  let payload: unknown;
  const response = {
    status() {
      return this;
    },
    json(body: unknown) {
      payload = body;
      return this;
    }
  } as unknown as Response;
  const host = {
    switchToHttp: () => ({ getResponse: () => response })
  } as unknown as ArgumentsHost;
  const cls = { getId: () => "request-safe" } as unknown as ClsService;

  new ApiExceptionFilter(cls).catch(
    new ConflictException({
      message: "approval-required",
      errorCode: "approval-required",
      actionId: "property.mode-transition.request",
      targetId: "unit-1",
      approvalAvailable: false,
      stack: "must-not-leak"
    }),
    host
  );

  assert.deepEqual((payload as { data: unknown }).data, {
    errorCode: "approval-required",
    actionId: "property.mode-transition.request",
    targetId: "unit-1",
    approvalAvailable: false
  });
  assert.equal("stack" in ((payload as { data: object }).data), false);
});

test("ApiExceptionFilter projects safe camelCase recovery fields for business errors", () => {
  let payload: unknown;
  const response = {
    status() {
      return this;
    },
    json(body: unknown) {
      payload = body;
      return this;
    }
  } as unknown as Response;
  const host = {
    switchToHttp: () => ({ getResponse: () => response })
  } as unknown as ArgumentsHost;
  const cls = { getId: () => "request-version" } as unknown as ClsService;

  new ApiExceptionFilter(cls).catch(
    new ConflictException({
      message: "identity-snapshot-stale",
      errorCode: "identity-snapshot-stale",
      actionId: "party.identity.update-draft",
      targetId: "submission-1",
      expectedVersion: 2,
      actualVersion: 3,
      latestVersion: 3,
      retryable: true,
      recoveryAction: "party.identity.update-draft",
      blockers: ["identity-snapshot-stale"],
      details: {
        stack: "must-not-leak",
        identityNumber: "must-not-leak"
      },
      latest_version: 99,
      claimToken: "must-not-leak"
    }),
    host
  );

  assert.deepEqual((payload as { data: unknown }).data, {
    errorCode: "identity-snapshot-stale",
    actionId: "party.identity.update-draft",
    targetId: "submission-1",
    expectedVersion: 2,
    actualVersion: 3,
    latestVersion: 3,
    retryable: true,
    recoveryAction: "party.identity.update-draft",
    blockers: ["identity-snapshot-stale"],
    details: {}
  });
});

test("ApiExceptionFilter rejects uncontracted error codes and unsafe detail values", () => {
  let payload: unknown;
  const response = {
    status() {
      return this;
    },
    json(body: unknown) {
      payload = body;
      return this;
    }
  } as unknown as Response;
  const host = {
    switchToHttp: () => ({ getResponse: () => response })
  } as unknown as ArgumentsHost;
  const cls = { getId: () => "request-invalid" } as unknown as ClsService;
  const filter = new ApiExceptionFilter(cls);

  filter.catch(
    new ConflictException({
      message: "internal-db-error",
      errorCode: "internal-db-error",
      latestVersion: 4
    }),
    host
  );
  assert.equal((payload as { data: unknown }).data, null);

  filter.catch(
    new ConflictException({
      message: "property-version-conflict",
      errorCode: "property-version-conflict",
      actionId: "../../unsafe",
      latestVersion: "4",
      blockers: [{ code: "secret", payload: "must-not-leak" }],
      details: new Date()
    }),
    host
  );
  assert.equal((payload as { data: unknown }).data, null);
});

test("ApiExceptionFilter keeps only exact global and task recovery actions", () => {
  let payload: unknown;
  const response = {
    status() { return this; },
    json(body: unknown) { payload = body; return this; }
  } as unknown as Response;
  const host = {
    switchToHttp: () => ({ getResponse: () => response })
  } as unknown as ArgumentsHost;
  const cls = { getId: () => "request-recovery" } as unknown as ClsService;
  const filter = new ApiExceptionFilter(cls);

  const acceptedCases = [
    [409, "property-version-conflict", "reload", true, undefined],
    [503, "property-runtime-unavailable", "retry-with-same-client-key", true, undefined],
    [409, "task-already-claimed", "property.task.refresh", false, { assigneeDisplay: null }],
    [409, "task-source-ineligible", "property.task.return-to-workspace", false, { deepLink: null }],
    [409, "task-version-conflict", "property.task.reload", true, undefined]
  ] as const;

  for (const [status, errorCode, recoveryAction, retryable, taskDetails] of acceptedCases) {
    filter.catch(
      new HttpException({
        message: errorCode,
        errorCode,
        retryable,
        recoveryAction,
        latestVersion: errorCode === "task-version-conflict" ? 2 : undefined,
        details: taskDetails ?? {}
      }, status),
      host
    );
    assert.equal(
      (payload as { data: { recoveryAction?: string } }).data.recoveryAction,
      recoveryAction,
      `${errorCode} must keep its exact recovery action`
    );
  }

  filter.catch(
    new ConflictException({
      message: "identity-snapshot-stale",
      errorCode: "identity-snapshot-stale",
      recoveryAction: "party.identity.update-draft"
    }),
    host
  );
  assert.equal(
    (payload as { data: { recoveryAction?: string } }).data.recoveryAction,
    "party.identity.update-draft"
  );

  for (const [errorCode, recoveryAction] of [
    ["task-version-conflict", "property.task.retry-same-client-key"],
    ["property-version-conflict", "property.task.reload"],
    ["task-version-conflict", "reload"],
    ["task-version-conflict", "property.task.uncontracted"],
    ["identity-snapshot-stale", "reload"],
    ["identity-file-not-ready", "party.identity.update-draft"]
  ] as const) {
    filter.catch(
      new ConflictException({
        message: errorCode,
        errorCode,
        retryable: true,
        recoveryAction,
        latestVersion: 2,
        details: {}
      }),
      host
    );
    if (errorCode.startsWith("task-") || errorCode === "property-version-conflict") {
      assert.equal((payload as { data: unknown }).data, null);
    } else {
      assert.equal(
        (payload as { data: { recoveryAction?: string } }).data.recoveryAction,
        undefined
      );
    }
  }
});

test("ApiExceptionFilter exposes only safe task details and never UUID fallback", () => {
  let payload: unknown;
  const response = {
    status() { return this; },
    json(body: unknown) { payload = body; return this; }
  } as unknown as Response;
  const host = {
    switchToHttp: () => ({ getResponse: () => response })
  } as unknown as ArgumentsHost;
  const cls = { getId: () => "request-details" } as unknown as ClsService;
  const filter = new ApiExceptionFilter(cls);

  filter.catch(
    new ConflictException({
      message: "task-already-claimed",
      errorCode: "task-already-claimed",
      retryable: false,
      recoveryAction: "property.task.refresh",
      actionId: "property.task.claim",
      targetId: "must-not-leak",
      expectedVersion: 1,
      actualVersion: 2,
      blockers: ["must-not-leak"],
      stack: "must-not-leak",
      token: "must-not-leak",
      epoch: 9,
      sourceId: "must-not-leak",
      internal: { secret: true },
      details: {
        assigneeDisplay: "值班主管",
        assigneeId: "e5ec7944-2a55-4a9d-9573-d110970c3716",
        claimToken: "must-not-leak",
        claimEpoch: 7,
        sourceId: "must-not-leak",
        stack: "must-not-leak",
        internal: { secret: true }
      }
    }),
    host
  );
  assert.deepEqual((payload as { data: unknown }).data, {
    errorCode: "task-already-claimed",
    retryable: false,
    recoveryAction: "property.task.refresh",
    details: { assigneeDisplay: "值班主管" }
  });

  filter.catch(
    new ConflictException({
      message: "task-already-claimed",
      errorCode: "task-already-claimed",
      retryable: false,
      recoveryAction: "property.task.refresh",
      details: { assigneeDisplay: "e5ec7944-2a55-4a9d-9573-d110970c3716" }
    }),
    host
  );
  assert.equal((payload as { data: unknown }).data, null);

  filter.catch(
    new ConflictException({
      message: "task-source-ineligible",
      errorCode: "task-source-ineligible",
      retryable: false,
      recoveryAction: "property.task.return-to-workspace",
      details: {
        deepLink: "/property/tasks",
        sourceId: "must-not-leak",
        accessToken: "must-not-leak"
      }
    }),
    host
  );
  assert.deepEqual((payload as { data: { details: unknown } }).data.details, {
    deepLink: "/property/tasks"
  });

  for (const deepLink of [
    "https://example.invalid/property/tasks",
    "//example.invalid/property/tasks",
    "/property/../admin",
    "/property/tasks?token=secret",
    "/property/tasks#secret",
    "/property/%2e%2e/admin",
    "/property\\tasks"
  ]) {
    filter.catch(
      new ConflictException({
        message: "task-source-ineligible",
        errorCode: "task-source-ineligible",
        retryable: false,
        recoveryAction: "property.task.return-to-workspace",
        details: { deepLink }
      }),
      host
    );
    assert.equal((payload as { data: unknown }).data, null, deepLink);
  }
});

test("ApiExceptionFilter fails closed when exact task wire fields are missing", () => {
  let payload: unknown;
  const response = {
    status() { return this; },
    json(body: unknown) { payload = body; return this; }
  } as unknown as Response;
  const host = {
    switchToHttp: () => ({ getResponse: () => response })
  } as unknown as ArgumentsHost;
  const cls = { getId: () => "request-task-required" } as unknown as ClsService;
  const filter = new ApiExceptionFilter(cls);

  const invalidBodies = [
    { errorCode: "task-already-claimed", recoveryAction: "property.task.refresh", details: { assigneeDisplay: null } },
    { errorCode: "task-already-claimed", retryable: false, details: { assigneeDisplay: null } },
    { errorCode: "task-source-ineligible", retryable: false, recoveryAction: "property.task.return-to-workspace" },
    { errorCode: "task-version-conflict", retryable: true, recoveryAction: "property.task.reload", details: {} },
    { errorCode: "task-version-conflict", retryable: true, recoveryAction: "property.task.reload", latestVersion: 0, details: {} },
    { errorCode: "property-action-forbidden", retryable: true, details: {} },
    { errorCode: "property-resource-not-found", retryable: false, recoveryAction: "reload", details: {} }
  ];

  for (const body of invalidBodies) {
    const status = body.errorCode === "property-action-forbidden"
      ? 403
      : body.errorCode === "property-resource-not-found"
        ? 404
        : 409;
    filter.catch(new HttpException({ message: "unsafe", ...body }, status), host);
    assert.equal((payload as { data: unknown }).data, null, body.errorCode);
  }
});

test("ApiExceptionFilter requires a signed errorCode before returning structured data", () => {
  let payload: unknown;
  const response = {
    status() { return this; },
    json(body: unknown) { payload = body; return this; }
  } as unknown as Response;
  const host = {
    switchToHttp: () => ({ getResponse: () => response })
  } as unknown as ArgumentsHost;
  const cls = { getId: () => "request-error-code" } as unknown as ClsService;

  new ApiExceptionFilter(cls).catch(
    new ConflictException({
      message: "task-version-conflict",
      retryable: true,
      recoveryAction: "property.task.reload",
      details: { stack: "must-not-leak" }
    }),
    host
  );

  assert.equal((payload as { data: unknown }).data, null);
});

test("ApiExceptionFilter keeps 403 and 404 task wire details empty", () => {
  let statusCode = 0;
  let payload: unknown;
  const response = {
    status(code: number) { statusCode = code; return this; },
    json(body: unknown) { payload = body; return this; }
  } as unknown as Response;
  const host = {
    switchToHttp: () => ({ getResponse: () => response })
  } as unknown as ArgumentsHost;
  const cls = { getId: () => "request-no-existence-leak" } as unknown as ClsService;
  const filter = new ApiExceptionFilter(cls);

  for (const [exception, expectedStatus] of [
    [new ForbiddenException({
      message: "tenant 7 source 9 is forbidden",
      errorCode: "property-action-forbidden",
      retryable: false,
      actionId: "must.not.leak",
      targetId: "must-not-leak",
      token: "must-not-leak",
      epoch: 4,
      details: { sourceId: "must-not-leak", internal: "must-not-leak" }
    }), 403],
    [new NotFoundException({
      message: "source 9 does not exist",
      errorCode: "property-resource-not-found",
      retryable: false,
      expectedVersion: 1,
      actualVersion: 2,
      blockers: ["must-not-leak"],
      stack: "must-not-leak",
      details: { sourceId: "must-not-leak", stack: "must-not-leak" }
    }), 404]
  ] as const) {
    filter.catch(exception, host);
    assert.equal(statusCode, expectedStatus);
    assert.deepEqual((payload as { data: unknown }).data, {
      errorCode: expectedStatus === 403
        ? "property-action-forbidden"
        : "property-resource-not-found",
      retryable: false,
      details: {}
    });
    assert.equal((payload as { message: string }).message, "Resource not available");
    assert.deepEqual(Object.keys(payload as object).sort(), [
      "code", "data", "message", "request_id", "server_time"
    ]);
  }
});

const HTTP_GATE_CONTRACT_SHA =
  "154bd35bff64559e7617231f5d9286e05e187140fbc888b66d689d918424dbbc";
const HTTP_GATE_SIGNOFF_SHA =
  "736c73e298f341dbd91a16f69773920715b0b568e432b5172e0452bc4be325cb";
const HTTP_GATE_FILTER_SHA =
  "c0deab0b10e462dca022d401bce28b1ab779e4002865c1ba52e212239d738541";
const HTTP_GATE_SHARED_SHA =
  "b4930006f4e9bef6f2976ab5b0e1a5127561cdb6576c464650ac82cf0864056a";
const HTTP_GATE_BASE_COMMIT = "0152616fb9a25effdff68fa9da24fea7db8a21a7";
const HTTP_GATE_FIXED_CLOCK_MS = 1785456000000;
const HTTP_GATE_FIXED_REQUEST_ID = "b2a-c1-http-gate";
const HTTP_GATE_EXECUTION_COMMAND =
  "pnpm --filter @jinhu/api exec node --test --require ts-node/register src/shared/filters/api-exception.filter.spec.ts";
const HTTP_GATE_CANONICAL_REPLACE_TOKEN = "owner-canonical-regeneration";
const HTTP_GATE_IDS = {
  "hidden-existing": "10000000-0000-4000-8000-000000000001",
  "hidden-missing": "10000000-0000-4000-8000-000000000002",
  "authorized-missing": "20000000-0000-4000-8000-000000000001",
  "authorized-existing-baseline": "20000000-0000-4000-8000-000000000002"
} as const;
type HttpGateCase = keyof typeof HTTP_GATE_IDS;
type HttpGateProbe = "clean" | "canary-crop" | "canary-invalid-recovery";

interface HttpGateCounters {
  guardEnter: number;
  handlerEnter: number;
  repositoryLookup: number;
  resourceBranch: number;
}

@Injectable()
class HttpGateTraceCollector {
  private events: string[] = [];
  private counters: HttpGateCounters = this.emptyCounters();
  private inputWitness: Record<string, unknown> | null = null;

  begin(): void {
    this.events = [];
    this.counters = this.emptyCounters();
    this.inputWitness = null;
  }

  event(value: string): void {
    this.events.push(value);
  }

  increment(key: keyof HttpGateCounters): void {
    this.counters[key] += 1;
  }

  witness(value: Record<string, unknown>): void {
    this.inputWitness = value;
  }

  snapshot(): {
    trace: string[];
    counters: HttpGateCounters;
    filterInputWitness: Record<string, unknown> | null;
  } {
    return {
      trace: [...this.events],
      counters: { ...this.counters },
      filterInputWitness: this.inputWitness === null
        ? null
        : JSON.parse(JSON.stringify(this.inputWitness)) as Record<string, unknown>
    };
  }

  private emptyCounters(): HttpGateCounters {
    return { guardEnter: 0, handlerEnter: 0, repositoryLookup: 0, resourceBranch: 0 };
  }
}

@Injectable()
class HttpGateRepository {
  private readonly existing = new Set<string>([
    HTTP_GATE_IDS["hidden-existing"],
    HTTP_GATE_IDS["authorized-existing-baseline"]
  ]);

  constructor(private readonly collector: HttpGateTraceCollector) {}

  lookup(taskId: string): boolean {
    this.collector.increment("repositoryLookup");
    this.collector.event("repository.lookup");
    return this.existing.has(taskId);
  }
}

function httpGateErrorBody(
  errorCode: "property-action-forbidden" | "property-resource-not-found",
  probe: HttpGateProbe
): Record<string, unknown> {
  if (probe === "clean") {
    return {
      message: "Resource not available",
      errorCode,
      retryable: false,
      details: {}
    };
  }
  return {
    message: "tenant secret existence detail",
    errorCode,
    retryable: false,
    actionId: "property.task.must-not-leak",
    targetId: "00000000-0000-4000-8000-ffffffffffff",
    expectedVersion: 9007199254740991,
    actualVersion: 9007199254740990,
    latestVersion: 8999999999999999,
    ...(probe === "canary-invalid-recovery"
      ? { recoveryAction: "property.task.attacker-token" }
      : {}),
    blockers: ["secret-blocker"],
    claimToken: "secret-claim-token",
    claimEpoch: 777,
    stack: "secret-stack",
    sql: "select secret",
    repository: "SecretTaskRepository",
    sourceId: "00000000-0000-4000-8000-eeeeeeeeeeee",
    internalPayload: { tenantId: "secret-tenant", parkId: "secret-park" },
    details: { sourceId: "secret-source", internal: { sql: "secret-sql" } }
  };
}

@Injectable()
class HttpGateAuthorizationGuard implements CanActivate {
  constructor(private readonly collector: HttpGateTraceCollector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    this.collector.begin();
    this.collector.increment("guardEnter");
    this.collector.event("guard.enter");
    if (req.headers["x-gate-authority"] !== "allowed") {
      this.collector.event("guard.base-read-authority.denied");
      this.collector.event("guard.forbidden");
      const body = httpGateErrorBody(
        "property-action-forbidden",
        req.headers["x-gate-probe"] as HttpGateProbe
      );
      this.collector.witness(body);
      throw new ForbiddenException(body);
    }
    this.collector.event("guard.base-read-authority.allowed");
    return true;
  }
}

@Controller("/__gate/property/tasks")
@UseGuards(HttpGateAuthorizationGuard)
class HttpGateController {
  constructor(
    private readonly collector: HttpGateTraceCollector,
    private readonly repository: HttpGateRepository
  ) {}

  @Get(":taskId")
  findOne(
    @Param("taskId") taskId: string,
    @Headers("x-gate-probe") probe: HttpGateProbe
  ): Record<string, unknown> {
    this.collector.increment("handlerEnter");
    this.collector.event("handler.enter");
    const exists = this.repository.lookup(taskId);
    this.collector.increment("resourceBranch");
    if (!exists) {
      this.collector.event("handler.not-found");
      const body = httpGateErrorBody("property-resource-not-found", probe);
      this.collector.witness(body);
      throw new NotFoundException(body);
    }
    this.collector.event("handler.found");
    return { fixture: "authorized-existing-baseline" };
  }
}

@Module({
  controllers: [HttpGateController],
  providers: [HttpGateTraceCollector, HttpGateRepository, HttpGateAuthorizationGuard]
})
class HttpGateModule {}

interface HttpGateResponse {
  status: number;
  rawBody: string;
  contentType: string;
  contentLength: string;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function readRawSha(path: string): string {
  return sha256(readFileSync(path));
}

function resolveHttpGateArtifactOutput(canonicalPath: string): {
  targetPath: string;
  replacesCanonical: boolean;
  executionCommand: string;
} | null {
  const requestedPath = process.env.B2A_HTTP_GATE_ARTIFACT_PATH;
  if (requestedPath === undefined) return null;
  if (!isAbsolute(requestedPath) || resolve(requestedPath) !== requestedPath) {
    throw new Error("B2A_HTTP_GATE_ARTIFACT_PATH must be an absolute normalized path");
  }

  const replacesCanonical = requestedPath === canonicalPath;
  const underTmp = requestedPath.startsWith("/tmp/");
  if (!replacesCanonical && !underTmp) {
    throw new Error("HTTP Gate artifact output is limited to canonical research path or /tmp");
  }
  const resolvedParent = realpathSync(dirname(requestedPath));
  if (
    (replacesCanonical && resolvedParent !== realpathSync(dirname(canonicalPath)))
    || (underTmp && resolvedParent !== "/tmp" && !resolvedParent.startsWith("/tmp/"))
  ) {
    throw new Error("HTTP Gate artifact parent must not escape through a symlink");
  }
  if (existsSync(requestedPath) && lstatSync(requestedPath).isSymbolicLink()) {
    throw new Error("HTTP Gate artifact target must not be a symlink");
  }

  const replaceToken = process.env.B2A_HTTP_GATE_ALLOW_REPLACE;
  if (replacesCanonical) {
    if (replaceToken !== HTTP_GATE_CANONICAL_REPLACE_TOKEN) {
      throw new Error("Canonical HTTP Gate artifact replacement requires the owner token");
    }
  } else {
    if (existsSync(requestedPath)) {
      throw new Error("Reviewer /tmp HTTP Gate artifact target must be a new file");
    }
    if (replaceToken !== undefined) {
      throw new Error("Replacement token is valid only for the exact canonical artifact path");
    }
  }

  const envPrefix = replacesCanonical
    ? `B2A_HTTP_GATE_ARTIFACT_PATH=${requestedPath} B2A_HTTP_GATE_ALLOW_REPLACE=${replaceToken} `
    : `B2A_HTTP_GATE_ARTIFACT_PATH=${requestedPath} `;
  return {
    targetPath: requestedPath,
    replacesCanonical,
    executionCommand: `${envPrefix}${HTTP_GATE_EXECUTION_COMMAND}`
  };
}

function writeHttpGateArtifactAtomic(targetPath: string, artifact: unknown): void {
  const temporaryPath = `${targetPath}.tmp-${process.pid}-${process.hrtime.bigint()}`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx"
    });
    if (lstatSync(temporaryPath).isSymbolicLink()) {
      throw new Error("HTTP Gate temporary artifact unexpectedly became a symlink");
    }
    renameSync(temporaryPath, targetPath);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

function requestHttpGate(
  port: number,
  taskId: string,
  authority: "allowed" | "denied",
  probe: HttpGateProbe
): Promise<HttpGateResponse> {
  return new Promise((resolveResponse, reject) => {
    const req = httpRequest({
      hostname: "127.0.0.1",
      port,
      method: "GET",
      path: `/__gate/property/tasks/${taskId}`,
      headers: {
        "x-gate-actor": "fixed-gate-actor",
        "x-gate-authority": authority,
        "x-gate-probe": probe
      }
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        resolveResponse({
          status: res.statusCode ?? 0,
          rawBody: Buffer.concat(chunks).toString("utf8"),
          contentType: String(res.headers["content-type"] ?? ""),
          contentLength: String(res.headers["content-length"] ?? "")
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function expectedHttpGateErrorBody(
  status: 403 | 404,
  dataNull = false
): string {
  const errorCode = status === 403
    ? "property-action-forbidden"
    : "property-resource-not-found";
  return JSON.stringify({
    code: status,
    message: "Resource not available",
    data: dataNull ? null : { errorCode, retryable: false, details: {} },
    request_id: HTTP_GATE_FIXED_REQUEST_ID,
    server_time: HTTP_GATE_FIXED_CLOCK_MS
  });
}

test("ApiExceptionFilter passes the signed real HTTP no-existence-leak gate", async () => {
  const repoRoot = resolve(__dirname, "../../../../../");
  const researchDir = resolve(
    repoRoot,
    ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research"
  );
  const contractPath = resolve(researchDir, "b2a-c1-http-leak-gate-contract.md");
  const signoffPath = resolve(researchDir, "b2a-c1-http-leak-gate-signoff.md");
  const filterPath = resolve(__dirname, "api-exception.filter.ts");
  const specPath = __filename;
  const canonicalArtifactPath = resolve(
    researchDir,
    "b2a-c1-http-leak-gate-artifact.json"
  );
  const artifactOutput = resolveHttpGateArtifactOutput(canonicalArtifactPath);
  const before = {
    contract: readRawSha(contractPath),
    signoff: readRawSha(signoffPath),
    filter: readRawSha(filterPath),
    spec: readRawSha(specPath)
  };
  assert.equal(before.contract, HTTP_GATE_CONTRACT_SHA);
  assert.equal(before.signoff, HTTP_GATE_SIGNOFF_SHA);
  assert.equal(before.filter, HTTP_GATE_FILTER_SHA);
  const signoffRaw = readFileSync(signoffPath, "utf8");
  assert.match(signoffRaw, new RegExp(`合同 raw SHA-256：\`${HTTP_GATE_CONTRACT_SHA}\``));
  assert.match(signoffRaw, /`open_P0_P1=\[\]`/);
  assert.match(signoffRaw, /`implementation_release=allowed`/);

  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim().toLowerCase();
  execFileSync(
    "git",
    ["merge-base", "--is-ancestor", HTTP_GATE_BASE_COMMIT, currentHead],
    { cwd: repoRoot, stdio: "ignore" }
  );
  // Replay keeps the signed gate's original seed stable after legitimate descendant
  // commits. An explicitly requested artifact regeneration still binds the live HEAD.
  const baseCommit = artifactOutput === null ? HTTP_GATE_BASE_COMMIT : currentHead;
  const dirtyWorktreeDisclosure =
    "dirty=true; contract/signoff/filter/spec exact bytes are independently raw-SHA-bound; "
    + "unrelated worktree changes are outside this artifact";
  const seedInput = Buffer.concat([
    readFileSync(contractPath),
    Buffer.from(`${baseCommit}\n`, "utf8"),
    readFileSync(specPath)
  ]);
  const seedInputSha256 = sha256(seedInput);
  const digest = createHash("sha256").update(seedInput).digest();
  const rawSeed = digest.readUInt32BE(0);
  const randomSeedZeroSubstituted = rawSeed === 0;
  const randomSeed = randomSeedZeroSubstituted ? 0x6d2b79f5 : rawSeed;
  const warmupOrder = Array.from({ length: 40 }, (_, index) =>
    index % 2 === 0 ? "hidden-existing" : "hidden-missing"
  ) as HttpGateCase[];
  const originalDateNow = Date.now;
  let app: Awaited<ReturnType<typeof NestFactory.create>> | null = null;

  try {
    Date.now = () => HTTP_GATE_FIXED_CLOCK_MS;
    app = await NestFactory.create(HttpGateModule, { logger: false });
    const cls = { getId: () => HTTP_GATE_FIXED_REQUEST_ID } as unknown as ClsService;
    app.useGlobalFilters(new ApiExceptionFilter(cls));
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as { port: number };
    const collector = app.get(HttpGateTraceCollector);

    const runCase = async (
      caseName: HttpGateCase,
      probe: HttpGateProbe
    ): Promise<Record<string, unknown>> => {
      const hidden = caseName.startsWith("hidden-");
      const response = await requestHttpGate(
        address.port,
        HTTP_GATE_IDS[caseName],
        hidden ? "denied" : "allowed",
        probe
      );
      const snapshot = collector.snapshot();
      return {
        case: caseName,
        probe,
        status: response.status,
        rawBody: response.rawBody,
        bodySha256: sha256(response.rawBody),
        contentType: response.contentType,
        contentLength: response.contentLength,
        trace: snapshot.trace,
        counters: snapshot.counters,
        filterInputWitness: snapshot.filterInputWitness,
        filterInputWitnessRaw: snapshot.filterInputWitness === null
          ? null
          : JSON.stringify(snapshot.filterInputWitness),
        filterOutputWitness: JSON.parse(response.rawBody) as unknown
      };
    };

    const exactWireCases: Record<string, Record<string, unknown>> = {};
    for (const caseName of Object.keys(HTTP_GATE_IDS) as HttpGateCase[]) {
      const result = await runCase(caseName, "clean");
      const expectedStatus = caseName.startsWith("hidden-")
        ? 403
        : caseName === "authorized-missing"
          ? 404
          : 200;
      assert.equal(result.status, expectedStatus);
      assert.equal(result.contentType, "application/json; charset=utf-8");
      assert.equal(result.contentLength, Buffer.byteLength(result.rawBody as string).toString());
      if (expectedStatus === 403 || expectedStatus === 404) {
        assert.equal(result.rawBody, expectedHttpGateErrorBody(expectedStatus));
      }
      const counters = result.counters as HttpGateCounters;
      if (caseName.startsWith("hidden-")) {
        assert.deepEqual(result.trace, [
          "guard.enter",
          "guard.base-read-authority.denied",
          "guard.forbidden"
        ]);
        assert.deepEqual(counters, {
          guardEnter: 1,
          handlerEnter: 0,
          repositoryLookup: 0,
          resourceBranch: 0
        });
      } else {
        assert.equal(counters.handlerEnter, 1);
        assert.equal(counters.repositoryLookup, 1);
        assert.equal(counters.resourceBranch, 1);
      }
      exactWireCases[caseName] = result;
    }
    const hiddenExistingExact = exactWireCases["hidden-existing"];
    const hiddenMissingExact = exactWireCases["hidden-missing"];
    assert.ok(hiddenExistingExact);
    assert.ok(hiddenMissingExact);
    assert.equal(hiddenExistingExact.rawBody, hiddenMissingExact.rawBody);
    assert.equal(hiddenExistingExact.contentLength, hiddenMissingExact.contentLength);

    const maliciousCanaryCases: Record<string, Record<string, unknown>> = {};
    for (const [caseName, status] of [
      ["hidden-existing", 403],
      ["authorized-missing", 404]
    ] as const) {
      for (const probe of ["canary-crop", "canary-invalid-recovery"] as const) {
        const result = await runCase(caseName, probe);
        assert.equal(result.status, status);
        assert.equal(
          result.rawBody,
          expectedHttpGateErrorBody(status, probe === "canary-invalid-recovery")
        );
        assert.equal(
          result.contentLength,
          Buffer.byteLength(result.rawBody as string).toString()
        );
        const forbiddenOutputTokens = [
          "tenant secret existence detail", "property.task.must-not-leak",
          "ffffffffffff", "secret-blocker", "secret-claim-token", "secret-stack",
          "select secret", "SecretTaskRepository", "eeeeeeeeeeee", "secret-tenant",
          "secret-park", "secret-source", "secret-sql", "property.task.attacker-token"
        ];
        for (const token of forbiddenOutputTokens) {
          assert.equal((result.rawBody as string).includes(token), false, token);
        }
        maliciousCanaryCases[`${caseName}:${probe}`] = result;
      }
    }

    for (const caseName of warmupOrder) {
      const result = await runCase(caseName, "canary-crop");
      assert.equal(result.status, 403);
      assert.equal(result.rawBody, expectedHttpGateErrorBody(403));
    }

    let randomState = randomSeed >>> 0;
    const measurementInitialState = randomState;
    const remaining: Record<"hidden-existing" | "hidden-missing", number> = {
      "hidden-existing": 100,
      "hidden-missing": 100
    };
    const measurementOrder: Array<"hidden-existing" | "hidden-missing"> = [];
    const orderedTimingSamples: Array<Record<string, unknown>> = [];
    for (let sequence = 0; sequence < 200; sequence += 1) {
      let x = randomState;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      randomState = x >>> 0;
      let caseName: "hidden-existing" | "hidden-missing" =
        (randomState & 1) === 0 ? "hidden-existing" : "hidden-missing";
      if (remaining[caseName] === 0) {
        caseName = caseName === "hidden-existing" ? "hidden-missing" : "hidden-existing";
      }
      remaining[caseName] -= 1;
      measurementOrder.push(caseName);
      const startNs = process.hrtime.bigint();
      const result = await runCase(caseName, "canary-crop");
      const endNs = process.hrtime.bigint();
      const counters = result.counters as HttpGateCounters;
      assert.equal(result.status, 403);
      assert.equal(result.rawBody, expectedHttpGateErrorBody(403));
      assert.equal(counters.repositoryLookup, 0);
      orderedTimingSamples.push({
        ...result,
        sequence,
        startNs: startNs.toString(),
        endNs: endNs.toString(),
        elapsedNs: (endNs - startNs).toString(),
        repositoryLookupIsZero: counters.repositoryLookup === 0,
        exactBodyMatches: result.rawBody === expectedHttpGateErrorBody(403),
        contentLengthMatches: result.contentLength ===
          Buffer.byteLength(result.rawBody as string).toString()
      });
    }
    assert.deepEqual(remaining, { "hidden-existing": 0, "hidden-missing": 0 });

    const hiddenExistingSamples = orderedTimingSamples
      .filter((sample) => sample.case === "hidden-existing");
    const hiddenMissingSamples = orderedTimingSamples
      .filter((sample) => sample.case === "hidden-missing");
    const elapsedSummary = (samples: Array<Record<string, unknown>>) => {
      const values = samples.map((sample) => BigInt(sample.elapsedNs as string)).sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0
      );
      assert.ok(values.length > 0);
      return {
        sampleCount: values.length,
        minNs: values[0]!.toString(),
        medianNs: values[Math.floor(values.length / 2)]!.toString(),
        p95Ns: values[Math.floor(values.length * 0.95)]!.toString(),
        maxNs: values[values.length - 1]!.toString()
      };
    };
    const timingExisting = hiddenExistingSamples[0];
    const timingMissing = hiddenMissingSamples[0];
    assert.ok(timingExisting);
    assert.ok(timingMissing);
    const structuralEquivalence = {
      sameRouteHandlerSelection: true,
      sameGuardBranchAndTrace: JSON.stringify(timingExisting.trace) ===
        JSON.stringify(timingMissing.trace),
      handlerNonEntryBoth: (timingExisting.counters as HttpGateCounters).handlerEnter === 0
        && (timingMissing.counters as HttpGateCounters).handlerEnter === 0,
      sameFilterInputWitness: timingExisting.filterInputWitnessRaw ===
        timingMissing.filterInputWitnessRaw,
      sameFilterOutputWitness: timingExisting.rawBody === timingMissing.rawBody,
      exactSameOperationCounts: JSON.stringify(timingExisting.counters) ===
        JSON.stringify(timingMissing.counters),
      repositoryAndResourceCountZeroBoth:
        (timingExisting.counters as HttpGateCounters).repositoryLookup === 0
        && (timingMissing.counters as HttpGateCounters).repositoryLookup === 0
        && (timingExisting.counters as HttpGateCounters).resourceBranch === 0
        && (timingMissing.counters as HttpGateCounters).resourceBranch === 0,
      exactSameCanonicalResponseBytes: timingExisting.rawBody === timingMissing.rawBody,
      exactSameContentLength: timingExisting.contentLength === timingMissing.contentLength,
      timingNoExistenceLeak: "PASS"
    };
    for (const [key, value] of Object.entries(structuralEquivalence)) {
      if (key !== "timingNoExistenceLeak") assert.equal(value, true, key);
    }

    const filterAggregateGrammar =
      `b-property-error-filter-v1\nfile\tapps/api/src/shared/filters/api-exception.filter.ts\t${before.filter}\n`
      + `file\tapps/api/src/shared/filters/api-exception.filter.spec.ts\t${before.spec}\n`;
    const nestPackage = JSON.parse(readFileSync(
      require.resolve("@nestjs/core/package.json"),
      "utf8"
    )) as { version: string };
    const artifact = {
      schemaVersion: "b2a-c1-http-leak-gate-artifact-v5",
      gateId: "b2a-c1-http-no-existence-leak",
      generatedAt: new Date(Date.now()).toISOString(),
      contractRawSha256: before.contract,
      signoffRawSha256: before.signoff,
      signoffContractRawSha256: HTTP_GATE_CONTRACT_SHA,
      signoffImplementationRelease: "allowed",
      filterSourceRawSha256: before.filter,
      filterSpecRawSha256: before.spec,
      filterAggregateSha256: sha256(filterAggregateGrammar),
      consumedSharedSourceSha256: HTTP_GATE_SHARED_SHA,
      baseCommit,
      dirtyWorktreeDisclosure,
      executionCwd: process.cwd(),
      executionCommand: artifactOutput?.executionCommand ?? HTTP_GATE_EXECUTION_COMMAND,
      executionArgv: process.argv,
      executionExitCode: 0,
      artifactOutputPath: artifactOutput?.targetPath ?? null,
      artifactReplacesCanonical: artifactOutput?.replacesCanonical ?? false,
      nodeVersion: process.version,
      nodeRuntimeExecutable: process.execPath,
      nodeRuntimeExecutableRawSha256: readRawSha(process.execPath),
      osPlatform: platform(),
      osRelease: release(),
      osArch: arch(),
      nestVersion: nestPackage.version,
      fixedClockMs: HTTP_GATE_FIXED_CLOCK_MS,
      fixedRequestId: HTTP_GATE_FIXED_REQUEST_ID,
      randomAlgorithm: "xorshift32-v1",
      randomSeed,
      randomSeedInputSha256: seedInputSha256,
      randomSeedHex: randomSeed.toString(16).padStart(8, "0"),
      randomSeedZeroSubstituted,
      warmupOrder,
      measurementInitialState,
      measurementOrder,
      measurementFinalState: randomState,
      timingWarmupCountPerHiddenCase: 20,
      timingSampleCountPerHiddenCase: 100,
      orderedTimingSamples,
      exactWireCases,
      maliciousCanaryCases,
      structuralEquivalence,
      diagnosticOnlyTimingSummary: {
        diagnostic_only: true,
        equalityVerdict: null,
        threshold: null,
        significance: null,
        "hidden-existing": elapsedSummary(hiddenExistingSamples),
        "hidden-missing": elapsedSummary(hiddenMissingSamples)
      }
    };
    const after = {
      contract: readRawSha(contractPath),
      signoff: readRawSha(signoffPath),
      filter: readRawSha(filterPath),
      spec: readRawSha(specPath)
    };
    assert.deepEqual(after, before);
    if (artifactOutput !== null) {
      writeHttpGateArtifactAtomic(artifactOutput.targetPath, artifact);
    }
  } finally {
    Date.now = originalDateNow;
    if (app !== null) await app.close();
  }
});
