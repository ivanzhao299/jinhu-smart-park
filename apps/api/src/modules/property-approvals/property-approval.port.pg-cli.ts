import { DataSource } from "typeorm";
import {
  approvalPortPgDataResidue,
  approvalPortPgFixtureNames,
  approvalPortPgResidue,
  approvalPortPgRunId,
  approvalPortPgSessionResidue,
  assertApprovalPortPgFixturePresent,
  cleanupApprovalPortPgFixture,
  cleanupApprovalPortPgRunData,
  cleanupErrorPreservingPrimary,
  setupApprovalPortPgFixture,
  type ApprovalPortPgFixtureAudit
} from "./property-approval.port.pg-fixture";

type Phase = "probe" | "setup" | "cleanup";

interface PhaseResult {
  phase: Phase;
  runId: string | null;
  status: "pass" | "fail";
  details: Record<string, unknown>;
}

export interface ApprovalPortPgLifecycleConnection {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
  destroy(): Promise<void>;
}

export type ApprovalPortPgConnector = (
  url: string,
  applicationName: string
) => Promise<ApprovalPortPgLifecycleConnection>;

export interface ApprovalPortPgPostcheckResidue {
  objects: Array<{ objectKind: string; objectName: string }>;
  data: Array<{ tableName: string; rowCount: number }>;
  sessions: Array<{ applicationName: string; sessionCount: number }>;
}

export class ApprovalPortPgPostcheckError extends Error {
  constructor(readonly residueDetails: ApprovalPortPgPostcheckResidue) {
    super(`approval port PG cleanup postcheck found residue: ${JSON.stringify(residueDetails)}`);
    this.name = "ApprovalPortPgPostcheckError";
  }
}

export async function approvalPortPgPhaseMain(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): Promise<number> {
  const phase = argv[0] as Phase | undefined;
  if (!phase || !["probe", "setup", "cleanup"].includes(phase)) {
    emit({ phase: phase ?? "probe", runId: null, status: "fail", details: {
      error: "phase must be probe, setup or cleanup"
    } });
    return 2;
  }
  const url = env.PROPERTY_APPROVAL_PORT_PG_URL;
  const rawRunId = env.PROPERTY_APPROVAL_PORT_PG_RUN_ID;
  if (!url || !rawRunId) {
    emit({ phase, runId: rawRunId ?? null, status: "fail", details: {
      error: "PROPERTY_APPROVAL_PORT_PG_URL and PROPERTY_APPROVAL_PORT_PG_RUN_ID are required"
    } });
    return 2;
  }
  let runId: string;
  try {
    runId = approvalPortPgRunId(rawRunId);
  } catch (error) {
    emit({ phase, runId: rawRunId, status: "fail", details: serializeError(error) });
    return 2;
  }
  const names = approvalPortPgFixtureNames(runId);
  const tenantId = `b2c-${runId}`;
  const parkId = `b2c-${runId}`;
  const audit: ApprovalPortPgFixtureAudit = { setup: [], cleanup: [] };
  const isolatedCleanup = env.PROPERTY_APPROVAL_PORT_PG_ISOLATED_CLEANUP === "yes";
  const expectedDatabase = env.PROPERTY_APPROVAL_PORT_PG_EXPECTED_DATABASE;
  try {
    if (phase === "probe") {
      const probe = await connect(url, names.setupApplicationName);
      try {
        const rows = await probe.query(
          "SELECT current_database() AS database, current_setting('server_version_num') AS version"
        ) as Array<{ database: string; version: string }>;
        emit({ phase, runId, status: "pass", details: { connected: true, server: rows[0] } });
      } finally {
        await probe.destroy();
      }
      return 0;
    }
    if (phase === "setup") {
      return await setupPhase(url, names, tenantId, parkId, audit, isolatedCleanup, expectedDatabase);
    }
    return await approvalPortPgCleanupPhase(url, names, tenantId, parkId, audit, connect, {
      isolatedImmutableBypass: isolatedCleanup, expectedDatabase
    });
  } catch (error) {
    emit({ phase, runId, status: "fail", details: serializeError(error) });
    return 1;
  }
}

