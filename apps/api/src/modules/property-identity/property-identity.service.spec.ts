import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { LEGACY_MUTATION_RECEIPT_ACTION_AUTHORITY_MANIFEST } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  PROPERTY_IDENTITY_RECEIPT_ACTION_IDS,
  PropertyIdentityService
} from "./property-identity.service";

const scope = { tenantId: "tenant-1", parkId: "park-1" };
const actor: JwtPrincipal = {
  sub: "00000000-0000-4000-8000-000000000010",
  username: "operator",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: [
    "asset:identity-submissions:page",
    "party:read",
    "party:identity_update"
  ]
};
const partyId = "00000000-0000-4000-8000-000000000020";
const submissionId = "00000000-0000-4000-8000-000000000030";
const secondSubmissionId = "00000000-0000-4000-8000-000000000031";

function productionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(filePath);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts")
      ? [filePath]
      : [];
  });
}

test("identity receipt actions and explicit legacy contract version are frozen", () => {
  assert.deepEqual(PROPERTY_IDENTITY_RECEIPT_ACTION_IDS, [
    "party.identity.create-draft",
    "party.identity.update-draft",
    "party.identity.submit",
    "party.identity.claim",
    "party.identity.reassign",
    "party.identity.verify",
    "party.identity.withdraw"
  ]);

  const source = readFileSync(resolve(__dirname, "property-identity.service.ts"), "utf8");
  const callsiteActions = Array.from(source.matchAll(
    /this\.mutate\(\s*scope,\s*actor,\s*headerKey,\s*dto,\s*"([^"]+)"/gu
  ), (match) => match[1]);
  assert.equal(callsiteActions.length, 7);
  assert.deepEqual([...new Set(callsiteActions)].sort(),
    [...PROPERTY_IDENTITY_RECEIPT_ACTION_IDS].sort());

  const signedIdentityActions = LEGACY_MUTATION_RECEIPT_ACTION_AUTHORITY_MANIFEST
    .filter((row) => row.owner === "property-foundation-identity-owner")
    .map((row) => row.actionId);
  assert.deepEqual([...PROPERTY_IDENTITY_RECEIPT_ACTION_IDS].sort(),
    signedIdentityActions.sort());

  const receiptWriters = productionTypeScriptFiles(__dirname).flatMap((filePath) =>
    Array.from(readFileSync(filePath, "utf8").matchAll(
      /INSERT\s+INTO\s+public\.biz_property_mutation_receipt\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)/giu
    ), (match) => ({ filePath, columns: match[1] ?? "", values: match[2] ?? "" }))
  );
  assert.equal(receiptWriters.length, 1);
  assert.equal(receiptWriters[0]?.filePath,
    resolve(__dirname, "property-identity.service.ts"));
  assert.ok((receiptWriters[0]?.columns ?? "").split(",").map((value) => value.trim())
    .includes("receipt_contract_version"));
  assert.match(receiptWriters[0]?.values ?? "", /'legacy-v1'/u);
});

const frozenProjection = {
  id: submissionId,
  partyId,
  partyDisplayName: "Party",
  status: "draft" as const,
  version: 1,
  identityVersion: 1,
  submissionAttempt: 1,
  supersedesSubmissionId: null,
  verificationQueueId: null,
  verificationQueueName: null,
  assignedVerifierId: null,
  assignedVerifierDisplayName: null,
  assignmentVersion: 0,
  eligibilityPolicyHash: null,
  evidence: {
    documentType: null,
    identityNumberMasked: null,
    fileCount: 0,
    files: []
  },
  draftedAt: "2026-07-31T00:00:00.000Z",
  submittedAt: null,
  decidedAt: null,
  withdrawnAt: null,
  supersededAt: null,
  updateTime: "2026-07-31T00:00:00.000Z",
  allowedActions: []
};

