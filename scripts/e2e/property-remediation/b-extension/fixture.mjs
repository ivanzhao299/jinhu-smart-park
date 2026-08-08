import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalize, hashCanonical, sha256 } from "../lib/canonical.mjs";
import { rowsForTable } from "../lib/profile.mjs";
import { uuidV5 } from "../lib/uuid-v5.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
export const EXTENSION_PROFILE_PATH = resolve(directory, "b-extension-v1.json");
export const EXPECTED_MUTATIONS_PATH = resolve(directory, "expected-mutations-v1.json");

export const EXTENSION_TABLES = Object.freeze({
  identity_queue: "biz_party_identity_verification_queue",
  identity_snapshot: "biz_party_identity_snapshot",
  identity_submission: "biz_party_identity_submission",
  approval_request: "biz_property_approval_request",
  approval_stage: "biz_property_approval_stage",
  approval_decision: "biz_property_approval_decision",
  approval_audit: "biz_property_approval_audit",
  effect_manifest: "biz_property_execution_effect_manifest",
  effect_receipt: "biz_property_execution_effect_receipt",
  mutation_receipt: "biz_property_mutation_receipt",
  task_assignment: "biz_property_task_assignment",
  task_projection_head: "biz_property_task_projection_head",
  task_projection: "biz_property_task_projection",
  task_projection_rebuild_audit: "biz_property_task_projection_rebuild_audit",
  outbox: "biz_property_outbox",
  inbox: "biz_property_inbox",
  notification: "biz_property_notification",
  notification_recipient: "rel_property_notification_recipient",
  notification_delivery: "biz_property_notification_delivery",
  event_dlq: "biz_property_event_dlq"
});

export const EXTENSION_TABLE_ORDER = Object.freeze(Object.keys(EXTENSION_TABLES));

export const SERVICE_NEGATIVE_SCENARIOS = Object.freeze([
  "maker_checker_self_approval", "expired_source_version", "out_of_order_event",
  "stale_claim_epoch_token", "outbox_publish_crash", "dlq_replay_once",
  "task_claim_race", "approval_execution_lease_reclaim"
]);

export const SQL_NEGATIVE_SCENARIOS = Object.freeze([
  "cross_tenant_scope", "cross_park_scope", "inbox_duplicate"
]);
const PROFILE_RAW_SHA256 = "4e577ed40246ff85a169d9c43f8b6eddcbed3bdb32d97fefc7b66e4ebb790ff9";

