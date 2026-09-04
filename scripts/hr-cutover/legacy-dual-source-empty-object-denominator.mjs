#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/u;
const SOURCE_BINDINGS = Object.freeze({
  clientAtomicInventory: {
    path: "scripts/hr-cutover/contracts/legacy-client-atomic-inventory-v1.json",
    sha256: "83777787b4dcbcebb959c0051e021e1bb27ff77abe73047c79cd2273fa387e4a",
  },
  clientTableMap: {
    path: "scripts/hr-cutover/contracts/legacy-modern-table-domain-map-v1.json",
    sha256: "0120f13fae3d8c260f493c182370b4aaa5b88867772443b612eb10abb1446f2f",
  },
  clientRoutineLedger: {
    path: "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json",
    sha256: "30a387afe8b8682146e6af929b93ace4b768100b47b6eb1b4dcc64b61ec8385a",
  },
  dualSourceReconciliation: {
    path: "scripts/hr-cutover/contracts/legacy-dual-source-reconciliation-v1.json",
    sha256: "38d5e621de3c163843bda8e3724c4225c79990446a9f0cecc09ff7e3e77f4959",
  },
});

export class LegacyDualSourceEmptyObjectDenominatorError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyDualSourceEmptyObjectDenominatorError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new LegacyDualSourceEmptyObjectDenominatorError(code, detail);
};
const canonical = (value) => `${JSON.stringify(value)}\n`;
const digest = (value) =>
  createHash("sha256")
    .update(Buffer.isBuffer(value) ? value : value)
    .digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, expected, label) => {
  if (!isObject(value) || !same(Object.keys(value).sort(), [...expected].sort())) {
    fail("EMPTY_OBJECT_DENOMINATOR_CONTRACT_INVALID", `${label}:keys`);
  }
};

function validateContract(contract) {
  exactKeys(
    contract,
    [
      "formatVersion",
      "contractKind",
      "status",
      "sourceBindings",
      "expectedDenominator",
      "groupWebAggregateEvidence",
      "evidencePolicy",
      "containsBusinessValues",
      "productionImport",
    ],
    "contract",
  );
  if (
    contract.formatVersion !== 1 ||
    contract.contractKind !== "yuzhou_hr_legacy_dual_source_empty_object_denominator" ||
    contract.status !== "SOURCE_BOUND_DENOMINATOR_ONLY" ||
    contract.containsBusinessValues !== false ||
    contract.productionImport !== "HOLD"
  ) {
    fail("EMPTY_OBJECT_DENOMINATOR_BOUNDARY_INVALID", "contract");
  }
  if (!same(contract.sourceBindings, SOURCE_BINDINGS)) {
    fail("EMPTY_OBJECT_DENOMINATOR_SOURCE_BINDING_INVALID", "sourceBindings");
  }
  if (
    !same(contract.expectedDenominator, {
      clientTables: 162,
      clientRoutines: 212,
      groupWebTables: 438,
      totalObjects: 812,
    })
  ) {
    fail("EMPTY_OBJECT_DENOMINATOR_COUNT_INVALID", "expectedDenominator");
  }
  const aggregate = contract.groupWebAggregateEvidence;
  if (
    !same(aggregate, {
      tables: 438,
      nonemptyTables: 215,
      emptyTables: 223,
      rows: 320406,
      schemaSha256: "bc87605a3008dcea521de85a9105bb546667ab2441c42ca32c059cce7744d8ac",
      tableRowCountSetSha256: "8aa9b2b7b2abc842dd95e2925641d3c9225837f2010cfe93ca42f7e33ad84b40",
    }) ||
    aggregate.nonemptyTables + aggregate.emptyTables !== aggregate.tables
  ) {
    fail("EMPTY_OBJECT_DENOMINATOR_AGGREGATE_INVALID", "groupWebAggregateEvidence");
  }
  if (
    !same(contract.evidencePolicy, {
      includeUnknownRowObjects: true,
      includeUnknownNonNullObjects: true,
      includeUncalledRoutines: true,
      doNotAssignAggregateEmptyCountsToOpaqueObjects: true,
      objectPayloadMode: "stable_id_type_status_hash_only",
      compatibilityCredit: 0,
    })
  ) {
    fail("EMPTY_OBJECT_DENOMINATOR_POLICY_INVALID", "evidencePolicy");
  }
}

