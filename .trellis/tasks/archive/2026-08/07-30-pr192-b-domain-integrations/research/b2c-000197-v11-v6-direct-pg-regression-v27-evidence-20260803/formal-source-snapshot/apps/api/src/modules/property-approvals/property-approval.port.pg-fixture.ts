import { randomUUID } from "node:crypto";

export interface ApprovalPortPgQueryExecutor {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

export const APPROVAL_PORT_PG_TARGET_TABLES = [
  "biz_property_approval_request",
  "biz_property_approval_stage",
  "biz_property_approval_actor_exclusion",
  "biz_property_execution_effect_manifest"
] as const;

export const APPROVAL_PORT_PG_DATA_TABLES_IN_DELETE_ORDER = [
  "biz_property_execution_effect_receipt",
  "biz_property_approval_decision",
  "biz_property_approval_audit",
  "biz_property_execution_effect_manifest",
  "biz_property_approval_actor_exclusion",
  "biz_property_approval_stage",
  "biz_property_mutation_receipt",
  "biz_property_approval_request"
] as const;

export interface ApprovalPortPgFixtureNames {
  runId: string;
  sentinelTable: string;
  faultFunction: string;
  faultTrigger: string;
  applicationName: string;
  observerApplicationName: string;
  setupApplicationName: string;
  cleanupApplicationName: string;
  auditorApplicationName: string;
  faultSetting: string;
}

export interface ApprovalPortPgFixtureAudit {
  setup: string[];
  cleanup: string[];
}

export interface ApprovalPortPgCleanupResult {
  errors: unknown[];
  residue: Array<{ objectKind: string; objectName: string }>;
}

const RUN_ID_PATTERN = /^[0-9a-f]{32}$/u;
const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/u;

export function approvalPortPgRunId(input?: string): string {
  const value = input ?? randomUUID().replaceAll("-", "");
  if (!RUN_ID_PATTERN.test(value)) {
    throw new Error("PROPERTY_APPROVAL_PORT_PG_RUN_ID must be exactly 32 lowercase hex characters");
  }
  return value;
}

export function approvalPortPgFixtureNames(runIdInput: string): ApprovalPortPgFixtureNames {
  const runId = approvalPortPgRunId(runIdInput);
  const names = {
    runId,
    sentinelTable: `b2c_ap_${runId}_sentinel`,
    faultFunction: `b2c_ap_${runId}_fault`,
    faultTrigger: `tr_b2c_ap_${runId}_fault`,
    applicationName: `b2c_ap_${runId}`,
    observerApplicationName: `b2c_ap_${runId}_observer`,
    setupApplicationName: `b2c_ap_${runId}_setup`,
    cleanupApplicationName: `b2c_ap_${runId}_cleanup`,
    auditorApplicationName: `b2c_ap_${runId}_auditor`,
    faultSetting: `jinhu.b2c_ap_${runId}_fault`
  };
  for (const value of [
    names.sentinelTable,
    names.faultFunction,
    names.faultTrigger,
    names.applicationName,
    names.observerApplicationName,
    names.setupApplicationName,
    names.cleanupApplicationName,
    names.auditorApplicationName
  ]) assertSafePgIdentifier(value);
  if (!/^jinhu\.[a-z_][a-z0-9_]{0,62}$/u.test(names.faultSetting)) {
    throw new Error("unsafe PostgreSQL fixture setting");
  }
  return names;
}

export function quoteApprovalPortPgIdentifier(value: string): string {
  assertSafePgIdentifier(value);
  return `"${value}"`;
}

export async function approvalPortPgResidue(
  executor: ApprovalPortPgQueryExecutor,
  names: ApprovalPortPgFixtureNames
): Promise<Array<{ objectKind: string; objectName: string }>> {
  return await executor.query(
    `SELECT object_kind AS "objectKind", object_name AS "objectName"
       FROM (
         SELECT 'relation'::text AS object_kind, c.relname::text AS object_name
           FROM pg_class c
           JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname=$1
         UNION ALL
         SELECT 'function'::text, p.proname::text
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname=$2
         UNION ALL
         SELECT 'trigger'::text, t.tgname::text
           FROM pg_trigger t
          WHERE NOT t.tgisinternal AND t.tgname=$3
       ) residue
      ORDER BY object_kind,object_name`,
    [names.sentinelTable, names.faultFunction, names.faultTrigger]
  ) as Array<{ objectKind: string; objectName: string }>;
}

export async function assertApprovalPortPgFixturePresent(
  executor: ApprovalPortPgQueryExecutor,
  names: ApprovalPortPgFixtureNames
): Promise<void> {
  const residue = await approvalPortPgResidue(executor, names);
  const expected = [
    { objectKind: "function", objectName: names.faultFunction },
    { objectKind: "relation", objectName: names.sentinelTable },
    ...APPROVAL_PORT_PG_TARGET_TABLES.map(() => ({
      objectKind: "trigger", objectName: names.faultTrigger
    }))
  ].sort((left, right) =>
    `${left.objectKind}:${left.objectName}`.localeCompare(`${right.objectKind}:${right.objectName}`)
  );
  assertDeepEqualFixtureRows(residue, expected, "external fixture catalog mismatch");
}

export async function approvalPortPgSessionResidue(
  executor: ApprovalPortPgQueryExecutor,
  names: ApprovalPortPgFixtureNames
): Promise<Array<{ applicationName: string; sessionCount: number }>> {
  return await executor.query(
    `SELECT application_name AS "applicationName",count(*)::int AS "sessionCount"
       FROM pg_stat_activity
      WHERE application_name = ANY($1::text[])
      GROUP BY application_name
      ORDER BY application_name`,
    [[
      names.applicationName,
      names.observerApplicationName,
      names.setupApplicationName,
      names.cleanupApplicationName
    ]]
  ) as Array<{ applicationName: string; sessionCount: number }>;
}

export async function approvalPortPgDataResidue(
  executor: ApprovalPortPgQueryExecutor,
  tenantId: string,
  parkId: string
): Promise<Array<{ tableName: string; rowCount: number }>> {
  const union = APPROVAL_PORT_PG_DATA_TABLES_IN_DELETE_ORDER.map((table) =>
    `SELECT '${table}'::text AS table_name,count(*)::int AS row_count
       FROM public.${quoteApprovalPortPgIdentifier(table)}
      WHERE tenant_id=$1 AND park_id=$2`
  ).join(" UNION ALL ");
  return await executor.query(
    `SELECT table_name AS "tableName",row_count AS "rowCount"
       FROM (${union}) counts
      WHERE row_count <> 0
      ORDER BY table_name`,
    [tenantId, parkId]
  ) as Array<{ tableName: string; rowCount: number }>;
}

export async function cleanupApprovalPortPgRunData(
  executor: ApprovalPortPgQueryExecutor,
  tenantId: string,
  parkId: string,
  audit: ApprovalPortPgFixtureAudit
): Promise<unknown[]> {
  const errors: unknown[] = [];
  for (const table of APPROVAL_PORT_PG_DATA_TABLES_IN_DELETE_ORDER) {
    audit.cleanup.push(`delete-run-data:${table}`);
    try {
      await executor.query(
        `DELETE FROM public.${quoteApprovalPortPgIdentifier(table)}
          WHERE tenant_id=$1 AND park_id=$2`,
        [tenantId, parkId]
      );
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

export async function setupApprovalPortPgFixture(
  executor: ApprovalPortPgQueryExecutor,
  names: ApprovalPortPgFixtureNames,
  audit: ApprovalPortPgFixtureAudit
): Promise<void> {
  const preflight = await approvalPortPgResidue(executor, names);
  audit.setup.push("zero-residue-preflight");
  if (preflight.length !== 0) {
    throw new Error(`approval port PG fixture residue before setup: ${JSON.stringify(preflight)}`);
  }
  await auditedQuery(executor, audit.setup, "create-sentinel-table",
    `CREATE TABLE public.${quoteApprovalPortPgIdentifier(names.sentinelTable)}(
      id uuid PRIMARY KEY,
      label text NOT NULL UNIQUE
    )`);
  await auditedQuery(executor, audit.setup, "create-fault-function",
    `CREATE FUNCTION public.${quoteApprovalPortPgIdentifier(names.faultFunction)}()
     RETURNS trigger LANGUAGE plpgsql AS $$
     DECLARE
       fault text := current_setting('${names.faultSetting}', true);
       parts text[];
     BEGIN
       IF fault IS NULL OR fault = '' THEN RETURN NEW; END IF;
       parts := string_to_array(fault, '|');
       IF parts[1] = TG_TABLE_NAME THEN
         RAISE EXCEPTION USING ERRCODE=parts[2], CONSTRAINT=parts[3],
           MESSAGE='B-2c approval port injected database fault';
       END IF;
       RETURN NEW;
     END;
     $$`);
  for (const table of APPROVAL_PORT_PG_TARGET_TABLES) {
    await auditedQuery(executor, audit.setup, `create-trigger:${table}`,
      `CREATE TRIGGER ${quoteApprovalPortPgIdentifier(names.faultTrigger)}
       BEFORE INSERT ON public.${quoteApprovalPortPgIdentifier(table)}
       FOR EACH ROW EXECUTE FUNCTION public.${quoteApprovalPortPgIdentifier(names.faultFunction)}()`);
  }
}

export async function cleanupApprovalPortPgFixture(
  executor: ApprovalPortPgQueryExecutor,
  names: ApprovalPortPgFixtureNames,
  audit: ApprovalPortPgFixtureAudit
): Promise<ApprovalPortPgCleanupResult> {
  const errors: unknown[] = [];
  const attempt = async (step: string, sql: string) => {
    audit.cleanup.push(step);
    try {
      await executor.query(sql);
    } catch (error) {
      errors.push(error);
    }
  };
  for (const table of APPROVAL_PORT_PG_TARGET_TABLES) {
    await attempt(
      `drop-trigger:${table}`,
      `DROP TRIGGER IF EXISTS ${quoteApprovalPortPgIdentifier(names.faultTrigger)}
       ON public.${quoteApprovalPortPgIdentifier(table)}`
    );
  }
  await attempt(
    "drop-fault-function",
    `DROP FUNCTION IF EXISTS public.${quoteApprovalPortPgIdentifier(names.faultFunction)}()`
  );
  await attempt(
    "drop-sentinel-table",
    `DROP TABLE IF EXISTS public.${quoteApprovalPortPgIdentifier(names.sentinelTable)}`
  );
  let residue: ApprovalPortPgCleanupResult["residue"] = [];
  try {
    residue = await approvalPortPgResidue(executor, names);
    audit.cleanup.push("zero-residue-postcheck");
  } catch (error) {
    errors.push(error);
  }
  return { errors, residue };
}

export function cleanupErrorPreservingPrimary(
  primary: unknown,
  cleanup: ApprovalPortPgCleanupResult
): unknown {
  const cleanupFailures = [
    ...cleanup.errors,
    ...(cleanup.residue.length > 0
      ? [new Error(`approval port PG fixture residue: ${JSON.stringify(cleanup.residue)}`)]
      : [])
  ];
  if (primary !== undefined) {
    if (cleanupFailures.length === 0) return primary;
    return new AggregateError(cleanupFailures, "cleanup failed after primary PG Gate failure", {
      cause: primary
    });
  }
  if (cleanupFailures.length === 0) return undefined;
  return new AggregateError(cleanupFailures, "approval port PG fixture cleanup failed");
}

function assertSafePgIdentifier(value: string): void {
  if (!IDENTIFIER_PATTERN.test(value)) throw new Error(`unsafe PostgreSQL identifier: ${value}`);
}

async function auditedQuery(
  executor: ApprovalPortPgQueryExecutor,
  audit: string[],
  step: string,
  sql: string
): Promise<void> {
  audit.push(step);
  await executor.query(sql);
}

function assertDeepEqualFixtureRows(
  actual: Array<{ objectKind: string; objectName: string }>,
  expected: Array<{ objectKind: string; objectName: string }>,
  message: string
): void {
  const normalize = (rows: Array<{ objectKind: string; objectName: string }>) => rows
    .map((row) => `${row.objectKind}:${row.objectName}`)
    .sort();
  if (JSON.stringify(normalize(actual)) !== JSON.stringify(normalize(expected))) {
    throw new Error(`${message}: ${JSON.stringify(actual)}`);
  }
}