function requireExactKeys(value, expected, label) {
  assertObject(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalize(actual) !== canonicalize(wanted)) {
    throw new Error(`${label} keys mismatch:${canonicalize(actual)}`);
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

export function loadExtensionProfile(path = EXTENSION_PROFILE_PATH) {
  const bytes = readFileSync(path);
  if (sha256(bytes) !== PROFILE_RAW_SHA256) {
    throw new Error("B-extension profile raw contract drift");
  }
  const profile = JSON.parse(bytes.toString("utf8"));
  requireExactKeys(profile, [
    "schema_version", "profile", "profile_version", "generator_version", "seed",
    "business_clock", "timezone", "uuid_namespace", "scope_marker", "a_base",
    "expected_counts", "identity_statuses", "approval_matrix", "task_statuses",
    "outbox_statuses", "delivery_statuses", "event_incident_statuses",
    "negative_scenarios"
  ], "B-extension profile");
  if (profile.schema_version !== "property-remediation-b-extension-profile-v1"
    || profile.profile !== "property-remediation-b-extension-v1"
    || profile.profile_version !== 1
    || profile.generator_version !== "b-extension-generator-v1") {
    throw new Error("B-extension profile identity drift");
  }
  requireExactKeys(profile.expected_counts, EXTENSION_TABLE_ORDER, "expected_counts");
  for (const table of EXTENSION_TABLE_ORDER) {
    if (!Number.isInteger(profile.expected_counts[table]) || profile.expected_counts[table] < 1) {
      throw new Error(`invalid B-extension expected count:${table}`);
    }
  }
  if (canonicalize(profile.identity_statuses) !== canonicalize(
    ["draft", "pending_verification", "verified", "rejected", "withdrawn", "superseded"]
  )) throw new Error("identity status matrix drift");
  if (profile.approval_matrix.length !== 11
    || profile.task_statuses.length !== 6
    || profile.delivery_statuses.length !== 5
    || profile.event_incident_statuses.length !== 4) {
    throw new Error("B-extension state matrix cardinality drift");
  }
  const scenarioBindings = profile.negative_scenarios;
  if (!Array.isArray(scenarioBindings) || scenarioBindings.length !== 11) {
    throw new Error("B-extension scenario evidence cardinality drift");
  }
  for (const binding of scenarioBindings) {
    const sql = binding.kind === "sql";
    requireExactKeys(binding, sql
      ? ["scenario", "evidence_id", "kind", "probe"]
      : ["scenario", "evidence_id", "kind", "target"], "negative scenario evidence");
    if (!/^[a-z][a-z0-9_]*$/u.test(binding.scenario)
      || !["service", "pg", "sql"].includes(binding.kind)
      || !new RegExp(`^${binding.kind === "service" ? "svc" : binding.kind}:`, "u")
        .test(binding.evidence_id)
      || typeof (sql ? binding.probe : binding.target) !== "string"
      || !(sql ? binding.probe : binding.target).trim()) {
      throw new Error("invalid negative scenario evidence semantics");
    }
  }
  if (new Set(scenarioBindings.map((item) => item.scenario)).size !== 11
    || new Set(scenarioBindings.map((item) => item.evidence_id)).size !== 11
    || canonicalize(scenarioBindings.map((item) => item.scenario).sort()) !== canonicalize(
    [...SERVICE_NEGATIVE_SCENARIOS, ...SQL_NEGATIVE_SCENARIOS].sort()
  )) throw new Error("B-extension negative scenario contract drift");
  return Object.freeze(profile);
}

export function loadExpectedMutations(path = EXPECTED_MUTATIONS_PATH) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  requireExactKeys(value,
    ["schema_version", "profile", "profile_version", "expected_mutations"],
    "expected mutations");
  if (value.schema_version !== "property-remediation-b-extension-expected-mutations-v1"
    || value.profile !== "property-remediation-b-extension-v1"
    || value.profile_version !== 1
    || !Array.isArray(value.expected_mutations)
    || value.expected_mutations.length !== 0) {
    throw new Error("B-extension v1 expected mutations must remain an exact empty set");
  }
  return Object.freeze(value);
}

function id(profile, kind, index = 0) {
  return uuidV5(`${profile.seed}:${kind}:${index}`, profile.uuid_namespace);
}

function at(clock, seconds) {
  return new Date(Date.parse(clock) + seconds * 1000).toISOString();
}

function firstRows(profile, table, count) {
  const rows = [];
  for (const row of rowsForTable(profile, table)) {
    rows.push(row);
    if (rows.length === count) break;
  }
  if (rows.length !== count) throw new Error(`A-base lacks ${count} ${table} rows`);
  return rows;
}

export function rowsForExtensionTable(extension, aBaseProfile, logicalName) {
  if (!Object.hasOwn(EXTENSION_TABLES, logicalName)) {
    throw new Error(`unknown B-extension logical table:${logicalName}`);
  }
  const clock = extension.business_clock;
  const tenantId = firstRows(aBaseProfile, "party", 1)[0].tenant_id;
  const parkId = firstRows(aBaseProfile, "party", 1)[0].park_id;
  const parties = firstRows(aBaseProfile, "party", 6);
  const actor = (kind, index = 0) => id(extension, `actor-${kind}`, index);
  const digest = (kind, index = 0) => hashCanonical({ profile: extension.profile, kind, index });
  const queueId = id(extension, "identity-queue");

  if (logicalName === "identity_queue") {
    return [{
      id: queueId, tenant_id: tenantId, park_id: parkId,
      queue_code: "b2b-core-verification", display_name: "B2b Core Verification",
      status: "active", eligibility_policy_version: 1,
      eligibility_policy_snapshot: { profile: extension.profile, makerChecker: true },
      eligibility_policy_hash: digest("identity-policy"), legacy_backfill: false,
      legacy_anomaly: false, version: 1, create_time: clock, update_time: clock
    }];
  }

  if (logicalName === "identity_snapshot") {
    return [1, 2, 3, 4].map((index) => ({
      id: id(extension, "identity-snapshot", index), tenant_id: tenantId,
      park_id: parkId, party_id: parties[index].id, identity_version: 1,
      snapshot_revision: 1, document_type: "resident_id",
      normalized_identity_hash: digest("identity", index), hash_algorithm: "hmac-sha256",
      hash_version: 1, encrypted_payload: `test-only:${digest("payload", index)}`,
      encryption_key_id: "b2b-test-key-v1", payload_format_version: 1,
      captured_by: actor("recorder"), captured_at: at(clock, index),
      source: "test_fixture_b2b", confidence: "high", legacy_backfill: false,
      legacy_actor_anomaly: false, create_time: at(clock, index)
    }));
  }

  if (logicalName === "identity_submission") {
    return extension.identity_statuses.map((status, index) => {
      const frozen = !["draft", "superseded"].includes(status);
      const decided = ["verified", "rejected"].includes(status);
      return {
        id: id(extension, "identity-submission", index), tenant_id: tenantId,
        park_id: parkId, party_id: parties[index].id, identity_version: 1,
        submission_attempt: 1,
        snapshot_id: frozen ? id(extension, "identity-snapshot", index) : null,
        supersedes_submission_id: null,
        verification_queue_id: frozen ? queueId : null,
        assigned_verifier_id: status === "pending_verification" ? actor("verifier") : null,
        assignment_version: status === "pending_verification" ? 1 : 0,
        eligibility_policy_snapshot: frozen ? { profile: extension.profile, version: 1 } : null,
        eligibility_policy_hash: frozen ? digest("identity-policy") : null,
        draft_hash_algorithm: "hmac-sha256", draft_hash_version: 1,
        draft_encryption_key_id: "b2b-test-key-v1", draft_payload_format_version: 1,
        status, drafted_by: actor("maker", index), recorded_by: actor("recorder"),
        submitted_by: frozen ? actor("maker", index) : null,
        decided_by: decided ? actor("verifier") : null,
        withdrawn_by: status === "withdrawn" ? actor("maker", index) : null,
        superseded_by: status === "superseded" ? actor("recorder") : null,
        drafted_at: at(clock, index), submitted_at: frozen ? at(clock, 20 + index) : null,
        decided_at: decided ? at(clock, 40 + index) : null,
        withdrawn_at: status === "withdrawn" ? at(clock, 50 + index) : null,
        superseded_at: status === "superseded" ? at(clock, 60 + index) : null,
        decision_reason: status === "rejected" ? "fixture rejection" : null,
        source: "test_fixture_b2b", confidence: "high", legacy_backfill: false,
        legacy_actor_anomaly: false, version: 1,
        create_time: at(clock, index), update_time: at(clock, 60 + index)
      };
    });
  }

  if (logicalName === "approval_request") {
    return extension.approval_matrix.map(([decisionStatus, executionStatus], index) => {
      const executing = executionStatus === "executing";
      const failed = executionStatus === "execution_failed";
      const exhausted = executionStatus === "infra_exhausted";
      return {
        id: id(extension, "approval", index), tenant_id: tenantId, park_id: parkId,
        action_id: "property.mode_transition.request", source_type: "test_fixture_b2b",
        source_id: id(extension, "approval-source", index), source_expected_version: 1,
        requester_id: actor("maker", index), submitter_id: actor("maker", index),
        client_idempotency_key: `b2b-client-${index}`,
        business_intent_key: `b2b-intent-${index}`,
        canonical_payload: { profile: extension.profile, scenario: index },
        payload_schema_version: 1, payload_hash: digest("approval-payload", index),
        amount: null, currency: null, policy_id: id(extension, "approval-policy"),
        policy_version: 1, policy_hash: digest("approval-policy"),
        decision_status: decisionStatus, execution_status: executionStatus,
        decision_version: 1, execution_version: 1,
        execution_idempotency_key: `b2b-execution-${index}`,
        claim_epoch: executing ? 1 : 0,
        claim_token: executing ? id(extension, "approval-claim", index) : null,
        worker_id: executing ? "b2b-worker" : null,
        lease_expires_at: executing ? at(clock, 3600) : null,
        heartbeat_at: executing ? at(clock, 120) : null,
        attempt_count: ["retry_wait", "execution_failed"].includes(executionStatus) ? 1
          : exhausted ? 8 : executionStatus === "executed" ? 1 : 0,
        next_retry_at: executionStatus === "retry_wait" ? at(clock, 600) : null,
        reconcile_required: exhausted,
        last_error_category: failed ? "domain" : exhausted ? "infra" : null,
        last_error_code: failed ? "B2B_DOMAIN_FAILURE" : exhausted ? "B2B_INFRA_EXHAUSTED" : null,
        last_error_redacted_message: failed || exhausted ? "fixture failure" : null,
        infra_exhausted_at: exhausted ? at(clock, 700) : null,
        submitted_at: decisionStatus === "draft" ? null : at(clock, 10),
        decided_at: ["approved", "rejected"].includes(decisionStatus) ? at(clock, 20) : null,
        executed_at: executionStatus === "executed" ? at(clock, 30) : null,
        created_at: at(clock, index), updated_at: at(clock, 100 + index)
      };
    });
  }

  const executedApproval = rowsForExtensionTable(extension, aBaseProfile, "approval_request")[5];
  const approvalStageId = id(extension, "approval-stage");
  const effectManifestId = id(extension, "effect-manifest");
  if (logicalName === "approval_stage") {
    return [{
      id: approvalStageId, tenant_id: tenantId, park_id: parkId,
      request_id: executedApproval.id, stage_code: "fixture-check", stage_ordinal: 1,
      eligibility_policy_snapshot: { permission: "property_approval:decide" },
      eligibility_policy_version: 1, eligibility_policy_hash: digest("stage-policy"),
      required_count: 1, approved_count: 1, rejected_count: 0,
      stage_status: "approved", version: 1, created_at: at(clock, 21)
    }];
  }
  if (logicalName === "approval_decision") {
    return [{
      id: id(extension, "approval-decision"), tenant_id: tenantId, park_id: parkId,
      request_id: executedApproval.id, stage_id: approvalStageId,
      actor_id: actor("checker"), decision: "approve", reason: null,
      actor_permission_snapshot: { permissions: ["property_approval:decide"] },
      decision_payload_hash: digest("approval-decision"), decided_at: at(clock, 22),
      supersedes_decision_id: null
    }];
  }
  if (logicalName === "approval_audit") {
    return [{
      id: id(extension, "approval-audit"), tenant_id: tenantId, park_id: parkId,
      request_id: executedApproval.id, actor_id: actor("executor"),
      action_id: "property.execution.executed", from_decision_status: "approved",
      to_decision_status: "approved", from_execution_status: "executing",
      to_execution_status: "executed", decision_version: 1, execution_version: 1,
      incident_id: null, reason: "fixture closure", payload_hash: digest("approval-audit"),
      occurred_at: at(clock, 31)
    }];
  }
  if (logicalName === "effect_manifest") {
    return [{
      id: effectManifestId, tenant_id: tenantId, park_id: parkId,
      request_id: executedApproval.id, effect_kind: "property.mode.transition",
      effect_ordinal: 0, effect_line_key: "fixture-line-0",
      owning_table: "biz_property_mode_transition_log",
      owning_unique_name: "uq_fixture_mode_transition", expected_cardinality: 1,
      line_amount: null, currency: null, invariant_hash: digest("effect-invariant"),
      created_at: at(clock, 28)
    }];
  }
  if (logicalName === "effect_receipt") {
    return [{
      id: id(extension, "effect-receipt"), tenant_id: tenantId, park_id: parkId,
      request_id: executedApproval.id, manifest_id: effectManifestId,
      execution_idempotency_key: executedApproval.execution_idempotency_key,
      effect_kind: "property.mode.transition", effect_ordinal: 0,
      effect_line_key: "fixture-line-0", domain_table: "biz_property_mode_transition_log",
      domain_row_id: id(extension, "effect-domain-row"), effect_hash: digest("effect-invariant"),
      line_amount: null, currency: null, created_at: at(clock, 30),
      owning_unique_name: "uq_fixture_mode_transition",
      unique_key_hash: digest("effect-unique-key"), observed_cardinality: 1
    }];
  }
  const rebuildSourceType = "test_fixture_b2b";
  const rebuildSourceId = id(extension, "task-source", 0);
  const rebuildResultRef = `property-task-rebuild/${rebuildSourceType}/${rebuildSourceId}/v1`;
  const rebuildIdentity = `property-task-source-rebuild:${Buffer.byteLength(rebuildSourceType)}:`
    + `${rebuildSourceType}:${rebuildSourceId}`;
  const rebuildResultHash = sha256(`property-mutation-result-v1\nproperty.task.rebuild\t`
    + `${rebuildSourceId}\t${rebuildIdentity}\t${rebuildResultRef}\t1\n`);
  const mutationReceiptId = id(extension, "mutation-receipt");
  if (logicalName === "mutation_receipt") {
    return [{
      id: mutationReceiptId, tenant_id: tenantId, park_id: parkId,
      actor_id: actor("rebuilder"), action_id: "property.task.rebuild",
      target_id: rebuildSourceId, client_key: "fixture-task-rebuild-v1",
      request_hash: digest("task-rebuild-request"), receipt_status: "completed",
      result_ref: rebuildResultRef, result_hash: rebuildResultHash,
      created_at: at(clock, 700), completed_at: at(clock, 701),
      receipt_contract_version: "port-v2", identity_kind: "property-task-source-rebuild",
      business_occurrence_key: null, task_key: null,
      identity_source_type: rebuildSourceType, result_version: 1
    }];
  }

  if (logicalName === "task_assignment") {
    return extension.task_statuses.map((status, index) => {
      const active = ["claimed", "in_progress", "blocked"].includes(status);
      const terminal = ["closed", "cancelled"].includes(status);
      return {
        id: id(extension, "task", index), tenant_id: tenantId, park_id: parkId,
        task_key: `b2b:${status}:${index}`, task_key_version: 1,
        task_kind: "property_fixture", source_type: "test_fixture_b2b",
        source_id: id(extension, "task-source", index), source_version_at_generation: 1,
        assignment_status: status, assignee_id: active ? actor("assignee", index) : null,
        claim_epoch: active ? 1 : 0,
        claim_token: active ? id(extension, "task-claim", index) : null,
        version: 1, claimed_at: active ? at(clock, 20 + index) : null,
        started_at: ["in_progress", "blocked"].includes(status) ? at(clock, 30 + index) : null,
        blocked_reason: status === "blocked" ? "fixture blocked" : null,
        blocked_until: status === "blocked" ? at(clock, 3600) : null,
        outcome_code: terminal ? `fixture_${status}` : null,
        outcome_source_version: terminal ? 1 : null,
        outcome_at: terminal ? at(clock, 60 + index) : null,
        created_at: at(clock, index), updated_at: at(clock, 100 + index), is_deleted: false
      };
    });
  }

  const openTask = rowsForExtensionTable(extension, aBaseProfile, "task_assignment")[0];
  const projectionHeadId = id(extension, "task-projection-head");
  const projectionContentHash = digest("task-projection-content");
  if (logicalName === "task_projection_head") {
    return [{
      id: projectionHeadId, tenant_id: tenantId, park_id: parkId,
      source_type: openTask.source_type, source_id: openTask.source_id,
      projection_version: 1, content_hash: projectionContentHash,
      last_rebuilt_at: at(clock, 701), last_rebuilt_by: actor("rebuilder"),
      created_at: at(clock, 700), updated_at: at(clock, 701)
    }];
  }
  if (logicalName === "task_projection") {
    return [{
      id: id(extension, "task-projection"), tenant_id: tenantId, park_id: parkId,
      head_id: projectionHeadId, task_id: openTask.id, task_key: digest("projection-task-key"),
      assignment_authority: "derived", derived_assignment_id: openTask.id,
      source_type: openTask.source_type, source_id: openTask.source_id,
      source_version: 1, business_occurrence_key: "fixture-occurrence-0",
      task_kind: openTask.task_kind, queue_code: "property.fixture",
      title: "Fixture task", kind_label: "Fixture", source_label: "B-extension",
      priority: 50, due_at: null, assignment_status: "open", assignment_version: 1,
      assignee_id: null, assignee_display: null, claimed_at: null, started_at: null,
      blocked_reason: null, blocked_until: null, outcome_code: null,
      outcome_source_version: null, outcome_at: null, source_deep_link: "/property/fixture",
      projection_version: 1, content_hash: projectionContentHash,
      created_at: at(clock, 700), updated_at: at(clock, 701)
    }];
  }
  if (logicalName === "task_projection_rebuild_audit") {
    return [{
      id: id(extension, "task-rebuild-audit"), tenant_id: tenantId, park_id: parkId,
      head_id: projectionHeadId, source_type: openTask.source_type,
      source_id: openTask.source_id, actor_id: actor("rebuilder"),
      mutation_receipt_id: mutationReceiptId, replace_mode: "manual-rebuild",
      command_action: "property.task.rebuild", from_projection_version: 0,
      to_projection_version: 1, business_result_version: 1, projected_task_count: 1,
      assignment_mutation_count: 0, reason: "fixture rebuild",
      request_hash: digest("task-rebuild-request"), result_ref: rebuildResultRef,
      result_hash: rebuildResultHash, content_hash: projectionContentHash,
      occurred_at: at(clock, 701)
    }];
  }

  if (logicalName === "outbox") {
    return extension.outbox_statuses.map((status, index) => ({
      event_id: id(extension, "event", index), tenant_id: tenantId, park_id: parkId,
      event_type: "property.fixture.v1", event_version: 1,
      aggregate_type: "property_fixture", aggregate_id: id(extension, "event-aggregate", index),
      aggregate_version: 1, ordering_key: `b2b:${index}`, sequence: 1,
      event_ordinal: 0, approval_request_id: null, execution_idempotency_key: null,
      payload: { profile: extension.profile, index }, payload_hash: digest("event-payload", index),
      status, claim_epoch: status === "publishing" ? 1 : 0,
      claim_token: status === "publishing" ? id(extension, "outbox-claim", index) : null,
      worker_id: status === "publishing" ? "b2b-publisher" : null,
      lease_expires_at: status === "publishing" ? at(clock, 3600) : null,
      attempt_count: ["retry_wait", "dlq"].includes(status) ? 1 : 0,
      next_retry_at: status === "retry_wait" ? at(clock, 600) : null,
      published_at: status === "published" ? at(clock, 120) : null,
      dlq_at: status === "dlq" ? at(clock, 180) : null,
      created_at: at(clock, index)
    }));
  }

  const outbox = rowsForExtensionTable(extension, aBaseProfile, "outbox");
  if (logicalName === "inbox") {
    const event = outbox[3];
    return [{
      id: id(extension, "inbox"), tenant_id: tenantId, park_id: parkId,
      consumer_name: "b2b-projection", consumer_version: 1, event_id: event.event_id,
      event_type: event.event_type, event_version: 1, ordering_key: event.ordering_key,
      sequence: event.sequence, payload_hash: event.payload_hash,
      result_hash: digest("inbox-result"), result_reference: "fixture:once",
      handled_at: at(clock, 240)
    }];
  }
  if (logicalName === "notification") {
    return outbox.map((event, index) => ({
      id: id(extension, "notification", index), tenant_id: tenantId, park_id: parkId,
      source_event_id: event.event_id, notification_type: "property_fixture",
      projection_version: 1, title: `Fixture notification ${index}`,
      summary: `B-extension ${index}`, severity: index === 4 ? "critical" : "info",
      route_key: "property.fixture", route_params: { index },
      payload_hash: digest("notification", index), created_at: at(clock, 300 + index),
      retention_until: at(clock, 86400)
    }));
  }
  if (logicalName === "notification_recipient") {
    return [0, 1, 2, 3, 4].map((index) => ({
      id: id(extension, "recipient", index), tenant_id: tenantId, park_id: parkId,
      notification_id: id(extension, "notification", index),
      recipient_user_id: actor("recipient", index), recipient_relation_version: 1,
      recipient_bundle_snapshot: { profile: extension.profile }, read_status: "unread",
      read_version: 1, read_at: null, created_at: at(clock, 320 + index)
    }));
  }
  if (logicalName === "notification_delivery") {
    return extension.delivery_statuses.map((status, index) => ({
      id: id(extension, "delivery", index), tenant_id: tenantId, park_id: parkId,
      recipient_id: id(extension, "recipient", index), channel: "in_app",
      delivery_status: status, version: 1,
      attempt_count: status === "delivery_exhausted" ? 8
        : ["delivering", "delivered", "delivery_failed"].includes(status) ? 1 : 0,
      max_attempts: 8, claim_epoch: status === "delivering" ? 1 : 0,
      claim_token: status === "delivering" ? id(extension, "delivery-claim", index) : null,
      lease_expires_at: status === "delivering" ? at(clock, 3600) : null,
      next_retry_at: status === "delivery_failed" ? at(clock, 600) : null,
      delivered_at: status === "delivered" ? at(clock, 400) : null,
      failed_at: ["delivery_failed", "delivery_exhausted"].includes(status) ? at(clock, 400) : null,
      exhausted_at: status === "delivery_exhausted" ? at(clock, 500) : null,
      last_error_code: ["delivery_failed", "delivery_exhausted"].includes(status)
        ? "B2B_DELIVERY_FAILURE" : null
    }));
  }
  if (logicalName === "event_dlq") {
    return extension.event_incident_statuses.map((status, index) => ({
      id: id(extension, "dlq", index), tenant_id: tenantId, park_id: parkId,
      original_event_id: outbox[index].event_id,
      consumer_name: index % 2 === 0 ? "__publisher__" : "b2b-consumer",
      notification_delivery_id: null, payload_hash: outbox[index].payload_hash,
      failure_side: index % 2 === 0 ? "publisher" : "consumer",
      error_category: "infra", error_code: `B2B_DLQ_${index}`, attempt_count: 8,
      version: 1, first_failed_at: at(clock, 500 + index),
      last_failed_at: at(clock, 600 + index), incident_id: `b2b-incident-${index}`,
      last_replay_at: ["replaying", "resolved"].includes(status) ? at(clock, 700 + index) : null,
      created_at: at(clock, 500 + index), status
    }));
  }
  throw new Error(`unimplemented B-extension table:${logicalName}`);
}

export function extensionRows(extension, aBaseProfile) {
  return Object.fromEntries(EXTENSION_TABLE_ORDER.map((logicalName) => {
    const rows = rowsForExtensionTable(extension, aBaseProfile, logicalName);
    if (rows.length !== extension.expected_counts[logicalName]) {
      throw new Error(`B-extension count drift:${logicalName}:${rows.length}`);
    }
    return [logicalName, rows];
  }));
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite fixture number");
    return String(value);
  }
  const text = typeof value === "object" ? canonicalize(value) : String(value);
  return `'${text.replaceAll("'", "''")}'`;
}

