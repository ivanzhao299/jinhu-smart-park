#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyT1EventTypeDecision } from "./verify-yuzhou-t1-event-type-decision.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const ROOT = resolve(import.meta.dirname, "../..");
const hash = value => createHash("sha256").update(value).digest("hex");
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const canonicalHash = value => hash(`${canonical(value)}\n`);
const mode = path => (statSync(path).mode & 0o777).toString(8).padStart(4, "0");
const fail = code => { throw new Error(code); };

const eventStateTargets = new Map([["1", { decision: "map", target: "accepted", reason: "EFFECTIVE_SOURCE_STATE" }], ["0", { decision: "reject", target: null, reason: "SOURCE_NON_EFFECTIVE_STATE" }]]);
const contractTypeTargets = new Map([["01", "YUZHOU_01"], ["02", "YUZHOU_02"], ["03", "YUZHOU_03"], ["04", "YUZHOU_04"]]);
const contractStateTargets = new Map([["生效", "active"], ["解除", "terminated"]]);

function privateBytes(path) {
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || mode(path) !== "0600") fail("CORE_DICTIONARY_INPUT_UNSAFE");
  return readFileSync(path);
}

function privateJson(path) {
  const bytes = privateBytes(path);
  return { value: JSON.parse(bytes), bytes };
}

function jsonLines(path) {
  const bytes = privateBytes(path);
  return { value: bytes.toString("utf8").trim().split("\n").filter(Boolean).map(JSON.parse), bytes };
}

function requiredMap(rows, selector, rules, code) {
  const selected = rows.map(selector);
  if (selected.length !== rules.size || new Set(selected).size !== selected.length || selected.some(value => !rules.has(value))) fail(code);
  return selected;
}

function reviewedEventTypeRules(config) {
  const decision = config?.source?.dictionaryPackages?.employment_event_type;
  const verified = verifyT1EventTypeDecision(decision);
  if (verified.sourceSnapshotSha256 !== config.triple?.sourceSnapshotHash) fail("CORE_T1_EVENT_TYPE_SOURCE_DRIFT");
  return new Map(decision.decisions.map(row => [row.sourceValue, { decision: row.decision, target: row.targetValue, reason: row.reasonCode }]));
}

function item({ sourceCode = null, sourceName = null, sourceValue = null, sourceTable, sourceKey, targetDomain, targetValue, decision = "map", reasonCode }) {
  const sourceIdentitySha256 = hash(`${sourceTable}\u0000${sourceKey}`);
  return { id: randomUUID(), sourceCode, sourceName, sourceValue, sourceIdentitySha256,
    sourceRowSha256: canonicalHash({ sourceCode, sourceName, sourceValue }), decision, targetDomain: decision === "map" ? targetDomain : null,
    targetValue: decision === "map" ? targetValue : null, reasonCode };
}

