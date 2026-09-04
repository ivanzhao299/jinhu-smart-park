import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { validateLegacyAtomicInventory } from "./legacy-atomic-inventory-lib.mjs";

export class LegacyRoutineLogicLedgerError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyRoutineLogicLedgerError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyRoutineLogicLedgerError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const unique = values => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "en"));
const stripComments = source => source.replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/--[^\r\n]*/gu, " ");
const normalizeIdentifier = value => value.replace(/[\[\]`;]/gu, "").replace(/^dbo\./iu, "").trim();

function readPlainAbsolute(path, label) {
  if (!isAbsolute(path)) fail("SOURCE_PATH_INVALID", `${label}:absolute path required`);
  let real;
  try { real = realpathSync(path); } catch { fail("SOURCE_FILE_MISSING", label); }
  if (!statSync(real).isFile() || lstatSync(path).isSymbolicLink()) fail("SOURCE_PATH_INVALID", label);
  return readFileSync(real);
}

export function analyzeLegacyRoutineSource(source, routineNames = []) {
  const sql = stripComments(source.replace(/^\uFEFF/u, "")).replace(/\r\n?/gu, "\n");
  const directSql = sql.replace(/N?'(?:''|[^'])*'/giu, "''");
  const dynamicSqlFragments=[...sql.matchAll(/N?'((?:''|[^'])*)'/giu)]
    .map(match=>({
      text:match[1].replace(/''/gu,"'"),
      continuesAfter:/^\s*\+/u.test(sql.slice((match.index??0)+match[0].length)),
    }))
    .filter(fragment=>/\b(?:select|from|join|using|update|insert|delete|merge|alter)\b/iu.test(fragment.text));
  const dynamicSql=dynamicSqlFragments.map(fragment=>fragment.text).join("\n");
  const headerEnd = sql.search(/\b(?:as|returns)\b/iu);
  const header = headerEnd >= 0 ? sql.slice(0, headerEnd) : sql;
  const parameters = [...header.matchAll(/@([\p{L}\p{N}_]+)\s+([a-z]+(?:\s*\([^)]*\))?)(?:\s*=\s*[^,\n]+)?/giu)]
    .map(match => ({ name: match[1], sourceType: match[2].replace(/\s+/gu, " ").trim().toLowerCase() }));

  const tablePattern = /(?<!@)\b(from|join|using|update|insert(?:\s+into)?|delete\s+from|merge(?:\s+into)?|alter\s+table|into)\s+([\[\]\p{L}\p{N}_.#]+)/giu;
  const referencesFrom=(text,{rejectTrailingTarget=false}={})=>[...text.matchAll(tablePattern)].flatMap(match=>{
    const table=normalizeIdentifier(match[2]);
    const targetRunsToFragmentEnd=(match.index??0)+match[0].trimEnd().length>=text.trimEnd().length;
    return !table||table.startsWith("@")||/^(?:as|exec(?:ute)?|select|set|values|where)$/iu.test(table)||(rejectTrailingTarget&&targetRunsToFragmentEnd)?[]:[{operation:match[1].toLowerCase().replace(/\s+/gu,"_"),table}];
  });
  const directReferences = referencesFrom(directSql);
  // Keep separately quoted dynamic fragments isolated. Joining an incomplete
  // `UPDATE ` fragment to an unrelated `ROUND(...)` fragment can otherwise
  // invent a table named `round`; concatenated identifiers remain fail-closed.
  const dynamicReferences = dynamicSqlFragments.flatMap(fragment=>referencesFrom(fragment.text,{rejectTrailingTarget:fragment.continuesAfter}));
  const writeOperations = new Set(["update", "insert", "insert_into", "delete_from", "merge", "merge_into", "alter_table", "into"]);
  const dynamicWriteTables=unique(dynamicReferences.filter(item=>writeOperations.has(item.operation)).map(item=>item.table));
  const allReferences=[...directReferences,...dynamicReferences];
  const writeTables = unique(allReferences.filter(item => writeOperations.has(item.operation)).map(item => item.table));
  const referencedTables = unique(allReferences.map(item => item.table));
  const readTables = unique(allReferences.filter(item => !writeOperations.has(item.operation) || item.operation === "update").map(item => item.table));
  const routineNameSet = new Set(routineNames.map(value => value.toLowerCase()));
  const calledRoutines = [];
  for (const match of directSql.matchAll(/\bexec(?:ute)?\s+(?:dbo\.)?\[?([\p{L}\p{N}_]+)\]?/giu)) {
    if (routineNameSet.has(match[1].toLowerCase())) calledRoutines.push(match[1]);
  }
  for (const match of directSql.matchAll(/\bdbo\.\[?([\p{L}\p{N}_]+)\]?\s*\(/giu)) {
    if (routineNameSet.has(match[1].toLowerCase())) calledRoutines.push(match[1]);
  }
  const joinPredicates = unique([...directSql.matchAll(/([\p{L}\p{N}_]+)\.\[?([\p{L}\p{N}_]+)\]?\s*=\s*([\p{L}\p{N}_]+)\.\[?([\p{L}\p{N}_]+)\]?/giu)]
    .map(match => `${match[1]}.${match[2]}=${match[3]}.${match[4]}`));
  const signals = [
    ["conditional_branch", /\b(?:if|case)\b/iu], ["aggregation_sum", /\bsum\s*\(/iu],
    ["aggregation_average", /\bavg\s*\(/iu], ["aggregation_count", /\bcount\s*\(/iu],
    ["decimal_rounding", /\bround\s*\(/iu], ["null_defaulting", /\bisnull\s*\(/iu],
    ["date_arithmetic", /\b(?:datediff|dateadd)\s*\(/iu], ["hierarchy_prefix_scope", /\blike\s+@\w+\s*\+\s*['"]%/iu],
    ["dynamic_sql", /\bexec\s*\(\s*@|\bsp_executesql\b/iu], ["temporary_table", /#[\p{L}\p{N}_]+/u],
    ["cursor", /\bcursor\b/iu], ["explicit_transaction", /\b(?:begin\s+tran|commit\s+tran|rollback\s+tran)\b/iu]
  ].filter(([, pattern]) => pattern.test(sql)).map(([signal]) => signal);
  const directStatementCount=(...operations)=>directReferences.filter(reference=>operations.includes(reference.operation)).length;
  const statementProfile = {
    select: (directSql.match(/\bselect\b/giu) ?? []).length,
    insert: directStatementCount("insert","insert_into"),
    update: directStatementCount("update"),
    delete: directStatementCount("delete_from"),
    merge: directStatementCount("merge","merge_into"),
    alter: directStatementCount("alter_table")
  };
  const dynamicTableFamilies = /['"]salary0?['"]|@table\s*=\s*['"]salary/iu.test(sql) ? ["salary01..salary35"] : [];
  const dynamicMutationStatus=signals.includes("dynamic_sql")?(dynamicWriteTables.length?"detected":"unknown_requires_review"):"none";
  return { parameters, referencedTables, readTables, writeTables, dynamicWriteTables, dynamicMutationStatus, dynamicTableFamilies, calledRoutines: unique(calledRoutines), joinPredicates, signals, statementProfile };
}

function capabilityFor(name, kind, analysis) {
  if (kind === "function") return /(?:name|def|py)/iu.test(name) ? "reference_label_or_search_helper" : "derived_value_helper";
  if (kind === "trigger") return "schema_change_hook";
  if (analysis.dynamicMutationStatus==="unknown_requires_review") return "unknown_dynamic_mutation";
  if (/(?:query|report|records?|selectcommand|_r$|^web_)/iu.test(name) && analysis.writeTables.length === 0) return "query_or_report_projection";
  if (/(?:count|total|analyse)/iu.test(name) && analysis.writeTables.length === 0) return "statistical_aggregation";
  if (/(?:compute|inputfrom|inputbase|inputjob|refresh|genprice|createall)/iu.test(name)) return "calculation_or_materialization";
  if (analysis.writeTables.length > 0) return "business_state_mutation";
  return "lookup_or_query_projection";
}

function deriveDomain(routine, analysis, tableToDomain, map) {
  const special = map.specialDomainRules.find(rule => new RegExp(rule.pattern, "iu").test(routine.name));
  if (special) return { primaryDomain: special.domain, capability: special.capability, classificationEvidence: `name:${special.pattern}` };
  if (map.technicalRoutinePatterns.some(pattern => new RegExp(pattern, "iu").test(routine.name))) {
    return { primaryDomain: "technical_residue", capability: "sql_server_designer_source_control", classificationEvidence: "technical-routine-pattern" };
  }
  const scores = new Map();
  for (const table of analysis.referencedTables) {
    const domain = tableToDomain.get(table.toLowerCase());
    if (domain) scores.set(domain, (scores.get(domain) ?? 0) + 1);
  }
  const nameHints = [
    ["insurance_welfare", /insure/iu], ["attendance_leave", /(?:timekeep|att|leave|errand|nighttime|worktime|fulldays)/iu],
    ["performance", /assess|^u_ass|^web_ass|^bs_ass/iu], ["reward_discipline", /bonus/iu],
    ["training", /(?:train|course|knowhow)/iu], ["contract", /compact/iu], ["recruitment", /accept/iu],
    ["payroll", /(?:salary|pay|tax|fromunit|inputfrom|inputbase|inputjob|piece|genprice)/iu],
    ["employment_lifecycle", /(?:readjust|inaugural|away|formal|newperson|inout)/iu],
    ["authorization_audit", /(?:rights|systab|login|copyright)/iu],
    ["organization_position", /(?:department|\bjob\b|getdeppersons|getjobpersons)/iu],
    ["employee_profile", /(?:family|ticket|photo|birthday|personinfo|personroom|agecount|hurtpersons)/iu],
    ["reporting", /(?:report|analyse|crossquery|searchmain)/iu]
  ];
  for (const [domain, pattern] of nameHints) if (pattern.test(routine.name)) scores.set(domain, (scores.get(domain) ?? 0) + 3);
  const ranked = [...scores].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en"));
  const primaryDomain = ranked[0]?.[0];
  if (!primaryDomain) fail("ROUTINE_DOMAIN_UNRESOLVED", routine.name);
  return { primaryDomain, capability: capabilityFor(routine.name, routine.kind, analysis), classificationEvidence: "table-dependency-and-name" };
}

const canonicalFamily = name => name.replace(/(?:_bak\d*|_old|_new|2003)$/iu, "");

export function buildLegacyRoutineLogicLedger({ inventory, relationalModel, tableMap, capabilityMap, routineDirectory, repositoryRoot }) {
  const inventoryReport = validateLegacyAtomicInventory(inventory);
  if (relationalModel.summary?.routines !== inventory.routines.length) fail("RELATIONAL_MODEL_ROUTINE_COUNT_MISMATCH", String(relationalModel.summary?.routines));
  const groups = tableMap.groups ?? [];
  const tableToDomain = new Map(groups.flatMap(group => group.sourceTables.map(table => [table.toLowerCase(), group.domain])));
  const tableNames = new Set(inventory.tables.map(table => table.name.toLowerCase()));
  const routineNames = inventory.routines.map(routine => routine.name);
  const dependencyById = new Map(relationalModel.routineDependencies.map(item => [item.routineId, item]));
  const realDirectory = realpathSync(routineDirectory);
  if (!statSync(realDirectory).isDirectory() || lstatSync(routineDirectory).isSymbolicLink()) fail("ROUTINE_PATH_INVALID", "routine directory");
  const sourceByHash = new Map();
  for (const file of readdirSync(realDirectory)) {
    const path = join(realDirectory, file);
    if (lstatSync(path).isSymbolicLink() || !statSync(path).isFile() || !realpathSync(path).startsWith(`${realDirectory}${sep}`)) fail("ROUTINE_FILE_INVALID", file);
    const bytes = readFileSync(path);
    const hash = sha256(bytes);
    if (sourceByHash.has(hash)) fail("ROUTINE_SOURCE_HASH_DUPLICATE", hash);
    sourceByHash.set(hash, { file: basename(file), bytes });
  }
  for (const evidence of Object.values(capabilityMap.domainEvidence)) {
    for (const path of [...evidence.targetServices, ...evidence.targetPages]) {
      if (!existsSync(resolve(repositoryRoot, path))) fail("TARGET_EVIDENCE_MISSING", path);
    }
  }
  const rows = inventory.routines.map(routine => {
    const artifact = sourceByHash.get(routine.sourceArtifactSha256);
    if (!artifact) fail("ROUTINE_SOURCE_MISSING", routine.name);
    const analysis = analyzeLegacyRoutineSource(artifact.bytes.toString("utf8"), routineNames);
    const dependency = dependencyById.get(routine.id);
    if (!dependency) fail("ROUTINE_DEPENDENCY_MISSING", routine.name);
    analysis.referencedTables = unique([...analysis.referencedTables, ...dependency.tables]);
    analysis.readTables = unique([...analysis.readTables, ...dependency.tables.filter(table => !analysis.writeTables.includes(table))]);
    const { primaryDomain, capability, classificationEvidence } = deriveDomain(routine, analysis, tableToDomain, capabilityMap);
    const secondaryDomains = unique(analysis.referencedTables.map(table => tableToDomain.get(table.toLowerCase())).filter(domain => domain && domain !== primaryDomain));
    const externalOrGeneratedTables = analysis.referencedTables.filter(table => !tableNames.has(table.toLowerCase()));
    const evidence = capabilityMap.domainEvidence[primaryDomain];
    if (!evidence) fail("DOMAIN_EVIDENCE_MISSING", primaryDomain);
    const activeNoopTrigger = routine.kind === "trigger" && Object.values(analysis.statementProfile).reduce((sum, value) => sum + value, 0) === 1 && analysis.statementProfile.select === 1;
    const technical = primaryDomain === "technical_residue" || capability === "sql_server_designer_source_control";
    const hasTargetSurface = evidence.targetServices.length + evidence.targetApis.length + evidence.targetPages.length > 0;
    const parityStatus = activeNoopTrigger ? "legacy_noop_replace_by_normalized_model" : technical ? "decommission_after_dependency_confirmation" : hasTargetSurface ? "partial_domain_surface_rule_parity_pending" : "target_capability_missing";
    const risk = analysis.signals.includes("dynamic_sql") || secondaryDomains.length >= 2 ? "critical" : analysis.writeTables.length || analysis.signals.some(signal => signal.includes("aggregation") || signal === "decimal_rounding") ? "high" : technical ? "low" : "medium";
    return {
      routineId: routine.id,
      kind: routine.kind,
      sourceName: routine.name,
      sourceArtifact: artifact.file,
      sourceArtifactSha256: routine.sourceArtifactSha256,
      structuralHash: routine.structuralHash,
      canonicalFamily: canonicalFamily(routine.name),
      primaryDomain,
      secondaryDomains,
      businessCapability: capability,
      classificationEvidence,
      parameters: analysis.parameters,
      readTables: analysis.readTables,
      writeTables: analysis.writeTables,
      dynamicWriteTables: analysis.dynamicWriteTables,
      dynamicMutationStatus: analysis.dynamicMutationStatus,
      externalOrGeneratedTables,
      dynamicTableFamilies: analysis.dynamicTableFamilies,
      calledRoutines: analysis.calledRoutines,
      joinPredicates: analysis.joinPredicates,
      logicSignals: analysis.signals,
      statementProfile: analysis.statementProfile,
      targetTables: groups.find(group => group.domain === primaryDomain)?.targetTables ?? [],
      targetServices: evidence.targetServices,
      targetApis: evidence.targetApis,
      targetPages: evidence.targetPages,
      parityStatus,
      parityRisk: risk,
      reviewStatus: activeNoopTrigger ? "source_active_body_verified_noop" : technical ? "dependency_confirmation_pending" : "atomic_logic_extracted_requires_business_parity_test"
    };
  }).sort((a, b) => `${a.primaryDomain}:${a.sourceName}`.localeCompare(`${b.primaryDomain}:${b.sourceName}`, "en"));
  if (rows.length !== inventory.routines.length || new Set(rows.map(row => row.routineId)).size !== rows.length) fail("ROUTINE_LEDGER_COVERAGE_INVALID", String(rows.length));
  const by = key => Object.fromEntries([...new Set(rows.map(row => row[key]))].sort().map(value => [value, rows.filter(row => row[key] === value).length]));
  return {
    formatVersion: 1,
    ledgerKind: "yuzhou_hr_legacy_modern_routine_logic_ledger",
    sourceBinding: {
      inventorySha256: inventoryReport.inventoryHash,
      relationalModelSha256: sha256(JSON.stringify(relationalModel)),
      tableMapSha256: sha256(JSON.stringify(tableMap)),
      capabilityMapSha256: sha256(JSON.stringify(capabilityMap))
    },
    summary: {
      sourceRoutines: inventory.routines.length,
      mappedRoutines: rows.length,
      atomicLogicCoveragePercent: Number(((rows.length / inventory.routines.length) * 100).toFixed(2)),
      byKind: by("kind"),
      byDomain: by("primaryDomain"),
      byParityStatus: by("parityStatus"),
      byRisk: by("parityRisk"),
      routinesWithWrites: rows.filter(row => row.writeTables.length).length,
      routinesWithDynamicSql: rows.filter(row => row.logicSignals.includes("dynamic_sql")).length,
      crossDomainRoutines: rows.filter(row => row.secondaryDomains.length).length,
      externalOrGeneratedTableReferences: unique(rows.flatMap(row => row.externalOrGeneratedTables)).length
    },
    routines: rows,
    productionImport: "HOLD"
  };
}

function parseArgs(argv) {
  const args = { inventory: null, relationalModel: null, tableMap: null, capabilityMap: null, routineDirectory: null, repositoryRoot: null, json: false };
  const keys = new Map([["--inventory", "inventory"], ["--relational-model", "relationalModel"], ["--table-map", "tableMap"], ["--capability-map", "capabilityMap"], ["--routine-directory", "routineDirectory"], ["--repository-root", "repositoryRoot"]]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (keys.has(arg) && argv[index + 1]) args[keys.get(arg)] = argv[++index];
    else if (arg === "--json") args.json = true;
    else fail("CLI_ARGUMENT_INVALID", String(arg));
  }
  for (const key of keys.values()) if (!args[key] || !isAbsolute(args[key])) fail("CLI_ARGUMENT_INVALID", `${key} must be absolute`);
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const loadJson = (path, label) => JSON.parse(readPlainAbsolute(path, label).toString("utf8"));
    const report = buildLegacyRoutineLogicLedger({
      inventory: loadJson(args.inventory, "inventory"),
      relationalModel: loadJson(args.relationalModel, "relational model"),
      tableMap: loadJson(args.tableMap, "table map"),
      capabilityMap: loadJson(args.capabilityMap, "capability map"),
      routineDirectory: args.routineDirectory,
      repositoryRoot: args.repositoryRoot
    });
    process.stdout.write(`${args.json ? JSON.stringify(report, null, 2) : JSON.stringify(report)}\n`);
  } catch (error) {
    const code = error instanceof LegacyRoutineLogicLedgerError ? error.code : "LEGACY_ROUTINE_LOGIC_LEDGER_FAILED";
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