function insertSql(table, rows, pass) {
  if (!/^[a-z][a-z0-9_]+$/.test(table) || rows.length === 0) {
    throw new Error(`unsafe B-extension insert:${table}`);
  }
  const columns = Object.keys(rows[0]);
  for (const row of rows) {
    if (canonicalize(Object.keys(row)) !== canonicalize(columns)) {
      throw new Error(`inconsistent B-extension columns:${table}`);
    }
  }
  return `WITH inserted AS (INSERT INTO ${table} (${columns.join(",")}) VALUES\n${rows.map((row) =>
    `(${columns.map((column) => sqlValue(row[column])).join(",")})`).join(",\n")}`
    + `\nON CONFLICT DO NOTHING RETURNING 1) SELECT 'B_EXTENSION_AFFECTED|${pass}|${table}|'`
    + `||count(*) FROM inserted;`;
}

function mutationReceiptCompletionSql(rows) {
  const values = rows.map((row) => `(${[
    row.id, row.receipt_status, row.result_ref, row.result_hash, row.result_version, row.completed_at
  ].map(sqlValue).join(",")})`).join(",\n");
  return `UPDATE ${EXTENSION_TABLES.mutation_receipt} target SET
    receipt_status=source.receipt_status,result_ref=source.result_ref,
    result_hash=source.result_hash,result_version=source.result_version::integer,
    completed_at=source.completed_at::timestamptz
  FROM (VALUES ${values}) AS source(
    id,receipt_status,result_ref,result_hash,result_version,completed_at)
  WHERE target.id=source.id::uuid AND target.receipt_status='started';`;
}

