import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve, sep } from "node:path";

export class LegacyAtomicInventoryError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyAtomicInventoryError";
    this.code = code;
  }
}

function fail(code, detail) {
  throw new LegacyAtomicInventoryError(code, detail);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableId(prefix, identity) {
  return `${prefix}-${sha256(identity).slice(0, 16).toUpperCase()}`;
}

function normalizedText(buffer) {
  return buffer.toString("utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

const FORBIDDEN_VALUE_PATTERNS = [
  [/(?:jdbc:|file:\/\/|(?:postgres(?:ql)?|sqlserver):\/\/|password\s*=|BEGIN [A-Z ]*PRIVATE KEY)/i, "secret_or_connection"],
  [/(?:^|\W)1[3-9]\d{9}(?:$|\W)/, "phone"],
  [/(?:^|\W)\d{17}[\dXx](?:$|\W)/, "identity"],
  [/(?:^|\W)\d{16,19}(?:$|\W)/, "bank_card"],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, "email"]
];

function assertSafeStructuralText(value, label) {
  if (typeof value !== "string") return;
  if (value.includes("\0") || /[\r\n]/.test(value)) fail("SENSITIVE_STRUCTURAL_TEXT", `${label}:control_character`);
  if (isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || value.includes("Downloads/") || value.includes("/Users/")) fail("ABSOLUTE_PATH_FORBIDDEN", label);
  for (const [pattern, kind] of FORBIDDEN_VALUE_PATTERNS) if (pattern.test(value)) fail("SENSITIVE_STRUCTURAL_TEXT", `${label}:${kind}`);
}

function assertPlainFile(path, root, label) {
  let real;
  try {
    real = realpathSync(path);
  } catch {
    fail("SOURCE_ARTIFACT_MISSING", label);
  }
  if (!real.startsWith(`${root}${sep}`) || !statSync(real).isFile() || lstatSync(path).isSymbolicLink()) fail("SOURCE_PATH_INVALID", label);
  return real;
}

function parseMarkdownRow(line, label) {
  if (!line.startsWith("|") || !line.endsWith("|")) fail("TABLE_FORMAT_UNKNOWN", label);
  const cells = line.slice(1, -1).split("|").map((cell) => cell.trim());
  if (cells.length !== 5) fail("TABLE_FORMAT_UNKNOWN", `${label}:expected_5_cells`);
  return cells;
}

export function parseTableCatalog(buffer, sourceSha) {
  const lines = normalizedText(buffer).split("\n");
  const tables = [];
  let index = 0;
  while (index < lines.length) {
    if (!lines[index].startsWith("### ")) {
      if (lines[index].trim() !== "") fail("TABLE_FORMAT_UNKNOWN", `line_${index + 1}`);
      index += 1;
      continue;
    }
    const name = lines[index].slice(4).trim();
    assertSafeStructuralText(name, `table_${tables.length + 1}`);
    if (!name) fail("TABLE_FORMAT_UNKNOWN", `line_${index + 1}:empty_table`);
    index += 1;
    while (lines[index]?.trim() === "") index += 1;
    if (lines[index] !== "| 列 | 类型 | 空 | 默认 | 说明 |" || !/^\|---\|---\|---\|---\|---\|$/.test(lines[index + 1] ?? "")) {
      fail("TABLE_FORMAT_UNKNOWN", `${name}:header`);
    }
    index += 2;
    const columns = [];
    while (index < lines.length && lines[index].startsWith("|")) {
      const [columnName, type, nullableCode, defaultValue, description] = parseMarkdownRow(lines[index], `${name}:line_${index + 1}`);
      for (const [label, value] of [["name", columnName], ["type", type], ["default", defaultValue], ["description", description]]) assertSafeStructuralText(value, `${name}.${label}`);
      if (!columnName || !type || !["Y", "N"].includes(nullableCode)) fail("TABLE_FORMAT_UNKNOWN", `${name}:line_${index + 1}:column`);
      const structural = { name: columnName, type, nullable: nullableCode === "Y", default: defaultValue || null, description: description || null };
      columns.push({ id: stableId("COLUMN", `${name}\0${columnName}`), ...structural, structuralHash: sha256(JSON.stringify(structural)) });
      index += 1;
    }
    if (columns.length === 0) fail("TABLE_FORMAT_UNKNOWN", `${name}:no_columns`);
    const identity = { name, columns: columns.map(({ id: _id, structuralHash: _hash, ...column }) => column) };
    tables.push({ id: stableId("TABLE", name), name, sourceArtifactSha256: sourceSha, columnCount: columns.length, columns, structuralHash: sha256(JSON.stringify(identity)) });
  }
  return tables.sort((a, b) => a.name.localeCompare(b.name, "en"));
}

const ROUTINE_PREFIXES = [
  ["SQL_STORED_PROCEDURE_", "procedure"],
  ["SQL_SCALAR_FUNCTION_", "function"],
  ["SQL_INLINE_TABLE_VALUED_FUNCTION_", "function"],
  ["SQL_TRIGGER_", "trigger"]
];

export function parseRoutines(directory, root) {
  const names = readdirSync(directory).sort((a, b) => a.localeCompare(b, "en"));
  return names.map((fileName) => {
    const match = ROUTINE_PREFIXES.find(([prefix]) => fileName.startsWith(prefix));
    if (!match || !fileName.endsWith("_sql")) fail("ROUTINE_FORMAT_UNKNOWN", fileName);
    const [prefix, kind] = match;
    const name = fileName.slice(prefix.length, -4);
    if (!name || !/^[A-Za-z0-9_]+$/.test(name)) fail("ROUTINE_FORMAT_UNKNOWN", fileName);
    const path = assertPlainFile(join(directory, fileName), root, `routine:${fileName}`);
    const sourceArtifactSha256 = sha256(readFileSync(path));
    const structural = { kind, name };
    return { id: stableId("RULE", `${kind}\0${name}`), ...structural, sourceArtifactSha256, structuralHash: sha256(JSON.stringify(structural)) };
  }).sort((a, b) => `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`, "en"));
}

function cleanPageTitle(lines, sourceKey) {
  const candidates = lines.map((line) => line.replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim())
    .filter((line) => line && line !== "无标题文档");
  const title = candidates[0]?.replace(/[：:]\s*$/, "") || sourceKey;
  assertSafeStructuralText(title, `page:${sourceKey}`);
  if (title.length > 160) fail("HELP_FORMAT_UNKNOWN", `${sourceKey}:title_too_long`);
  return title;
}

export function parseHelpTopics(buffer, sourceSha) {
  const lines = normalizedText(buffer).split("\n");
  const pages = [];
  let current = null;
  for (const line of lines) {
    const marker = /^########## ([A-Za-z0-9_.-]+)$/.exec(line);
    if (marker) {
      if (current) pages.push(current);
      current = { sourceKey: marker[1], lines: [] };
    } else if (current) current.lines.push(line);
    else if (line.trim()) fail("HELP_FORMAT_UNKNOWN", "content_before_first_topic");
  }
  if (current) pages.push(current);
  if (pages.length === 0) fail("HELP_FORMAT_UNKNOWN", "no_topics");
  return pages.map(({ sourceKey, lines: body }) => {
    const title = cleanPageTitle(body, sourceKey);
    const structural = { sourceKey, title };
    return { id: stableId("PAGE", sourceKey), ...structural, sourceArtifactSha256: sourceSha, structuralHash: sha256(JSON.stringify(structural)) };
  }).sort((a, b) => a.sourceKey.localeCompare(b.sourceKey, "en"));
}

function assertUnique(items, field, code) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item[field])) fail(code, item[field]);
    seen.add(item[field]);
  }
}

function assertExactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail("INVENTORY_SCHEMA_INVALID", `${label}:keys`);
}

export function validateLegacyAtomicInventory(inventory) {
  if (!inventory || inventory.formatVersion !== 1 || inventory.inventoryKind !== "yuzhou_hr_legacy_structural_atomic_inventory" || inventory.generatorVersion !== "1.0.0") fail("INVENTORY_SCHEMA_INVALID", "identity");
  assertExactKeys(inventory, ["formatVersion", "inventoryKind", "generatorVersion", "sourceArtifacts", "summary", "tables", "routines", "pages", "permissions"], "inventory");
  if (inventory.tables?.length !== 162) fail("TABLE_COUNT_MISMATCH", String(inventory.tables?.length));
  if (inventory.routines?.length !== 212) fail("RULE_COUNT_MISMATCH", String(inventory.routines?.length));
  if (inventory.pages?.length !== 46) fail("PAGE_COUNT_MISMATCH", String(inventory.pages?.length));
  const counts = Object.fromEntries(["procedure", "function", "trigger"].map((kind) => [kind, inventory.routines.filter((item) => item.kind === kind).length]));
  if (counts.procedure !== 194 || counts.function !== 16 || counts.trigger !== 2) fail("ROUTINE_KIND_COUNT_MISMATCH", JSON.stringify(counts));
  const columns = inventory.tables.reduce((sum, table) => sum + table.columns.length, 0);
  if (columns !== 2364) fail("COLUMN_COUNT_MISMATCH", String(columns));
  const expectedSummary = { tables: 162, columns, procedures: 194, functions: 16, triggers: 2, rules: 212, pages: inventory.pages.length };
  if (JSON.stringify(inventory.summary) !== JSON.stringify(expectedSummary)) fail("SUMMARY_MISMATCH", "derived counts differ");
  if (inventory.permissions?.status !== "pending_review" || inventory.permissions.expectedAuthorizationGrantEdges !== 915 || inventory.permissions.reasonCode !== "PERMISSION_GRANT_EDGE_INVENTORY_REQUIRES_PRIVATE_REVIEW" || inventory.permissions.importerContract?.policy !== "no_user_bound_rows_in_public_inventory_no_functionality_credit") fail("PERMISSION_CONTRACT_INVALID", "authorization grant edges must remain private and earn no functionality credit");
  assertUnique(inventory.tables, "name", "DUPLICATE_TABLE_NAME");
  assertUnique(inventory.tables, "id", "DUPLICATE_STABLE_ID");
  assertUnique(inventory.routines, "id", "DUPLICATE_STABLE_ID");
  assertUnique(inventory.pages, "id", "DUPLICATE_STABLE_ID");
  assertUnique(inventory.sourceArtifacts, "fileName", "DUPLICATE_SOURCE_ARTIFACT");
  for (const artifact of inventory.sourceArtifacts) {
    assertExactKeys(artifact, ["kind", "fileName", "sha256"], `sourceArtifact:${artifact.fileName}`);
    if (!/^[^/\\]+$/.test(artifact.fileName) || !/^[a-f0-9]{64}$/.test(artifact.sha256) || !["table_catalog", "help_topics", "routine_source"].includes(artifact.kind)) fail("INVENTORY_SCHEMA_INVALID", `sourceArtifact:${artifact.fileName}`);
    assertSafeStructuralText(artifact.fileName, "sourceArtifact.fileName");
  }
  const tableArtifacts = inventory.sourceArtifacts.filter((artifact) => artifact.kind === "table_catalog");
  const helpArtifacts = inventory.sourceArtifacts.filter((artifact) => artifact.kind === "help_topics");
  const routineArtifacts = inventory.sourceArtifacts.filter((artifact) => artifact.kind === "routine_source");
  if (tableArtifacts.length !== 1 || helpArtifacts.length !== 1 || routineArtifacts.length !== 212) fail("SOURCE_ARTIFACT_SET_INVALID", "expected one table catalog, one help artifact, and 212 routine artifacts");
  const routineArtifactByName = new Map(routineArtifacts.map((artifact) => [artifact.fileName, artifact]));
  const serialized = JSON.stringify(inventory);
  if (serialized.includes("/Users/") || serialized.includes("Downloads/") || serialized.includes("玉舟人力资源管理系统分析产出/")) fail("ABSOLUTE_PATH_FORBIDDEN", "serialized inventory");
  for (const table of inventory.tables) {
    assertExactKeys(table, ["id", "name", "sourceArtifactSha256", "columnCount", "columns", "structuralHash"], `table:${table.name}`);
    if (table.columnCount !== table.columns.length || table.columns.length === 0) fail("INVENTORY_SCHEMA_INVALID", `${table.name}:columns`);
    if (table.id !== stableId("TABLE", table.name)) fail("STABLE_ID_DRIFT", table.name);
    if (table.sourceArtifactSha256 !== tableArtifacts[0].sha256) fail("SOURCE_ARTIFACT_HASH_DRIFT", table.id);
    assertUnique(table.columns, "id", "DUPLICATE_STABLE_ID");
    for (const column of table.columns) {
      assertExactKeys(column, ["id", "name", "type", "nullable", "default", "description", "structuralHash"], `column:${table.name}.${column.name}`);
      for (const value of [column.name, column.type, column.default, column.description]) assertSafeStructuralText(value, `${table.name}.${column.name}`);
      const structural = { name: column.name, type: column.type, nullable: column.nullable, default: column.default, description: column.description };
      if (column.id !== stableId("COLUMN", `${table.name}\0${column.name}`)) fail("STABLE_ID_DRIFT", `${table.name}.${column.name}`);
      if (column.structuralHash !== sha256(JSON.stringify(structural))) fail("STRUCTURAL_HASH_DRIFT", `${table.name}.${column.name}`);
    }
    const identity = { name: table.name, columns: table.columns.map(({ id: _id, structuralHash: _hash, ...column }) => column) };
    if (table.structuralHash !== sha256(JSON.stringify(identity))) fail("STRUCTURAL_HASH_DRIFT", table.name);
  }
  for (const routine of inventory.routines) {
    assertExactKeys(routine, ["id", "kind", "name", "sourceArtifactSha256", "structuralHash"], `routine:${routine.name}`);
    const structural = { kind: routine.kind, name: routine.name };
    const sourceArtifact = routineArtifactByName.get(`${routine.kind}:${routine.name}`);
    if (!sourceArtifact || routine.sourceArtifactSha256 !== sourceArtifact.sha256) fail("SOURCE_ARTIFACT_HASH_DRIFT", routine.id);
    if (routine.id !== stableId("RULE", `${routine.kind}\0${routine.name}`)) fail("STABLE_ID_DRIFT", `${routine.kind}:${routine.name}`);
    if (routine.structuralHash !== sha256(JSON.stringify(structural))) fail("STRUCTURAL_HASH_DRIFT", `${routine.kind}:${routine.name}`);
  }
  for (const page of inventory.pages) {
    assertExactKeys(page, ["id", "sourceKey", "title", "sourceArtifactSha256", "structuralHash"], `page:${page.sourceKey}`);
    assertSafeStructuralText(page.title, `page:${page.sourceKey}`);
    if (page.sourceArtifactSha256 !== helpArtifacts[0].sha256) fail("SOURCE_ARTIFACT_HASH_DRIFT", page.id);
    const structural = { sourceKey: page.sourceKey, title: page.title };
    if (page.id !== stableId("PAGE", page.sourceKey)) fail("STABLE_ID_DRIFT", page.sourceKey);
    if (page.structuralHash !== sha256(JSON.stringify(structural))) fail("STRUCTURAL_HASH_DRIFT", page.sourceKey);
  }
  const artifactHashes = new Set(inventory.sourceArtifacts.map((artifact) => artifact.sha256));
  for (const item of [...inventory.tables, ...inventory.routines, ...inventory.pages]) if (!artifactHashes.has(item.sourceArtifactSha256)) fail("SOURCE_ARTIFACT_HASH_UNRESOLVED", item.id);
  return { ok: true, summary: expectedSummary, inventoryHash: sha256(`${JSON.stringify(inventory)}\n`) };
}