function submissionRow(
  id: string,
  status: "draft" | "superseded",
  supersedesSubmissionId: string | null
) {
  return {
    id,
    party_id: partyId,
    party_display_name: "Party",
    status,
    version: status === "superseded" ? 3 : 1,
    identity_version: status === "superseded" ? 1 : 2,
    submission_attempt: 1,
    supersedes_submission_id: supersedesSubmissionId,
    verification_queue_id: null,
    verification_queue_name: null,
    assigned_verifier_id: null,
    assigned_verifier_display_name: null,
    assignment_version: 0,
    eligibility_policy_hash: null,
    eligibility_policy_snapshot: null,
    drafted_by: actor.sub,
    recorded_by: actor.sub,
    submitted_by: null,
    snapshot_id: null,
    document_type: null,
    encrypted_payload: null,
    identity_number_masked: null,
    drafted_at: new Date("2026-07-31T00:00:00Z"),
    submitted_at: null,
    decided_at: null,
    withdrawn_at: null,
    superseded_at: status === "superseded"
      ? new Date("2026-07-31T00:01:00Z")
      : null,
    update_time: new Date("2026-07-31T00:01:00Z"),
    files: []
  };
}

test("identity mutation rejects mismatched header and clientKey before transaction", async () => {
  let transactionCalls = 0;
  const dataSource = {
    transaction: async () => {
      transactionCalls += 1;
    }
  };
  const service = new PropertyIdentityService(dataSource as never, {} as never);
  await assert.rejects(
    () => service.create(scope, actor, "header-key", {
      clientKey: "body-key",
      partyId,
      expectedIdentityVersion: 0
    }),
    (error: unknown) => {
      const response = (error as { getResponse(): Record<string, unknown> }).getResponse();
      return response.errorCode === "property-validation-failed";
    }
  );
  assert.equal(transactionCalls, 0);
});

test("identity create uses receipt and the 000185 command function only", async () => {
  const sql: string[] = [];
  let requestHash = "";
  const projection = {
    id: submissionId,
    party_id: partyId,
    party_display_name: "Party",
    status: "draft",
    version: 1,
    identity_version: 1,
    submission_attempt: 1,
    supersedes_submission_id: null,
    verification_queue_id: null,
    verification_queue_name: null,
    assigned_verifier_id: null,
    assigned_verifier_display_name: null,
    assignment_version: 0,
    eligibility_policy_hash: null,
    eligibility_policy_snapshot: null,
    drafted_by: actor.sub,
    recorded_by: actor.sub,
    submitted_by: null,
    snapshot_id: null,
    document_type: null,
    encrypted_payload: null,
    identity_number_masked: null,
    drafted_at: new Date("2026-07-31T00:00:00Z"),
    submitted_at: null,
    decided_at: null,
    withdrawn_at: null,
    superseded_at: null,
    update_time: new Date("2026-07-31T00:00:00Z"),
    files: []
  };
  const manager = {
    query: async (statement: string, params: unknown[]) => {
      sql.push(statement);
      if (statement.includes("INSERT INTO public.biz_property_mutation_receipt")) {
        assert.match(statement, /request_hash,\s*receipt_contract_version\s*\)/);
        assert.match(statement, /\$7,'legacy-v1'\)/);
        requestHash = String(params[6]);
        return [{ id: "receipt-1" }];
      }
      if (statement.includes("SELECT request_hash,receipt_status,result_ref")) {
        return [{ request_hash: requestHash, receipt_status: "started", result_ref: null }];
      }
      if (statement.includes("fn_party_identity_create_draft_cas")) return [{ id: submissionId }];
      if (statement.includes("FROM public.biz_party_identity_submission s")) return [projection];
      if (statement.includes("biz_property_event_sequence")) return [{ sequence: 1 }];
      return [];
    }
  };
  const dataSource = {
    manager,
    transaction: async <T>(work: (value: typeof manager) => Promise<T>) => work(manager)
  };
  const sensitive = {
    decrypt: () => null,
    mask: () => null
  };
  const service = new PropertyIdentityService(dataSource as never, sensitive as never);
  const result = await service.create(scope, actor, "create-1", {
    clientKey: "create-1",
    partyId,
    expectedIdentityVersion: 0
  });
  assert.equal(result.id, submissionId);
  assert.ok(sql.some((statement) => statement.includes("fn_party_identity_create_draft_cas")));
  assert.ok(sql.some((statement) => statement.includes("biz_property_mutation_receipt")));
  assert.ok(sql.some((statement) => statement.includes("biz_property_outbox")));
});