function readSources(repositoryRoot, contract) {
  validateContract(contract);
  const root = realpathSync(repositoryRoot);
  const rootPrefix = `${root}${sep}`;
  return Object.fromEntries(
    Object.entries(contract.sourceBindings).map(([key, binding]) => {
      const sourcePath = resolve(root, binding.path);
      const stat = lstatSync(sourcePath);
      const canonicalPath = realpathSync(sourcePath);
      if (stat.isSymbolicLink() || !stat.isFile() || !canonicalPath.startsWith(rootPrefix)) {
        fail("EMPTY_OBJECT_DENOMINATOR_SOURCE_PATH_INVALID", key);
      }
      const bytes = readFileSync(canonicalPath);
      if (digest(bytes) !== binding.sha256) {
        fail("EMPTY_OBJECT_DENOMINATOR_SOURCE_HASH_DRIFT", key);
      }
      return [key, JSON.parse(bytes.toString("utf8"))];
    }),
  );
}

function stableIdentity(sourceSurface, objectType, sourceIdentity) {
  return digest(canonical({ sourceSurface, objectType, sourceIdentity }));
}

function clientTableRecords(source, contract) {
  if (!Array.isArray(source.groups)) {
    fail("EMPTY_OBJECT_DENOMINATOR_CLIENT_TABLE_SOURCE_INVALID", "groups");
  }
  const names = source.groups.flatMap((group) => group.sourceTables ?? []);
  const unique = [...new Set(names)].sort();
  if (
    names.length !== contract.expectedDenominator.clientTables ||
    unique.length !== contract.expectedDenominator.clientTables ||
    unique.some((name) => typeof name !== "string" || name.length === 0)
  ) {
    fail("EMPTY_OBJECT_DENOMINATOR_CLIENT_TABLE_COUNT_DRIFT", "client tables");
  }
  return unique.map((name) => {
    const objectIdentitySha256 = stableIdentity("desktop_client", "table", name);
    return {
      objectStableId: `client-table:${objectIdentitySha256.slice(0, 20)}`,
      sourceSurface: "desktop_client",
      objectType: "table",
      identityEvidenceStatus: "hash_bound_source_identity",
      objectIdentitySha256,
      rowEvidenceStatus: "unknown_no_per_object_receipt",
      nonNullEvidenceStatus: "unknown_no_per_object_receipt",
      callEvidenceStatus: "not_applicable",
      objectEvidenceSha256: digest(
        canonical({ sourceSha256: contract.sourceBindings.clientTableMap.sha256, objectIdentitySha256 }),
      ),
      denominatorDisposition: "included",
    };
  });
}

function clientRoutineRecords(source, contract) {
  if (!Array.isArray(source.routines) || source.routines.length !== 212) {
    fail("EMPTY_OBJECT_DENOMINATOR_CLIENT_ROUTINE_COUNT_DRIFT", "routines");
  }
  const routineIds = new Set();
  return [...source.routines]
    .sort((left, right) => left.routineId.localeCompare(right.routineId))
    .map((routine) => {
      if (
        typeof routine.routineId !== "string" ||
        routineIds.has(routine.routineId) ||
        !["function", "procedure", "trigger"].includes(routine.kind) ||
        !Array.isArray(routine.calledRoutines) ||
        !SHA256.test(routine.structuralHash ?? "")
      ) {
        fail("EMPTY_OBJECT_DENOMINATOR_CLIENT_ROUTINE_SOURCE_INVALID", "routine");
      }
      routineIds.add(routine.routineId);
      const callSetSha256 = digest(canonical([...routine.calledRoutines].sort()));
      const objectIdentitySha256 = stableIdentity(
        "desktop_client",
        routine.kind,
        routine.routineId,
      );
      return {
        objectStableId: routine.routineId,
        sourceSurface: "desktop_client",
        objectType: routine.kind,
        identityEvidenceStatus: "hash_bound_source_identity",
        objectIdentitySha256,
        rowEvidenceStatus: "not_applicable",
        nonNullEvidenceStatus: "not_applicable",
        callEvidenceStatus:
          routine.calledRoutines.length > 0
            ? "static_reference_observed_runtime_unknown"
            : "static_no_reference_runtime_unknown",
        staticCallReferenceCount: routine.calledRoutines.length,
        staticCallSetSha256: callSetSha256,
        objectEvidenceSha256: digest(
          canonical({
            sourceSha256: contract.sourceBindings.clientRoutineLedger.sha256,
            structuralHash: routine.structuralHash,
            callSetSha256,
          }),
        ),
        denominatorDisposition: "included",
      };
    });
}