export function extensionWritePlan(extension, aBaseProfile, { repeat = 2 } = {}) {
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 2) {
    throw new Error("B-extension repeat must be one or two");
  }
  const rows = extensionRows(extension, aBaseProfile);
  const statements = [
    "BEGIN;",
    "SET LOCAL statement_timeout='120s';",
    "SELECT pg_advisory_xact_lock(hashtextextended('pr192:b-extension:v1',0));"
  ];
  for (let pass = 0; pass < repeat; pass += 1) {
    for (const logicalName of EXTENSION_TABLE_ORDER) {
      const passName = pass === 0 ? "first" : "second";
      if (logicalName === "mutation_receipt") {
        const startedRows = rows[logicalName].map((row) => ({ ...row,
          receipt_status: "started", result_ref: null, result_hash: null,
          result_version: null, completed_at: null }));
        statements.push(insertSql(EXTENSION_TABLES[logicalName], startedRows, passName));
        statements.push(mutationReceiptCompletionSql(rows[logicalName]));
      } else {
        statements.push(insertSql(EXTENSION_TABLES[logicalName], rows[logicalName], passName));
      }
    }
  }
  return { rows, sql: `${statements.join("\n")}\n`, repeat };
}

export function extensionCleanupPlan() {
  return "ROLLBACK;\n";
}

