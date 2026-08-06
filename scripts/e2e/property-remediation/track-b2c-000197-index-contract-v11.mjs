import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { URL } from "node:url";

export const APPROVAL_ACTIVE_INDEX_MIGRATION_V11 = new URL(
  "../../../database/migrations/000197_property_approval_active_source_index_forward_fix.sql",
  import.meta.url,
);

const EXACT_COLUMNS = Object.freeze([
  "tenant_id", "park_id", "action_id", "source_type", "source_id", "source_expected_version",
]);
const EXACT_DECISION_STATES = Object.freeze(["draft", "submitted", "pending_approval", "approved"]);
const EXACT_EXECUTION_STATES = Object.freeze(["not_started", "executing", "retry_wait", "infra_exhausted"]);
const IDENTIFIER = "[a-z_][a-z0-9_]*";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export function normalizeIndexPredicateV11(value) {
  return String(value).replace(/\s+/gu, " ").replace(/\s*([(),=])\s*/gu, "$1").trim().toLowerCase();
}

export function parseActivePredicateV11(value) {
  const normalized = normalizeIndexPredicateV11(value);
  const tokens = normalized.match(/[a-z_]+|'[^']*'|[(),=]/gu) ?? [];
  if (tokens.join("") !== normalized.replaceAll(" ", "")) {
    throw new Error("b2c-000197-v11-predicate-token");
  }
  let cursor = 0;
  const expect = (token) => {
    if (tokens[cursor] !== token) throw new Error(`b2c-000197-v11-predicate-grammar:${token}`);
    cursor += 1;
  };
  const quoted = () => {
    const token = tokens[cursor];
    if (!/^'[^']*'$/u.test(token ?? "")) throw new Error("b2c-000197-v11-predicate-value");
    cursor += 1; return token.slice(1, -1);
  };
  const list = (field) => {
    expect(field); expect("in"); expect("("); const result = [quoted()];
    while (tokens[cursor] === ",") { cursor += 1; result.push(quoted()); }
    expect(")"); return result;
  };
  expect("("); const pendingDecisionStates = list("decision_status"); expect("or"); expect("(");
  expect("decision_status"); expect("="); const approvedDecisionState = quoted(); expect("and");
  const executionStates = list("execution_status"); expect(")"); expect(")");
  if (cursor !== tokens.length) throw new Error("b2c-000197-v11-predicate-trailing-token");
  return Object.freeze({ normalizedPredicate: normalized,
    decisionStates: Object.freeze([...pendingDecisionStates, approvedDecisionState]),
    executionStates: Object.freeze(executionStates) });
}

export function parseCreateIndexSqlV11(sql) {
  const match = String(sql).match(new RegExp(
    `CREATE\\s+UNIQUE\\s+INDEX\\s+(${IDENTIFIER})\\s+ON\\s+((?:${IDENTIFIER})\\.(?:${IDENTIFIER}))\\s*`+
    "\\(([^;]+?)\\)\\s+WHERE\\s+([\\s\\S]+?);", "iu",
  ));
  if (!match) throw new Error("b2c-000197-v11-create-index-contract-missing");
  const columns = match[3].split(",").map((column) => column.trim().toLowerCase());
  return { createSql: match[0], buildIndexName: match[1].toLowerCase(), target: match[2].toLowerCase(),
    columns, predicate: match[4].trim(), normalizedPredicate: normalizeIndexPredicateV11(match[4]) };
}

function exactHash(sql, name) {
  const matches = [...String(sql).matchAll(new RegExp(
    `${name}\\s+constant\\s+text\\s*:=\\s*'([0-9a-f]{64})'`, "giu",
  ))];
  if (matches.length !== 1) throw new Error(`b2c-000197-v11-${name}-contract`);
  return matches[0][1];
}

export function parseFormalApprovalActiveIndexContractV11(sql) {
  const create = parseCreateIndexSqlV11(sql);
  const drop = String(sql).match(new RegExp(`DROP\\s+INDEX\\s+public\\.(${IDENTIFIER})\\s*;`, "iu"));
  const rename = String(sql).match(new RegExp(
    `ALTER\\s+INDEX\\s+public\\.(${IDENTIFIER})\\s+RENAME\\s+TO\\s+(${IDENTIFIER})\\s*;`, "iu",
  ));
  if (!drop || !rename) throw new Error("b2c-000197-v11-index-name-contract");
  const predicate = parseActivePredicateV11(create.predicate);
  const contract = { ...create, droppedIndexName: drop[1].toLowerCase(), renamedBuildIndexName: rename[1].toLowerCase(),
    finalIndexName: rename[2].toLowerCase(), oldIndexdefSha: exactHash(sql, "v_old_indexdef_sha"),
    oldPredicateSha: exactHash(sql, "v_old_predicate_sha"), newIndexdefSha: exactHash(sql, "v_new_indexdef_sha"),
    newPredicateSha: exactHash(sql, "v_new_predicate_sha"), decisionStates: predicate.decisionStates,
    executionStates: predicate.executionStates,
    createSqlRawSha256: sha256(Buffer.from(create.createSql)) };
  if (contract.target !== "public.biz_property_approval_request"
      || JSON.stringify(contract.columns) !== JSON.stringify(EXACT_COLUMNS)
      || contract.buildIndexName !== "uq_biz_property_approval_request_active_source_v2_build"
      || contract.droppedIndexName !== "uq_biz_property_approval_request_active_source"
      || contract.renamedBuildIndexName !== contract.buildIndexName
      || contract.finalIndexName !== contract.droppedIndexName
      || JSON.stringify(contract.decisionStates) !== JSON.stringify(EXACT_DECISION_STATES)
      || JSON.stringify(contract.executionStates) !== JSON.stringify(EXACT_EXECUTION_STATES)) {
    throw new Error("b2c-000197-v11-index-structure-drift");
  }
  return Object.freeze(contract);
}

export function formalApprovalActiveIndexContractV11() {
  return parseFormalApprovalActiveIndexContractV11(readFileSync(APPROVAL_ACTIVE_INDEX_MIGRATION_V11, "utf8"));
}

export function assertEquivalentCreateIndexV11(formalContract, fixtureSql) {
  const fixture = parseCreateIndexSqlV11(fixtureSql);
  for (const name of ["buildIndexName", "target", "normalizedPredicate"]) {
    if (fixture[name] !== formalContract[name]) throw new Error(`b2c-000197-v11-fixture-${name}-drift`);
  }
  if (JSON.stringify(fixture.columns) !== JSON.stringify(formalContract.columns)) {
    throw new Error("b2c-000197-v11-fixture-columns-drift");
  }
  return Object.freeze({ ...fixture, newIndexdefSha: formalContract.newIndexdefSha,
    newPredicateSha: formalContract.newPredicateSha });
}