export function buildCoreNonT0DictionaryPackage(config, paths) {
  if (!config?.triple || !SHA256.test(config?.machineAttestation?.trustedRootSha256 ?? "") || !/^jinhu_hr_migration_lab_core_[a-z0-9_]{6,40}$/u.test(config?.target?.database ?? "")) fail("CORE_DICTIONARY_CONFIG_INVALID");
  const t1Types = privateJson(paths.t1Types), t1States = privateJson(paths.t1States), t2Types = jsonLines(paths.t2Types), t2States = privateJson(paths.t2States);
  if (!Array.isArray(t1Types.value) || !Array.isArray(t1States.value) || !Array.isArray(t2States.value)) fail("CORE_DICTIONARY_SOURCE_INVALID");
  const eventTypeRules = reviewedEventTypeRules(config);
  requiredMap(t1Types.value, row => String(row.sourceValue ?? "").trim(), eventTypeRules, "CORE_T1_EVENT_TYPE_SET_DRIFT");
  requiredMap(t1States.value, row => String(row.sourceValue ?? "").trim(), eventStateTargets, "CORE_T1_EVENT_STATE_SET_DRIFT");
  requiredMap(t2Types.value, row => String(row.source?.typeCode ?? "").trim(), contractTypeTargets, "CORE_T2_CONTRACT_TYPE_SET_DRIFT");
  requiredMap(t2States.value, row => String(row.sourceValue ?? "").trim(), contractStateTargets, "CORE_T2_CONTRACT_STATE_SET_DRIFT");
  const evidence = {
    t1Types: hash(t1Types.bytes), t1States: hash(t1States.bytes), t2Types: hash(t2Types.bytes), t2States: hash(t2States.bytes)
  };
  const actorId = randomUUID(), verifiedAt = new Date().toISOString().replace(/\.\d{3}Z$/u, "Z");
  const dictionaries = [
    { dictionaryCode: "employment_event_type", sourceTable: "dbo.readjust", sourceSnapshotSha256: canonicalHash({ kind: "employment_event_type", source: evidence.t1Types }),
      items: t1Types.value.map(row => { const value = String(row.sourceValue).trim(), rule = eventTypeRules.get(value); return item({ sourceValue: value, sourceTable: "dbo.readjust.readjusttype", sourceKey: value, targetDomain: "employment_event_type", targetValue: rule.target, decision: rule.decision, reasonCode: rule.reason }); }) },
    { dictionaryCode: "employment_event_state", sourceTable: "dbo.readjust", sourceSnapshotSha256: canonicalHash({ kind: "employment_event_state", source: evidence.t1States }),
      items: t1States.value.map(row => { const value = String(row.sourceValue).trim(), rule = eventStateTargets.get(value); return item({ sourceValue: value, sourceTable: "dbo.readjust.state", sourceKey: value, targetDomain: "migration_decision", targetValue: rule.target, decision: rule.decision, reasonCode: rule.reason }); }) },
    { dictionaryCode: "contract_type", sourceTable: "dbo.compacttypecode", sourceSnapshotSha256: canonicalHash({ kind: "contract_type", source: evidence.t2Types }),
      items: t2Types.value.map(row => { const code = String(row.source.typeCode).trim(), name = String(row.source.typeName).trim(); return item({ sourceCode: code, sourceName: name, sourceTable: "dbo.compacttypecode", sourceKey: code, targetDomain: "contract_type_code", targetValue: contractTypeTargets.get(code), reasonCode: "DETERMINISTIC_COMPATIBILITY_MAPPING" }); }) },
    { dictionaryCode: "contract_state", sourceTable: "dbo.compact", sourceSnapshotSha256: canonicalHash({ kind: "contract_state", source: evidence.t2States }),
      items: t2States.value.map(row => { const value = String(row.sourceValue).trim(); return item({ sourceValue: value, sourceTable: "dbo.compact.state", sourceKey: value, targetDomain: "contract_status", targetValue: contractStateTargets.get(value), reasonCode: "DETERMINISTIC_COMPATIBILITY_MAPPING" }); }) }
  ];
  for (const dictionary of dictionaries) {
    dictionary.items.sort((left, right) => left.sourceIdentitySha256.localeCompare(right.sourceIdentitySha256));
    dictionary.machineAttestationSha256 = canonicalHash({ triple: config.triple, trustedRootSha256: config.machineAttestation.trustedRootSha256, dictionaryCode: dictionary.dictionaryCode, sourceSnapshotSha256: dictionary.sourceSnapshotSha256, items: dictionary.items.map(({ id, ...rest }) => rest) });
  }
  return { formatVersion: 1, kind: "yuzhou_core_non_t0_machine_dictionary_package", triple: config.triple, trustedRootSha256: config.machineAttestation.trustedRootSha256,
    machineActor: { id: actorId, kind: "machine_policy_engine", verifiedAt }, evidence, dictionaries, productionImport: "HOLD" };
}