function groupWebTableRecords(contract) {
  const aggregate = contract.groupWebAggregateEvidence;
  return Array.from({ length: aggregate.tables }, (_value, index) => {
    const ordinal = index + 1;
    const objectStableId = `group-web:table:${String(ordinal).padStart(5, "0")}`;
    const objectIdentitySha256 = stableIdentity(
      "group_web",
      "table_identity_pending",
      `${aggregate.schemaSha256}:${aggregate.tableRowCountSetSha256}:${ordinal}`,
    );
    return {
      objectStableId,
      sourceSurface: "group_web",
      objectType: "table_identity_pending",
      identityEvidenceStatus: "opaque_slot_pending_authoritative_export",
      objectIdentitySha256,
      rowEvidenceStatus: "unknown_aggregate_only",
      nonNullEvidenceStatus: "unknown_no_per_object_receipt",
      callEvidenceStatus: "not_applicable",
      objectEvidenceSha256: digest(
        canonical({
          schemaSha256: aggregate.schemaSha256,
          tableRowCountSetSha256: aggregate.tableRowCountSetSha256,
          ordinal,
        }),
      ),
      denominatorDisposition: "included",
    };
  });
}

function deriveAuthority(sources, contract) {
  const atomic = sources.clientAtomicInventory;
  if (
    atomic?.expectedCounts?.tables !== 162 ||
    atomic?.expectedCounts?.rules !== 212 ||
    atomic?.productionImport !== "HOLD"
  ) {
    fail("EMPTY_OBJECT_DENOMINATOR_CLIENT_AUTHORITY_INVALID", "client atomic inventory");
  }
  const dual = sources.dualSourceReconciliation;
  const catalog = dual?.sources?.groupWeb?.catalog;
  const expected = contract.groupWebAggregateEvidence;
  if (
    dual?.status !== "reviewed_read_only_baseline" ||
    dual?.migrationPolicy?.operationMode !== "read_only_inventory_and_reconciliation" ||
    dual?.migrationPolicy?.productionImport !== "HOLD" ||
    catalog?.tables !== expected.tables ||
    catalog?.nonemptyTables !== expected.nonemptyTables ||
    catalog?.rows !== expected.rows ||
    catalog?.schemaHash !== expected.schemaSha256 ||
    catalog?.tableRowCountHash !== expected.tableRowCountSetSha256
  ) {
    fail("EMPTY_OBJECT_DENOMINATOR_GROUP_WEB_AUTHORITY_INVALID", "dual-source baseline");
  }
}