export function extensionResidualSql(extension, aBaseProfile) {
  const rows = extensionRows(extension, aBaseProfile);
  return EXTENSION_TABLE_ORDER.map((logicalName) => {
    const table = EXTENSION_TABLES[logicalName];
    const key = logicalName === "outbox" ? "event_id" : "id";
    const ids = rows[logicalName].map((row) => `'${row[key]}'::uuid`).join(",");
    return `SELECT 'B_EXTENSION_RESIDUAL|${logicalName}|'||count(*) FROM ${table} `
      + `WHERE ${key} IN (${ids});`;
  }).join("\n");
}

export function negativeScenarioSql(extension, aBaseProfile) {
  const rows = extensionRows(extension, aBaseProfile);
  const approval = rows.approval_request;
  const inbox = rows.inbox[0];
  const wrongTenant = id(extension, "negative-tenant");
  const wrongPark = id(extension, "negative-park");
  const secondPark = [...rowsForTable(aBaseProfile, "park")][1];
  const evidence = Object.fromEntries(extension.negative_scenarios.map((item) =>
    [item.scenario, item]));
  return `
CREATE TEMP TABLE b_extension_negative_evidence(
  scenario text PRIMARY KEY,evidence_id text UNIQUE NOT NULL,sqlstate text NOT NULL,affected integer NOT NULL,
  delta integer NOT NULL,unique_winners integer NOT NULL,constraint_name text,
  passed boolean NOT NULL
) ON COMMIT DROP;
INSERT INTO sys_tenant(tenant_id,park_id,tenant_code,tenant_name,tenant_type,status,
  max_users,max_parks,plan_code,remark)
VALUES('${wrongTenant}','0','PR192_BEXT_NEGATIVE','PR192 B-extension negative tenant',
  'park_operator',1,0,0,'GROUP','PR192 B-extension transaction-only scope');
INSERT INTO asset_park(tenant_id,park_id,park_code,park_name,status,is_deleted,version,remark)
VALUES('${wrongTenant}','${wrongPark}','PR192-BEXT-NEG','PR192 B-extension negative park',
  'enabled',false,1,'PR192 B-extension transaction-only scope');
DO $bext$
DECLARE n1 integer;constraint_seen text;
BEGIN
  BEGIN
    INSERT INTO biz_property_approval_stage(id,tenant_id,park_id,request_id,stage_code,
      stage_ordinal,eligibility_policy_snapshot,eligibility_policy_version,
      eligibility_policy_hash,required_count)
    VALUES('${id(extension, "negative-cross-tenant-stage")}','${wrongTenant}',
      '${wrongPark}','${approval[0].id}','cross-tenant',1,'{}',1,
      '${"a".repeat(64)}',1);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS constraint_seen=CONSTRAINT_NAME;
    INSERT INTO b_extension_negative_evidence VALUES
    ('cross_tenant_scope','${evidence.cross_tenant_scope.evidence_id}',SQLSTATE,0,0,0,constraint_seen,
      SQLSTATE='23503' AND constraint_seen='fk_biz_property_approval_stage_request'); END;
  BEGIN
    INSERT INTO biz_property_approval_stage(id,tenant_id,park_id,request_id,stage_code,
      stage_ordinal,eligibility_policy_snapshot,eligibility_policy_version,
      eligibility_policy_hash,required_count)
    VALUES('${id(extension, "negative-cross-park-stage")}','${approval[0].tenant_id}',
      '${secondPark.park_id}','${approval[0].id}','cross-park',1,'{}',1,
      '${"b".repeat(64)}',1);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS constraint_seen=CONSTRAINT_NAME;
    INSERT INTO b_extension_negative_evidence VALUES
    ('cross_park_scope','${evidence.cross_park_scope.evidence_id}',SQLSTATE,0,0,0,constraint_seen,
      SQLSTATE='23503' AND constraint_seen='fk_biz_property_approval_stage_request'); END;
  INSERT INTO biz_property_inbox(id,tenant_id,park_id,consumer_name,consumer_version,event_id,
    event_type,event_version,ordering_key,sequence,payload_hash,result_hash,result_reference,handled_at)
    VALUES('${inbox.id}','${inbox.tenant_id}','${inbox.park_id}','${inbox.consumer_name}',1,
      '${inbox.event_id}','${inbox.event_type}',1,'${inbox.ordering_key}',${inbox.sequence},
      '${inbox.payload_hash}','${inbox.result_hash}','fixture:duplicate','${inbox.handled_at}')
    ON CONFLICT DO NOTHING;GET DIAGNOSTICS n1=ROW_COUNT;
  INSERT INTO b_extension_negative_evidence VALUES
    ('inbox_duplicate','${evidence.inbox_duplicate.evidence_id}','00000',n1,n1,0,NULL,n1=0);
END $bext$;
SELECT 'B_EXTENSION_NEGATIVE|'||scenario||'|'||evidence_id||'|'||sqlstate||'|'||affected||'|'||delta||'|'
  ||unique_winners||'|'||COALESCE(constraint_name,'')||'|'
  ||CASE WHEN passed THEN '1' ELSE '0' END
  FROM b_extension_negative_evidence ORDER BY scenario;
`;
}

export function computeExtensionFixtureSha({
  profile,
  rows,
  profileRawSha256,
  expectedMutationsRawSha256,
  generatorSha256,
  authorityFreezeSha256
}) {
  const dataSha256 = hashCanonical(rows);
  const manifest = {
    grammar: "property-remediation-b-extension-fixture-v1",
    profile: profile.profile,
    profile_version: profile.profile_version,
    generator_version: profile.generator_version,
    seed: profile.seed,
    business_clock: profile.business_clock,
    profile_raw_sha256: profileRawSha256,
    expected_mutations_raw_sha256: expectedMutationsRawSha256,
    generator_sha256: generatorSha256,
    authority_freeze_sha256: authorityFreezeSha256,
    data_sha256: dataSha256,
    counts: profile.expected_counts
  };
  return { data_sha256: dataSha256, manifest, fixture_sha256: hashCanonical(manifest) };
}

export function fixtureSourceSha256() {
  return sha256(readFileSync(fileURLToPath(import.meta.url)));
}