test("super identity detail keeps the actor placeholder typed for PostgreSQL", async () => {
  let detailSql = "";
  const manager = {
    query: async (statement: string) => {
      detailSql = statement;
      return [submissionRow(submissionId, "draft", null)];
    }
  };
  const service = new PropertyIdentityService(
    { manager } as never,
    { decrypt: () => null, mask: () => null } as never
  );

  const result = await service.detail(scope, { ...actor, isSuper: true }, submissionId);

  assert.equal(result.id, submissionId);
  assert.match(detailSql, /\$3::uuid IS NOT NULL/);
});

test("identity runtime source never directly mutates 000185 authority tables", () => {
  const source = readFileSync(
    resolve(__dirname, "property-identity.service.ts"),
    "utf8"
  );
  for (const table of [
    "biz_party_identity_submission",
    "biz_party_identity_snapshot",
    "rel_party_identity_snapshot_file",
    "rel_party_identity_draft_file",
    "biz_party_identity_assignment_audit",
    "biz_party_identity_decision"
  ]) {
    assert.doesNotMatch(source, new RegExp(`(?:INSERT\\\\s+INTO|UPDATE|DELETE\\\\s+FROM)\\\\s+public\\\\.${table}`, "i"));
  }
  for (const fn of [
    "fn_party_identity_create_draft_cas",
    "fn_party_identity_update_draft_cas",
    "fn_party_identity_submit_cas",
    "fn_party_identity_withdraw_cas",
    "fn_party_identity_assignment_cas",
    "fn_party_identity_decision_cas"
  ]) {
    assert.match(source, new RegExp(fn));
  }
});

test("party identity summary gates masked evidence and canonical deep link independently", async () => {
  const manager = {
    query: async () => [{
      party_id: partyId,
      identity_version: 2,
      current_identity_submission_id: submissionId,
      current_verified_submission_id: null,
      identity_document_type: "id_card",
      identity_number_masked: "11************02",
      status: "pending_verification",
      update_time: new Date("2026-07-31T00:00:00Z")
    }]
  };
  const service = new PropertyIdentityService(
    { manager } as never,
    {} as never
  );

  const visible = await service.partyIdentitySummary(
    manager as never,
    scope,
    [partyId],
    actor
  );
  assert.equal(
    visible.get(partyId)?.submissionDeepLink,
    `/assets/identity-submissions/${submissionId}`
  );
  assert.equal(visible.get(partyId)?.identityNumberMasked, null);

  const sensitiveOnly = await service.partyIdentitySummary(
    manager as never,
    scope,
    [partyId],
    {
      ...actor,
      permissions: ["party:sensitive_read"]
    }
  );
  assert.equal(sensitiveOnly.get(partyId)?.submissionDeepLink, null);
  assert.equal(
    sensitiveOnly.get(partyId)?.identityNumberMasked,
    "11************02"
  );
});