function materialize(sources, contract) {
  deriveAuthority(sources, contract);
  const records = [
    ...clientTableRecords(sources.clientTableMap, contract),
    ...clientRoutineRecords(sources.clientRoutineLedger, contract),
    ...groupWebTableRecords(contract),
  ];
  const staticCallReferencesObserved = records.filter(
    (record) => record.callEvidenceStatus === "static_reference_observed_runtime_unknown",
  ).length;
  const staticNoCallReferencesObserved = records.filter(
    (record) => record.callEvidenceStatus === "static_no_reference_runtime_unknown",
  ).length;
  const body = {
    formatVersion: 1,
    ledgerKind: "yuzhou_hr_legacy_dual_source_empty_object_denominator_ledger",
    status: "SOURCE_BOUND_DENOMINATOR_ONLY",
    sourceBindingSetSha256: digest(canonical(contract.sourceBindings)),
    summary: {
      clientTables: 162,
      clientRoutines: 212,
      groupWebTables: 438,
      totalObjects: 812,
      tableObjectsWithUnknownRowEvidence: 600,
      tableObjectsWithUnknownNonNullEvidence: 600,
      routinesWithRuntimeCallEvidenceUnknown: 212,
      routinesWithStaticCallReferences: staticCallReferencesObserved,
      routinesWithNoStaticCallReferences: staticNoCallReferencesObserved,
      groupWebAggregate: {
        tables: 438,
        nonemptyTables: 215,
        emptyTables: 223,
        rows: 320406,
        perObjectAssignmentStatus: "unknown_not_inferred_from_aggregate",
      },
    },
    records,
    compatibilityScoreContribution: 0,
    containsBusinessValues: false,
    productionImport: "HOLD",
  };
  return { ...body, ledgerSha256: digest(canonical(body)) };
}

export function verifyLegacyDualSourceEmptyObjectDenominator({
  contract,
  ledger,
  repositoryRoot,
}) {
  const sources = readSources(repositoryRoot, contract);
  const expected = materialize(sources, contract);
  if (!same(ledger, expected)) {
    fail("EMPTY_OBJECT_DENOMINATOR_MATERIALIZATION_DRIFT", "ledger");
  }
  const ids = ledger.records.map((record) => record.objectStableId);
  if (
    ids.length !== 812 ||
    new Set(ids).size !== ids.length ||
    ledger.records.some(
      (record) =>
        record.denominatorDisposition !== "included" ||
        !SHA256.test(record.objectIdentitySha256) ||
        !SHA256.test(record.objectEvidenceSha256),
    ) ||
    ledger.compatibilityScoreContribution !== 0 ||
    ledger.containsBusinessValues !== false ||
    ledger.productionImport !== "HOLD"
  ) {
    fail("EMPTY_OBJECT_DENOMINATOR_FALSE_COVERAGE", "records");
  }
  return {
    status: "PASS",
    totalObjects: ledger.summary.totalObjects,
    unknownRowObjects: ledger.summary.tableObjectsWithUnknownRowEvidence,
    groupWebAggregateEmptyTables: ledger.summary.groupWebAggregate.emptyTables,
    groupWebPerObjectAssignments: 0,
    compatibilityScoreContribution: 0,
    productionImport: "HOLD",
    ledgerSha256: ledger.ledgerSha256,
  };
}

export function buildLegacyDualSourceEmptyObjectDenominator({ contract, repositoryRoot }) {
  const sources = readSources(repositoryRoot, contract);
  const ledger = materialize(sources, contract);
  return {
    ledger,
    report: verifyLegacyDualSourceEmptyObjectDenominator({
      contract,
      ledger,
      repositoryRoot,
    }),
  };
}

function main() {
  const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const contract = JSON.parse(
    readFileSync(
      resolve(
        repositoryRoot,
        "scripts/hr-cutover/contracts/legacy-dual-source-empty-object-denominator-v1.json",
      ),
      "utf8",
    ),
  );
  const outIndex = process.argv.indexOf("--out");
  if (outIndex >= 0 && (!process.argv[outIndex + 1] || outIndex !== 2 || process.argv.length !== 4)) {
    fail("EMPTY_OBJECT_DENOMINATOR_ARGUMENT_INVALID", "--out");
  }
  if (outIndex < 0 && process.argv.length !== 2) {
    fail("EMPTY_OBJECT_DENOMINATOR_ARGUMENT_INVALID", "arguments");
  }
  const result = buildLegacyDualSourceEmptyObjectDenominator({ contract, repositoryRoot });
  if (outIndex >= 0) {
    writeFileSync(resolve(process.argv[outIndex + 1]), `${JSON.stringify(result.ledger, null, 2)}\n`, {
      mode: 0o600,
    });
  }
  process.stdout.write(`${JSON.stringify(result.report)}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof LegacyDualSourceEmptyObjectDenominatorError ? error.code : "EMPTY_OBJECT_DENOMINATOR_UNEXPECTED"}\n`,
    );
    process.exitCode = 1;
  }
}