async function setupPhase(
  url: string,
  names: ReturnType<typeof approvalPortPgFixtureNames>,
  tenantId: string,
  parkId: string,
  audit: ApprovalPortPgFixtureAudit,
  isolatedCleanup: boolean,
  expectedDatabase?: string
): Promise<number> {
  const connection = await connect(url, names.setupApplicationName);
  let primary: unknown;
  try {
    const dataResidue = await approvalPortPgDataResidue(connection, tenantId, parkId);
    audit.setup.push("zero-run-data-preflight");
    if (dataResidue.length > 0) {
      throw new Error(`approval port PG run data residue before setup: ${JSON.stringify(dataResidue)}`);
    }
    await setupApprovalPortPgFixture(connection, names, audit);
    await assertApprovalPortPgFixturePresent(connection, names);
  } catch (error) {
    primary = error;
    const dataErrors = await cleanupApprovalPortPgRunData(
      connection, tenantId, parkId, audit,
      { isolatedImmutableBypass: isolatedCleanup, expectedDatabase }
    );
    const cleanup = await cleanupApprovalPortPgFixture(connection, names, audit);
    cleanup.errors.unshift(...dataErrors);
    primary = cleanupErrorPreservingPrimary(primary, cleanup);
  } finally {
    try {
      await connection.destroy();
    } catch (error) {
      primary = cleanupErrorPreservingPrimary(primary, { errors: [error], residue: [] });
    }
  }
  if (primary !== undefined) throw primary;
  emit({ phase: "setup", runId: names.runId, status: "pass", details: { audit } });
  return 0;
}

export async function approvalPortPgCleanupPhase(
  url: string,
  names: ReturnType<typeof approvalPortPgFixtureNames>,
  tenantId: string,
  parkId: string,
  audit: ApprovalPortPgFixtureAudit,
  connector: ApprovalPortPgConnector = connect,
  cleanupOptions: { isolatedImmutableBypass?: boolean; expectedDatabase?: string } = {}
): Promise<number> {
  const connection = await connector(url, names.cleanupApplicationName);
  let primary: unknown;
  try {
    const dataErrors = await cleanupApprovalPortPgRunData(
      connection, tenantId, parkId, audit, cleanupOptions
    );
    const cleanup = await cleanupApprovalPortPgFixture(connection, names, audit);
    cleanup.errors.unshift(...dataErrors);
    primary = cleanupErrorPreservingPrimary(undefined, cleanup);
  } finally {
    try {
      await connection.destroy();
    } catch (error) {
      primary = cleanupErrorPreservingPrimary(primary, { errors: [error], residue: [] });
    }
  }
  let auditor: ApprovalPortPgLifecycleConnection | undefined;
  try {
    auditor = await connector(url, names.auditorApplicationName);
    const objectResidue = await approvalPortPgResidue(auditor, names);
    const dataResidue = await approvalPortPgDataResidue(auditor, tenantId, parkId);
    const sessionResidue = await approvalPortPgSessionResidue(auditor, names);
    if (objectResidue.length || dataResidue.length || sessionResidue.length) {
      const residueError = new ApprovalPortPgPostcheckError({
        objects: objectResidue,
        data: dataResidue,
        sessions: sessionResidue
      });
      primary = cleanupErrorPreservingPrimary(primary, {
        errors: [residueError],
        residue: []
      });
    }
  } catch (error) {
    primary = cleanupErrorPreservingPrimary(primary, { errors: [error], residue: [] });
  } finally {
    if (auditor) {
      try {
        await auditor.destroy();
      } catch (error) {
        primary = cleanupErrorPreservingPrimary(primary, { errors: [error], residue: [] });
      }
    }
  }
  if (primary !== undefined) throw primary;
  emit({ phase: "cleanup", runId: names.runId, status: "pass", details: { audit } });
  return 0;
}

function connect(url: string, applicationName: string): Promise<DataSource> {
  const dataSource = new DataSource({
    type: "postgres", url, entities: [], applicationName,
    synchronize: false, migrationsRun: false, logging: false
  });
  return dataSource.initialize();
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof AggregateError) {
    return {
      name: error.name,
      message: error.message,
      cause: serializeError(error.cause),
      errors: error.errors.map(serializeError)
    };
  }
  if (error instanceof ApprovalPortPgPostcheckError) {
    return { name: error.name, message: error.message, residueDetails: error.residueDetails };
  }
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: "UnknownError", message: String(error) };
}

function emit(result: PhaseResult): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  void approvalPortPgPhaseMain(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