export function materializeCoreNonT0Dictionaries(config, dictionaryPackage) {
  if (dictionaryPackage?.kind !== "yuzhou_core_non_t0_machine_dictionary_package" || dictionaryPackage.productionImport !== "HOLD" || JSON.stringify(dictionaryPackage.triple) !== JSON.stringify(config.triple)
    || dictionaryPackage.trustedRootSha256 !== config.machineAttestation.trustedRootSha256 || dictionaryPackage.machineActor?.kind !== "machine_policy_engine" || !Array.isArray(dictionaryPackage.dictionaries) || dictionaryPackage.dictionaries.length !== 4) fail("CORE_DICTIONARY_PACKAGE_INVALID");
  const packed = Buffer.from(JSON.stringify(dictionaryPackage), "utf8").toString("base64");
  const sql = `BEGIN; CREATE TEMP TABLE machine_package(value jsonb NOT NULL); INSERT INTO machine_package VALUES(convert_from(decode('${packed}','base64'),'UTF8')::jsonb); DO $$ DECLARE p jsonb; d jsonb; i jsonb; version_id uuid; calculated char(64); inserted integer; BEGIN SELECT value INTO p FROM machine_package; IF current_database() !~ '^jinhu_hr_migration_lab_core_[a-z0-9_]{6,40}$' THEN RAISE EXCEPTION 'CORE_DICTIONARY_TARGET_INVALID'; END IF; FOR d IN SELECT value FROM jsonb_array_elements(p->'dictionaries') value LOOP IF EXISTS(SELECT 1 FROM hr_legacy_dictionary_version WHERE tenant_id='10000001' AND park_id='20000001' AND source_system='yuzhou-v10' AND dictionary_code=d->>'dictionaryCode' AND is_deleted=false) THEN RAISE EXCEPTION 'CORE_DICTIONARY_ALREADY_EXISTS'; END IF; INSERT INTO hr_legacy_dictionary_version(id,tenant_id,park_id,source_system,dictionary_code,source_table,source_snapshot_sha256,source_row_count,status,decision_note,create_by,update_by) VALUES(uuid_generate_v4(),'10000001','20000001','yuzhou-v10',d->>'dictionaryCode',d->>'sourceTable',d->>'sourceSnapshotSha256',jsonb_array_length(d->'items'),'draft','machine-attested isolated compatibility decision',(p->'machineActor'->>'id')::uuid,(p->'machineActor'->>'id')::uuid) RETURNING id INTO version_id; FOR i IN SELECT value FROM jsonb_array_elements(d->'items') value LOOP INSERT INTO hr_legacy_dictionary_item(id,tenant_id,park_id,version_id,source_code,source_name,source_value,source_identity_sha256,source_row_sha256,decision,target_domain,target_value,reason_code,create_by,update_by) VALUES((i->>'id')::uuid,'10000001','20000001',version_id,NULLIF(i->>'sourceCode',''),NULLIF(i->>'sourceName',''),NULLIF(i->>'sourceValue',''),i->>'sourceIdentitySha256',i->>'sourceRowSha256',i->>'decision',NULLIF(i->>'targetDomain',''),NULLIF(i->>'targetValue',''),i->>'reasonCode',(p->'machineActor'->>'id')::uuid,(p->'machineActor'->>'id')::uuid); END LOOP; SELECT hr_legacy_dictionary_items_sha256('10000001','20000001',version_id) INTO calculated; UPDATE hr_legacy_dictionary_version SET status='approved',decision_items_sha256=calculated,approved_by=NULL,approved_at=NULL,verification_mode='machine_attested',machine_attestation_sha256=d->>'machineAttestationSha256',machine_evidence_root_sha256=p->>'trustedRootSha256',verified_at=(p->'machineActor'->>'verifiedAt')::timestamptz,verification_actor_kind='machine_policy_engine',version=version+1 WHERE id=version_id AND status='draft'; GET DIAGNOSTICS inserted=ROW_COUNT; IF inserted<>1 THEN RAISE EXCEPTION 'CORE_DICTIONARY_APPROVAL_FAILED'; END IF; END LOOP; END $$; COMMIT;`;
  const result = spawnSync("docker", ["exec", "-i", config.target.container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", config.target.database], { input: sql, encoding: "utf8" });
  if (result.status !== 0) fail("CORE_DICTIONARY_MATERIALIZATION_FAILED");
  return Object.fromEntries(dictionaryPackage.dictionaries.map(row => [row.dictionaryCode, row.sourceSnapshotSha256]));
}

function main() {
  const configPath = process.argv[2];
  if (!configPath) fail("CORE_DICTIONARY_CONFIG_REQUIRED");
  const config = JSON.parse(readFileSync(resolve(configPath), "utf8"));
  const root = dirname(dirname(resolve(configPath))), stage = domain => `${config.target.stagingRoot}/staging-${config.runId}-${domain}`;
  const paths = { t1Types: `${stage("t1")}/employment-event-types.json`, t1States: `${stage("t1")}/employment-event-states.json`, t2Types: `${stage("t2")}/contract-types.jsonl`, t2States: `${stage("t2")}/contract-states.raw.json` };
  const dictionaryPackage = buildCoreNonT0DictionaryPackage(config, paths);
  const outputRoot = `${root}/machine-package`; if (!existsSync(outputRoot)) mkdirSync(outputRoot, { mode: 0o700 }); chmodSync(outputRoot, 0o700);
  const output = `${outputRoot}/non-t0-dictionaries.json`; if (existsSync(output)) fail("CORE_DICTIONARY_PACKAGE_EXISTS");
  writeFileSync(output, `${JSON.stringify(dictionaryPackage, null, 2)}\n`, { mode: 0o600 }); chmodSync(output, 0o600);
  const snapshots = materializeCoreNonT0Dictionaries(config, dictionaryPackage);
  process.stdout.write(`${JSON.stringify({ dictionaryMaterialization: "verified", dictionaries: Object.keys(snapshots).length, productionImport: "HOLD" })}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