export function buildLegacyAtomicInventory(legacyRoot) {
  if (typeof legacyRoot !== "string" || !isAbsolute(legacyRoot)) fail("LEGACY_ROOT_INVALID", "--legacy-root must be absolute");
  const root = realpathSync(legacyRoot);
  if (!statSync(root).isDirectory()) fail("LEGACY_ROOT_INVALID", "not a directory");
  const tablePath = assertPlainFile(join(root, "table_columns.md"), root, "table_columns.md");
  const helpPath = assertPlainFile(join(root, "帮助文档全文.txt"), root, "help_topics");
  const routineDirectory = realpathSync(join(root, "存储过程源码"));
  if (!routineDirectory.startsWith(`${root}${sep}`) || !statSync(routineDirectory).isDirectory() || lstatSync(join(root, "存储过程源码")).isSymbolicLink()) fail("SOURCE_PATH_INVALID", "routine_directory");
  const tableBuffer = readFileSync(tablePath);
  const helpBuffer = readFileSync(helpPath);
  const tableSha = sha256(tableBuffer);
  const helpSha = sha256(helpBuffer);
  const routines = parseRoutines(routineDirectory, root);
  const tables = parseTableCatalog(tableBuffer, tableSha);
  const pages = parseHelpTopics(helpBuffer, helpSha);
  const sourceArtifacts = [
    { kind: "table_catalog", fileName: basename(tablePath), sha256: tableSha },
    { kind: "help_topics", fileName: basename(helpPath), sha256: helpSha },
    ...routines.map((routine) => ({ kind: "routine_source", fileName: `${routine.kind}:${routine.name}`, sha256: routine.sourceArtifactSha256 }))
  ];
  const inventory = {
    formatVersion: 1,
    inventoryKind: "yuzhou_hr_legacy_structural_atomic_inventory",
    generatorVersion: "1.0.0",
    sourceArtifacts,
    summary: {
      tables: tables.length,
      columns: tables.reduce((sum, table) => sum + table.columns.length, 0),
      procedures: routines.filter((item) => item.kind === "procedure").length,
      functions: routines.filter((item) => item.kind === "function").length,
      triggers: routines.filter((item) => item.kind === "trigger").length,
      rules: routines.length,
      pages: pages.length
    },
    tables,
    routines,
    pages,
    permissions: {
      status: "pending_review",
      expectedAuthorizationGrantEdges: 915,
      reasonCode: "PERMISSION_GRANT_EDGE_INVENTORY_REQUIRES_PRIVATE_REVIEW",
      importerContract: {
        input: "explicit_private_authorization_grant_export",
        output: "private_migration_review_only",
        policy: "no_user_bound_rows_in_public_inventory_no_functionality_credit"
      }
    }
  };
  validateLegacyAtomicInventory(inventory);
  return inventory;
}