test("completed receipt replays the frozen first response without reading current submission", async () => {
  let requestHash = "";
  let projectionReads = 0;
  const manager = {
    query: async (statement: string, params: unknown[]) => {
      if (statement.includes("INSERT INTO public.biz_property_mutation_receipt")) {
        requestHash = String(params[6]);
        return [];
      }
      if (statement.includes("SELECT request_hash,receipt_status,result_ref")) {
        return [{
          request_hash: requestHash,
          receipt_status: "completed",
          result_ref: "00000000-0000-4000-8000-000000000099"
        }];
      }
      if (statement.includes("payload->'response'")) {
        return [{ response: frozenProjection }];
      }
      if (statement.includes("FROM public.biz_party_identity_submission")) {
        projectionReads += 1;
      }
      return [];
    }
  };
  const service = new PropertyIdentityService({
    transaction: async <T>(work: (value: typeof manager) => Promise<T>) => work(manager)
  } as never, {} as never);

  const result = await service.create(scope, actor, "replay-key", {
    clientKey: "replay-key",
    partyId,
    expectedIdentityVersion: 0
  });
  assert.deepEqual(result, frozenProjection);
  assert.equal(projectionReads, 0);
});

test("superseding create appends the old superseded event and the new draft event", async () => {
  let requestHash = "";
  const eventTypes: string[] = [];
  const oldSubmissionId = submissionId;
  const manager = {
    query: async (statement: string, params: unknown[]) => {
      if (statement.includes("INSERT INTO public.biz_property_mutation_receipt")) {
        requestHash = String(params[6]);
        return [{ id: "receipt-1" }];
      }
      if (statement.includes("SELECT request_hash,receipt_status,result_ref")) {
        return [{ request_hash: requestHash, receipt_status: "started", result_ref: null }];
      }
      if (statement.includes("fn_party_identity_create_draft_cas")) {
        return [{ id: secondSubmissionId }];
      }
      if (statement.includes("FROM public.biz_party_identity_submission s")) {
        return params.length === 3
          ? [submissionRow(oldSubmissionId, "superseded", null)]
          : [submissionRow(secondSubmissionId, "draft", oldSubmissionId)];
      }
      if (statement.includes("biz_property_event_sequence")) return [{ sequence: 1 }];
      if (statement.includes("INSERT INTO public.biz_property_outbox")) {
        eventTypes.push(String(params[3]));
      }
      return [];
    }
  };
  const service = new PropertyIdentityService({
    transaction: async <T>(work: (value: typeof manager) => Promise<T>) => work(manager)
  } as never, {
    decrypt: () => null,
    mask: () => null
  } as never);

  await service.create(scope, actor, "supersede-key", {
    clientKey: "supersede-key",
    partyId,
    expectedIdentityVersion: 1,
    supersedesSubmissionId: oldSubmissionId,
    expectedSupersededStatus: "verified",
    expectedSupersededVersion: 2
  });
  assert.deepEqual(eventTypes, [
    "party.identity.superseded",
    "party.identity.draft-created"
  ]);
});

test("check-in verifier locks snapshot references then files in stable UUID order", async () => {
  const statements: string[] = [];
  const paramsLog: unknown[][] = [];
  const manager = {
    query: async (statement: string, params: unknown[]) => {
      statements.push(statement);
      paramsLog.push(params);
      if (statement.includes("FROM public.biz_party p")) {
        return [{
          party_id: partyId,
          submission_id: submissionId,
          submission_version: 4,
          snapshot_id: secondSubmissionId,
          identity_version: 2,
          document_type: "id_card",
          hash_algorithm: "hmac-sha256",
          hash_version: 1,
          verified_at: "2026-07-31T00:00:00.000Z"
        }];
      }
      if (statement.includes("rel_party_identity_snapshot_file")) {
        return [{
          id: "00000000-0000-4000-8000-000000000041",
          snapshot_id: secondSubmissionId,
          file_id: "00000000-0000-4000-8000-000000000051",
          file_version: 3,
          content_sha256: "a".repeat(64),
          ordinal: 0
        }];
      }
      return [{
        id: "00000000-0000-4000-8000-000000000051",
        version: 3,
        content_sha256: "a".repeat(64),
        status: 1,
        is_deleted: false
      }];
    }
  };
  const service = new PropertyIdentityService({} as never, {} as never);
  const result = await service.verifyForCheckIn({
    manager: manager as never,
    scope,
    bookingId: "00000000-0000-4000-8000-000000000060",
    partyIds: [partyId, partyId],
    expectedConsent: "granted"
  });

  assert.equal(result.length, 1);
  assert.match(statements[0]!, /ORDER BY p\.id[\s\S]*FOR UPDATE OF p,s,snapshot/);
  assert.match(statements[1]!, /ORDER BY snapshot_id,id[\s\S]*FOR UPDATE/);
  assert.match(statements[2]!, /ORDER BY id[\s\S]*FOR UPDATE/);
  assert.deepEqual(paramsLog[1]?.[2], [secondSubmissionId]);
  assert.deepEqual(paramsLog[2]?.[2], ["00000000-0000-4000-8000-000000000051"]);
});

