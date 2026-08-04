import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import {
  assertPropertyTaskMutationActionIdentityMode,
  propertyTaskMutationResultHash,
  type PropertyMutationReceiptAcquireInput,
  type PropertyMutationReceiptAcquireResult,
  type PropertyMutationReceiptCompleteInput,
  type PropertyMutationReceiptPort
} from "@jinhu/shared";
import { propertyApprovalError } from "./property-approval.error";

interface ReceiptRow {
  id: string;
  receipt_contract_version: string;
  tenant_id: string;
  park_id: string;
  actor_id: string;
  action_id: string;
  target_id: string;
  client_key: string;
  request_hash: string;
  receipt_status: string;
  identity_kind: string | null;
  business_occurrence_key: string | null;
  task_key: string | null;
  identity_source_type: string | null;
  result_ref: string | null;
  result_hash: string | null;
  result_version: number | null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const RECEIPT_SERIALIZATION_FAILURE = Symbol("property-mutation-receipt-serialization-failure");

export function isPropertyMutationReceiptSerializationFailure(error: unknown): boolean {
  if (!error || typeof error !== "object"
    || (error as { [RECEIPT_SERIALIZATION_FAILURE]?: unknown })[
      RECEIPT_SERIALIZATION_FAILURE
    ] !== true) return false;
  const cause = (error as { cause?: unknown }).cause as {
    code?: unknown;
    driverError?: { code?: unknown };
  } | undefined;
  return (cause?.code ?? cause?.driverError?.code) === "40001";
}

@Injectable()
export class DatabasePropertyMutationReceiptAdapter
implements PropertyMutationReceiptPort {
  async acquire(
    manager: EntityManager,
    input: PropertyMutationReceiptAcquireInput
  ): Promise<PropertyMutationReceiptAcquireResult> {
    validateAcquireInput(input);
    const identity = identityColumns(input.identity);
    let rows: ReceiptRow[] = [];
    if (input.acquireMode === "execute-or-replay") {
      rows = await receiptQuery(manager,
        `INSERT INTO biz_property_mutation_receipt(
           receipt_contract_version,tenant_id,park_id,actor_id,action_id,target_id,
           client_key,request_hash,receipt_status,identity_kind,
           business_occurrence_key,task_key,identity_source_type
         ) VALUES('port-v2',$1,$2,$3,$4,$5,$6,$7,'started',$8,$9,$10,$11)
         ON CONFLICT ON CONSTRAINT uq_biz_property_mutation_receipt_client
         DO NOTHING
         RETURNING id,receipt_contract_version,tenant_id,park_id,actor_id,action_id,
           target_id,client_key,request_hash,receipt_status,identity_kind,
           business_occurrence_key,task_key,identity_source_type,result_ref,result_hash,
           result_version`,
        commonParameters(input, identity)
      );
      if (rows.length === 1) return { kind: "execute", receiptId: rows[0]!.id };
      if (rows.length > 1) throw propertyApprovalError("property-runtime-unavailable");
    }

    rows = await receiptQuery(manager,
      `SELECT id,receipt_contract_version,tenant_id,park_id,actor_id,action_id,
         target_id,client_key,request_hash,receipt_status,identity_kind,
         business_occurrence_key,task_key,identity_source_type,result_ref,result_hash,
         result_version
       FROM biz_property_mutation_receipt
       WHERE tenant_id=$1 AND park_id=$2 AND actor_id=$3 AND action_id=$4
         AND target_id=$5 AND client_key=$6
       FOR UPDATE`,
      commonParameters(input, identity).slice(0, 6)
    );
    if (rows.length !== 1) throw propertyApprovalError("property-runtime-unavailable");
    return classifyReplay(rows[0]!, input, identity);
  }

  async complete(
    manager: EntityManager,
    input: PropertyMutationReceiptCompleteInput
  ): Promise<void> {
    await validateCompleteInput(input);
    const identity = identityColumns(input.identity);
    const rows = await receiptQuery<{ id: string }>(manager,
      `WITH completed AS (
         UPDATE biz_property_mutation_receipt
         SET receipt_status='completed',result_ref=$12,result_hash=$13,
             result_version=$14,completed_at=clock_timestamp()
         WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND actor_id=$4
           AND action_id=$5 AND target_id=$6 AND client_key=$7 AND request_hash=$8
           AND receipt_contract_version='port-v2'
           AND identity_kind=$9
           AND business_occurrence_key IS NOT DISTINCT FROM $10
           AND task_key IS NOT DISTINCT FROM $11
           AND identity_source_type IS NOT DISTINCT FROM $15
           AND receipt_status='started' AND result_ref IS NULL AND result_hash IS NULL
           AND result_version IS NULL AND completed_at IS NULL
         RETURNING id
       )
       SELECT id FROM completed`,
      [
        input.receiptId,
        input.scope.tenantId,
        input.scope.parkId,
        input.actorId,
        input.actionId,
        input.targetId,
        input.clientKey,
        input.requestHash,
        identity.kind,
        identity.businessOccurrenceKey,
        identity.taskKey,
        input.resultRef,
        input.resultHash,
        input.resultVersion,
        identity.sourceType
      ]
    );
    if (rows.length !== 1) throw propertyApprovalError("property-runtime-unavailable");
  }
}

interface IdentityColumns {
  kind: "property-task" | "property-task-source-rebuild";
  businessOccurrenceKey: string | null;
  taskKey: string | null;
  sourceType: string | null;
}

function identityColumns(
  identity: PropertyMutationReceiptAcquireInput["identity"]
): IdentityColumns {
  return identity.tag === "property-task"
    ? {
        kind: identity.tag,
        businessOccurrenceKey: identity.businessOccurrenceKey,
        taskKey: identity.taskKey,
        sourceType: null
      }
    : {
        kind: identity.tag,
        businessOccurrenceKey: null,
        taskKey: null,
        sourceType: identity.sourceType
      };
}

function commonParameters(
  input: PropertyMutationReceiptAcquireInput,
  identity: IdentityColumns
): unknown[] {
  return [
    input.scope.tenantId,
    input.scope.parkId,
    input.actorId,
    input.actionId,
    input.targetId,
    input.clientKey,
    input.requestHash,
    identity.kind,
    identity.businessOccurrenceKey,
    identity.taskKey,
    identity.sourceType
  ];
}

function validateAcquireInput(input: PropertyMutationReceiptAcquireInput): void {
  try {
    validateCommonInput(input);
    assertPropertyTaskMutationActionIdentityMode({
      contractVersion: input.contractVersion,
      actionId: input.actionId,
      targetId: input.targetId,
      identity: input.identity,
      acquireMode: input.acquireMode
    });
  } catch {
    throw propertyApprovalError("property-validation-failed");
  }
}

async function validateCompleteInput(
  input: PropertyMutationReceiptCompleteInput
): Promise<void> {
  try {
    validateCommonInput(input);
    if (!UUID_PATTERN.test(input.receiptId) || !HASH_PATTERN.test(input.resultHash)) {
      throw new TypeError("Receipt completion identifiers are not canonical");
    }
    assertPropertyTaskMutationActionIdentityMode({
      contractVersion: input.contractVersion,
      actionId: input.actionId,
      targetId: input.targetId,
      identity: input.identity
    });
    const expectedHash = await propertyTaskMutationResultHash({
      actionId: input.actionId,
      targetId: input.targetId,
      identity: input.identity,
      resultRef: input.resultRef,
      resultVersion: input.resultVersion
    });
    if (expectedHash !== input.resultHash) {
      throw new TypeError("Receipt resultHash does not match canonical result bytes");
    }
  } catch {
    throw propertyApprovalError("property-validation-failed");
  }
}

function validateCommonInput(
  input: PropertyMutationReceiptAcquireInput | PropertyMutationReceiptCompleteInput
): void {
  if (
    !canonicalScopePart(input.scope.tenantId)
    || !canonicalScopePart(input.scope.parkId)
    || !UUID_PATTERN.test(input.actorId)
    || !HASH_PATTERN.test(input.requestHash)
    || input.clientKey.length < 1
    || input.clientKey.length > 128
    || !/^[\x20-\x7e]+$/.test(input.clientKey)
    || /^ *$/.test(input.clientKey)
  ) throw new TypeError("Receipt common input is not canonical");
}

function canonicalScopePart(value: string): boolean {
  if (
    value.length < 1
    || value.length > 64
    || /[\t\n\r\0\ufffd]/u.test(value)
  ) return false;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const following = value.charCodeAt(index + 1);
      if (!(following >= 0xdc00 && following <= 0xdfff)) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

async function classifyReplay(
  row: ReceiptRow,
  input: PropertyMutationReceiptAcquireInput,
  identity: IdentityColumns
): Promise<PropertyMutationReceiptAcquireResult> {
  if (
    row.receipt_contract_version !== input.contractVersion
    || row.tenant_id !== input.scope.tenantId
    || row.park_id !== input.scope.parkId
    || row.actor_id !== input.actorId
    || row.action_id !== input.actionId
    || row.target_id !== input.targetId
    || row.client_key !== input.clientKey
    || row.request_hash !== input.requestHash
    || row.identity_kind !== identity.kind
    || row.business_occurrence_key !== identity.businessOccurrenceKey
    || row.task_key !== identity.taskKey
    || row.identity_source_type !== identity.sourceType
  ) throw propertyApprovalError("idempotency-key-conflict");

  if (row.receipt_status !== "completed") {
    throw propertyApprovalError("property-runtime-unavailable");
  }
  if (
    row.result_ref === null
    || row.result_hash === null
    || row.result_version === null
  ) throw propertyApprovalError("idempotency-key-conflict");

  try {
    const storedIdentity = row.identity_kind === "property-task"
      ? {
          tag: "property-task" as const,
          businessOccurrenceKey: requiredString(row.business_occurrence_key),
          taskKey: requiredString(row.task_key)
        }
      : {
          tag: "property-task-source-rebuild" as const,
          sourceType: requiredString(row.identity_source_type),
          sourceId: row.target_id
        };
    const computedHash = await propertyTaskMutationResultHash({
      actionId: input.actionId,
      targetId: row.target_id,
      identity: storedIdentity,
      resultRef: row.result_ref,
      resultVersion: row.result_version
    });
    if (computedHash !== row.result_hash) {
      throw new TypeError("Stored receipt hash mismatch");
    }
  } catch {
    throw propertyApprovalError("idempotency-key-conflict");
  }
  return {
    kind: "replay",
    resultRef: row.result_ref,
    resultHash: row.result_hash,
    resultVersion: row.result_version
  };
}

function requiredString(value: string | null): string {
  if (value === null) throw new TypeError("Stored receipt identity is incomplete");
  return value;
}

async function receiptQuery<Row = ReceiptRow>(
  manager: EntityManager,
  statement: string,
  parameters: unknown[]
): Promise<Row[]> {
  try {
    return await manager.query(statement, parameters) as Row[];
  } catch (error) {
    const databaseError = error as {
      code?: string;
      driverError?: { code?: string };
    };
    const code = databaseError.code ?? databaseError.driverError?.code;
    if ([
      "22001", "22023", "22P02", "23502", "23505", "23514",
      "40001", "40P01", "55P03", "57014"
    ].includes(code ?? "")) {
      const wrapped = propertyApprovalError("property-runtime-unavailable");
      if (code === "40001") {
        Object.defineProperties(wrapped, {
          cause: { configurable: false, enumerable: false, value: error },
          [RECEIPT_SERIALIZATION_FAILURE]: {
            configurable: false, enumerable: false, value: true
          }
        });
      }
      throw wrapped;
    }
    throw error;
  }
}