test("check-in verifier fails closed when a frozen file digest drifts", async () => {
  const manager = {
    query: async (statement: string) => {
      if (statement.includes("FROM public.biz_party p")) {
        return [{
          party_id: partyId,
          submission_id: submissionId,
          submission_version: 4,
          snapshot_id: secondSubmissionId,
          identity_version: 2,
          document_type: "id_card",
          hash_algorithm: "hmac-sha256",
          hash_version: 1,
          verified_at: "2026-07-31T00:00:00.000Z"
        }];
      }
      if (statement.includes("rel_party_identity_snapshot_file")) {
        return [{
          id: "00000000-0000-4000-8000-000000000041",
          snapshot_id: secondSubmissionId,
          file_id: "00000000-0000-4000-8000-000000000051",
          file_version: 3,
          content_sha256: "a".repeat(64),
          ordinal: 0
        }];
      }
      return [{
        id: "00000000-0000-4000-8000-000000000051",
        version: 3,
        content_sha256: "b".repeat(64),
        status: 1,
        is_deleted: false
      }];
    }
  };
  const service = new PropertyIdentityService({} as never, {} as never);
  await assert.rejects(
    service.verifyForCheckIn({
      manager: manager as never,
      scope,
      bookingId: "00000000-0000-4000-8000-000000000060",
      partyIds: [partyId],
      expectedConsent: "granted"
    }),
    (error: unknown) => {
      const response = (error as { getResponse(): Record<string, unknown> }).getResponse();
      return response.errorCode === "identity-snapshot-stale";
    }
  );
});

test("reassign target requires current access, frozen policy and maker exclusion", async () => {
  const targetId = "00000000-0000-4000-8000-000000000070";
  let maker = false;
  const manager = {
    query: async (statement: string) => {
      assert.match(statement, /asset_assignment[\s\S]*permission\.code=ANY/);
      return [{
        eligibility_policy_snapshot: {
          requiredPermissions: [
            "asset:identity-submissions:page",
            "party:identity_verify"
          ],
          requiredModules: ["asset"],
          relationScope: "tenant-park-current",
          dataScope: "party-submission",
          actorExclusions: ["maker"],
          eligibleVerifierUserIds: [targetId]
        },
        drafted_by: maker ? targetId : actor.sub,
        recorded_by: actor.sub,
        submitted_by: actor.sub
      }];
    }
  };
  const service = new PropertyIdentityService({} as never, {} as never);
  const access = service as unknown as {
    assertVerifierPermission(
      manager: unknown,
      inputScope: typeof scope,
      submissionId: string,
      userId: string
    ): Promise<void>;
  };
  await access.assertVerifierPermission(manager, scope, submissionId, targetId);
  maker = true;
  await assert.rejects(
    access.assertVerifierPermission(manager, scope, submissionId, targetId),
    (error: unknown) => {
      const response = (error as { getResponse(): Record<string, unknown> }).getResponse();
      return response.errorCode === "property-action-forbidden";
    }
  );
});
