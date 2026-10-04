#!/usr/bin/env node
import { verifyFamilySource } from "./yuzhou-family-incremental-projection.mjs";
/* global process, Buffer */
import { verifyProfileSource, canonicalProfile } from "./yuzhou-profile-incremental-projection.mjs";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { dirname, basename, resolve, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { materializeYuzhouReusableIncrementalPackage, YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256 } from "./build-yuzhou-reusable-incremental-package.mjs";
import { verifyProductionT2StagedRecord } from "./production-t2-field-projection.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const fail = () => { throw new Error("YUZHOU_STAGING_ENTRY_INVALID"); };
// Only exact reviewed constants may cross the CLI error boundary. Never echo
// filesystem/parser errors or arbitrary downstream messages.
const SAFE_ERRORS = new Set([
  "YUZHOU_FAMILY_SOURCE_INVALID","YUZHOU_FAMILY_SOURCE_SCHEMA_INVALID","YUZHOU_FAMILY_FIELD_INVALID","YUZHOU_FAMILY_EMPLOYEE_MISSING",
  "YUZHOU_ORG_SOURCE_SCHEMA_INVALID","YUZHOU_ORG_SOURCE_INVALID","YUZHOU_ORG_SOURCE_AMBIGUOUS","YUZHOU_ORG_FIELD_INVALID","YUZHOU_POSITION_ORG_UNRESOLVED","YUZHOU_EMPLOYEE_ORG_REQUIRED","YUZHOU_SOURCE_DEPENDENCY_CYCLE",
  "YUZHOU_PROFILE_ALIAS_ACCEPTANCE_INVALID", "YUZHOU_PROFILE_ADMISSION_INVALID", "YUZHOU_PROFILE_WITNESS_INVALID", "YUZHOU_PROFILE_SOURCE_INVALID", "YUZHOU_PROFILE_SOURCE_SCHEMA_INVALID", "YUZHOU_PROFILE_DATE_INVALID", "YUZHOU_PROFILE_FIELD_INVALID", "YUZHOU_PROFILE_EMAIL_INVALID", "YUZHOU_PROFILE_EMPLOYEE_MISSING", "YUZHOU_PROFILE_PROTECTED_INPUT_INVALID",
  "YUZHOU_STAGING_ENTRY_SCOPE_MISMATCH", "YUZHOU_STAGING_ENTRY_ACCOUNTING_MISMATCH",
  "YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_STATE_UNRESOLVED",
  "YUZHOU_REUSABLE_INCREMENTAL_STATE_UNRESOLVED",
  "YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_MISSING", "YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_AMBIGUOUS",
  "YUZHOU_REUSABLE_INCREMENTAL_TYPE_MISSING", "YUZHOU_REUSABLE_INCREMENTAL_TYPE_AMBIGUOUS",
  "YUZHOU_REUSABLE_INCREMENTAL_TYPE_ARTIFACT_REQUIRED", "YUZHOU_REUSABLE_INCREMENTAL_TYPE_ARTIFACT_INVALID",
  "YUZHOU_REUSABLE_INCREMENTAL_TYPE_ARTIFACT_DRIFT", "YUZHOU_REUSABLE_INCREMENTAL_TYPE_BINDING_INVALID",
  "YUZHOU_REUSABLE_INCREMENTAL_STATE_RESOLUTION_REQUIRED", "YUZHOU_REUSABLE_INCREMENTAL_STATE_RESOLUTION_INVALID",
  "YUZHOU_REUSABLE_INCREMENTAL_JOB_STATE_ARTIFACT_REQUIRED", "YUZHOU_REUSABLE_INCREMENTAL_JOB_STATE_ARTIFACT_NOT_MATERIALIZABLE",
  "YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_HIRE_DATE_INVALID", "YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_FORMAL_DATE_INVALID",
  "YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_CODE_INVALID", "YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_NAME_INVALID",
  "YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_SOURCE_HASH_MISMATCH", "YUZHOU_REUSABLE_INCREMENTAL_SOURCE_DUPLICATE",
  "YUZHOU_INCREMENTAL_SINGLE_ITEM_EXCEEDS_BYTE_LIMIT",
  "T2_DATE_INVALID", "T2_REQUIRED_TEXT_INVALID", "T2_LEGACY_FLAG_UNRESOLVED", "T2_DECIMAL_TARGET_PRECISION_LOSS",
]);
export const stagingEntryErrorCode = error => error instanceof Error && SAFE_ERRORS.has(error.message)
  ? error.message : "YUZHOU_STAGING_ENTRY_FAILED";
const SHA = /^[a-f0-9]{64}$/u;
const MAX_FILE = 64 * 1024 * 1024, MAX_TOTAL = 256 * 1024 * 1024;
const T0 = { departments: ["departments.jsonl", "dbo.departmentcode"], positions: ["positions.jsonl", "dbo.job"], employees: ["employees.jsonl", "dbo.person"], employeeJobStates: ["employee-job-states.raw.json"], jobStateCodeMetadata: ["job-state-code-metadata.raw.json"], jobStateCodes: ["job-state-codes.raw.json"] };
const T2 = { "dbo.compacttypecode": ["contract-types.jsonl", "dbo.compacttypecode"], "dbo.compact": ["contracts.jsonl", "dbo.compact"], "dbo.compact_c": ["contract-changes.jsonl", "dbo.compact_c"], "dbo.compact.state": ["contract-states.raw.json"] };
function exact(value, required, optional = []) {
  if (!plain(value) || required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => ![...required, ...optional].includes(key))) fail();
}
function safePath(path, directory = false) {
  if (typeof path !== "string" || !isAbsolute(path)) fail();
  // Reject symlinks in every ancestor, rather than only the final file.
  for (let current = resolve(path);; current = dirname(current)) {
    const info = lstatSync(current);
    if (info.isSymbolicLink()) fail();
    if (current === resolve(path) && (directory ? !info.isDirectory() || (info.mode & 0o777) !== 0o700 : !info.isFile() || info.nlink !== 1 || (info.mode & 0o777) !== 0o600 || info.size > MAX_FILE)) fail();
    if (current === dirname(current)) break;
  }
  return path;
}
function parser(bytes) { try { return JSON.parse(bytes.toString("utf8")); } catch { return fail(); } }

/** Offline preparation only. Caller custody declarations are recorded, never authenticated here. */
export function assembleYuzhouImportFromStaging(configPath) {
  let total = 0;
  const read = path => { safePath(dirname(path), true); safePath(path); const bytes = readFileSync(path); total += bytes.length; if (bytes.length > MAX_FILE || total > MAX_TOTAL) fail(); return bytes; };
  const reference = ref => { exact(ref, ["path", "sha256"]); if (!SHA.test(ref.sha256)) fail(); const bytes = read(ref.path); if (sha(bytes) !== ref.sha256) fail(); return parser(bytes); };
  const configBytes = read(configPath), config = parser(configBytes);
  exact(config, ["formatVersion", "t0Manifest", "includeEmployees", "extractedAt", "sourceCustody", "outputDir"], ["includeOrganizations", "includePositions", "includeAssignments", "t2Manifest", "jobStateDecisionArtifact", "contractTypeMappingArtifact", "contractStateResolutions", "historicalExclusions", "profileManifest", "profileBaselineWitness", "profileAliasAcceptance", "profileExclusions", "profileFieldAdmissions", "familyManifest", "familyExclusions"]);
  exact(config.sourceCustody, ["sourceSnapshotSha256", "evidenceSha256", "declaration"], ["targetScope"]);
  if (config.formatVersion !== 1 || typeof config.includeEmployees !== "boolean" || !SHA.test(config.sourceCustody.sourceSnapshotSha256) || !SHA.test(config.sourceCustody.evidenceSha256) || config.sourceCustody.declaration !== "caller_attests_same_controlled_snapshot" || typeof config.extractedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(config.extractedAt) || !Number.isFinite(Date.parse(config.extractedAt)) || !isAbsolute(config.outputDir ?? "")) fail();
  for(const key of ["includeOrganizations","includePositions","includeAssignments"]) if(config[key]!==undefined&&typeof config[key]!=="boolean") fail();
  const accounting = [];
  function stage(ref, rules, doubled) {
    safePath(dirname(ref.path), true);
    const manifest = reference(ref);
    exact(manifest, ["formatVersion", "generatedAt", "domains"]);
    if (manifest.formatVersion !== 1 || !plain(manifest.domains) || Object.keys(manifest.domains).sort().join("|") !== Object.keys(rules).sort().join("|")) fail();
    const domains = {}, seen = new Set();
    for (const [domain, [file, table]] of Object.entries(rules)) {
      const entry = manifest.domains[domain]; exact(entry, ["rows", "file", "fileSha256"]);
      if (entry.file !== file || basename(entry.file) !== entry.file || !SHA.test(entry.fileSha256) || !Number.isSafeInteger(entry.rows) || entry.rows < 0) fail();
      const bytes = read(join(dirname(ref.path), file)); if (sha(bytes) !== entry.fileSha256) fail();
      let rows;
      if (table) {
        const text = bytes.toString("utf8");
        if (!text.endsWith("\n")) fail();
        const lines = text.slice(0, -1).split("\n");
        rows = text === "\n" ? [] : lines.map(line => {
          if (!line) fail();
          // Invert exactly the transformer's JSON.stringify(...).replaceAll encoding.
          const row = parser(Buffer.from(doubled ? line.replaceAll("\\\\", "\\") : line));
          exact(row, ["sourceTable", "sourceKey", "sourceIdentitySha256", "sourceRowSha256", "source"]);
          if (row.sourceTable !== table || typeof row.sourceKey !== "string" || !row.sourceKey.trim() || !plain(row.source) || !SHA.test(row.sourceRowSha256) || row.sourceIdentitySha256 !== sha(`${table}\0${row.sourceKey}`) || row.sourceRowSha256 !== sha(JSON.stringify(row.source, Object.keys(row.source).sort())) || seen.has(row.sourceIdentitySha256)) fail();
          seen.add(row.sourceIdentitySha256);
          if (doubled) verifyProductionT2StagedRecord(row);
          if (table === "dbo.person" && row.sourceKey !== String(row.source.employeeCode ?? "").trim()) fail();
          return row;
        });
      } else rows = parser(bytes);
      if (!Array.isArray(rows) || rows.length !== entry.rows) fail();
      domains[domain] = rows;
      accounting.push({ phase: doubled ? "T2" : "T0", domain, rows: rows.length, fileSha256: entry.fileSha256, disposition: domain === "departments" && config.includeOrganizations ? "organization_api_input" : domain === "positions" && config.includePositions ? "position_api_input" : domain === "employees" ? config.includeEmployees ? "employee_api_input" : "verified_employee_dependency_index" : domain === "dbo.compact" ? "contract_api_input" : "retained_pending_or_mapping_evidence" });
    }
    return domains;
  }
  const t0 = stage(config.t0Manifest, T0, false), t2 = config.t2Manifest ? stage(config.t2Manifest, T2, true) : null;
  const load = key => config[key] ? reference(config[key]) : undefined;
  const exclusionArtifact = load("historicalExclusions"), exclusions = new Map(), appliedExclusions = [], changedExclusions = [], presentExclusions = new Set();
  const typeArtifact = load("contractTypeMappingArtifact");
  const scope = value => {
    exact(value, ["tenantId", "parkId"]);
    if ([value.tenantId, value.parkId].some(item => typeof item !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(item))) fail();
    return `${value.tenantId}\0${value.parkId}`;
  };
  if (config.sourceCustody.targetScope) {
    scope(config.sourceCustody.targetScope);
    if (typeArtifact && scope(typeArtifact.targetScope) !== scope(config.sourceCustody.targetScope)) throw new Error("YUZHOU_STAGING_ENTRY_SCOPE_MISMATCH");
  }
  if (exclusionArtifact) {
    exact(exclusionArtifact, ["formatVersion", "artifactKind", "sourceSystem", "originalSourceSnapshotSha256", "originalOperationId", "originalSealedPlanSha256", "originalPlanFileSha256", "originalExecutionProofFileSha256", "targetScope", "policy", "entries"]);
    if (exclusionArtifact.formatVersion !== 1 || exclusionArtifact.artifactKind !== "yuzhou_original_historical_exclusions" || exclusionArtifact.sourceSystem !== "yuzhou-v10" || exclusionArtifact.policy !== "ARCHIVE_UNCHANGED_ORIGINAL_QUARANTINE" || [exclusionArtifact.originalSourceSnapshotSha256, exclusionArtifact.originalSealedPlanSha256, exclusionArtifact.originalPlanFileSha256, exclusionArtifact.originalExecutionProofFileSha256].some(value => !SHA.test(value ?? "")) || !/^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u.test(exclusionArtifact.originalOperationId ?? "") || !Array.isArray(exclusionArtifact.entries) || scope(exclusionArtifact.targetScope) !== scope(config.sourceCustody.targetScope) || (typeArtifact && scope(typeArtifact.targetScope) !== scope(exclusionArtifact.targetScope))) fail();
    for (const entry of exclusionArtifact.entries) {
      exact(entry, ["domain", "sourceTable", "sourceKey", "sourceRowSha256", "decisionReceiptSha256", "reasonCode"]);
      if (!["employee", "contract"].includes(entry.domain) || entry.sourceTable !== (entry.domain === "employee" ? "dbo.person" : "dbo.compact") || !/^sha256:[a-f0-9]{64}$/u.test(entry.sourceKey ?? "") || !SHA.test(entry.sourceRowSha256 ?? "") || !SHA.test(entry.decisionReceiptSha256 ?? "") || !/^[A-Z][A-Z0-9_]{0,127}$/u.test(entry.reasonCode ?? "")) fail();
      const identity = entry.sourceKey.slice(7);
      if (exclusions.has(identity)) fail();
      exclusions.set(identity, entry);
    }
  }
  const eligible = (rows, domain) => rows.filter(row => {
    const entry = exclusions.get(row.sourceIdentitySha256);
    if (!entry) return true;
    if (entry.domain !== domain) fail();
    presentExclusions.add(row.sourceIdentitySha256);
    if (entry.sourceRowSha256 !== row.sourceRowSha256) { changedExclusions.push(entry.sourceKey); return true; }
    appliedExclusions.push(entry);
    return false;
  });
  const employees = eligible(t0.employees, "employee"), contracts = eligible(t2?.["dbo.compact"] ?? [], "contract");
  function retainedDomain(ref,domain,table,verify) {
    const manifest=reference(ref),entry=manifest.domains?.[domain];
    if(manifest.formatVersion!==1||manifest.productionImport!=="HOLD"||entry?.sourceObject!==table||entry.file!==`${domain}.jsonl`||!Number.isSafeInteger(entry.rows)||entry.rows<0||!SHA.test(entry.fileSha256??""))fail();
    if(manifest.sourceSnapshotSha256!==undefined&&manifest.sourceSnapshotSha256!==config.sourceCustody.sourceSnapshotSha256)fail();
    if(manifest.artifactKind==="yuzhou_t5_nonfile_materialization_stage"){
      const business=Object.fromEntries(["formatVersion","artifactKind","sourceSnapshotSha256","sourceRestoreReceiptSha256","sourceBusinessSha256","sourceCatalogSha256","mappingContractSha256","domains","definitionEvidence"].map(k=>[k,manifest[k]]));
      if(!["sourceSnapshotSha256","sourceRestoreReceiptSha256","sourceBusinessSha256","sourceCatalogSha256","mappingContractSha256","nonfileBusinessSha256"].every(k=>SHA.test(manifest[k]??""))||sha(canonicalProfile(business))!==manifest.nonfileBusinessSha256)fail();
    }
    const bytes=read(join(dirname(ref.path),entry.file));if(sha(bytes)!==entry.fileSha256)fail();
    const text=bytes.toString("utf8");if(text&&!text.endsWith("\n"))fail();
    const seen=new Set();
    const rows=text?text.slice(0,-1).split("\n").map(line=>{
      let decoded="";for(let i=0;i<line.length;i++){if(line[i]==="\\"){if(line[i+1]!=="\\")fail();i++;}decoded+=line[i];}
      const row=verify(parser(Buffer.from(decoded)));if(seen.has(row.sourceIdentitySha256))fail();seen.add(row.sourceIdentitySha256);return row;
    }):[];
    if(rows.length!==entry.rows)fail();
    return {rows,entry};
  }
  let profileRecords=[],profileAdmissionEvidence;
  const profileArtifacts=[];
  const profileAccounting={requested:0,excluded:0,eligible:0,nonApplicableChanged:[],notPresent:[],pendingFields:[]};
  if(config.profileManifest) {
    const {rows,entry}=retainedDomain(config.profileManifest,"person_core","dbo.person.core_residue",verifyProfileSource);
    profileRecords=rows;profileAccounting.requested=rows.length;
    for(const [key,kind] of [["profileExclusions","yuzhou_original_profile_exclusions"],["profileFieldAdmissions","yuzhou_original_profile_field_admissions"]]) {
      if(!config[key])continue;
      const artifact=reference(config[key]);exact(artifact,["formatVersion","artifactKind","originalOperationId","originalBindingSha256","targetScope","entries"]);
      if(artifact.formatVersion!==1||artifact.artifactKind!==kind||!/^yzprod-import-\d{8}T\d{6}Z-[a-f0-9]{12}$/u.test(artifact.originalOperationId??"")||!SHA.test(artifact.originalBindingSha256??"")||scope(artifact.targetScope)!==scope(config.sourceCustody.targetScope)||!Array.isArray(artifact.entries))fail();
      if(key==="profileFieldAdmissions") profileAdmissionEvidence={declaration:"caller_attests_original_unchanged_invalid_fields",targetScope:config.sourceCustody.targetScope,artifactCanonicalSha256:sha(canonicalProfile(artifact)),artifact};
      profileArtifacts.push({kind,artifactSha256:config[key].sha256,originalOperationId:artifact.originalOperationId,originalBindingSha256:artifact.originalBindingSha256,verification:"caller_declared_original_receipts_not_independently_authenticated"});
      const declarations=new Map();
      for(const e of artifact.entries){exact(e,["sourceIdentitySha256","sourceRowSha256","decisionReceiptSha256","reasonCode"],key==="profileFieldAdmissions"?["fields"]:[]);if(!SHA.test(e.sourceIdentitySha256??"")||!SHA.test(e.sourceRowSha256??"")||!SHA.test(e.decisionReceiptSha256??"")||! /^[A-Z][A-Z0-9_]{0,127}$/u.test(e.reasonCode??"")||declarations.has(e.sourceIdentitySha256))fail();if(key==="profileFieldAdmissions"&&(!Array.isArray(e.fields)||!e.fields.length||new Set(e.fields).size!==e.fields.length||e.fields.some(f=>!["gender","dateOfBirth","personalMobile","personalEmail","address","idNumber"].includes(f))))fail();declarations.set(e.sourceIdentitySha256,e);}
      profileRecords=profileRecords.filter(row=>{const e=declarations.get(row.sourceIdentitySha256);if(!e)return true;declarations.delete(row.sourceIdentitySha256);if(e.sourceRowSha256!==row.sourceRowSha256){profileAccounting.nonApplicableChanged.push(row.sourceIdentitySha256);return true;}if(key==="profileExclusions"){profileAccounting.excluded++;return false;}profileAccounting.pendingFields.push({sourceIdentitySha256:row.sourceIdentitySha256,fields:e.fields,reasonCode:e.reasonCode});return true;});
      profileAccounting.notPresent.push(...declarations.keys());
    }
    profileAccounting.eligible=profileRecords.length;
    accounting.push({phase:"T5",domain:"person_core",rows:entry.rows,fileSha256:entry.fileSha256,disposition:"profile_api_input_and_explicit_pending"});
  } else if(config.profileBaselineWitness||config.profileAliasAcceptance||config.profileExclusions||config.profileFieldAdmissions)fail();
  const profileBaselineWitness=load("profileBaselineWitness");
  if(profileBaselineWitness){exact(profileBaselineWitness,["version","proof","operationId","bindingSha256"]);if(profileBaselineWitness.version!==1||profileBaselineWitness.proof!=="original_t5_whole_set_v1"||!/^yzprod-import-\d{8}T\d{6}Z-[a-f0-9]{12}$/u.test(profileBaselineWitness.operationId??"")||!SHA.test(profileBaselineWitness.bindingSha256??""))fail();}
  if(profileBaselineWitness&&profileArtifacts.some(a=>a.originalOperationId!==profileBaselineWitness.operationId||a.originalBindingSha256!==profileBaselineWitness.bindingSha256))fail();
  let familyRecords=[];
  const familyAccounting={requested:0,excluded:0,eligible:0,nonApplicableChanged:[],notPresent:[]};
  if(config.familyManifest){
    const {rows,entry}=retainedDomain(config.familyManifest,"family","dbo.family",verifyFamilySource);
    familyRecords=rows;familyAccounting.requested=rows.length;
    if(config.familyExclusions){
      const artifact=reference(config.familyExclusions);
      exact(artifact,["formatVersion","artifactKind","originalOperationId","originalBindingSha256","targetScope","entries"]);
      if(artifact.formatVersion!==1||artifact.artifactKind!=="yuzhou_original_family_exclusions"||!/^yzprod-import-\d{8}T\d{6}Z-[a-f0-9]{12}$/u.test(artifact.originalOperationId??"")||!SHA.test(artifact.originalBindingSha256??"")||scope(artifact.targetScope)!==scope(config.sourceCustody.targetScope)||!Array.isArray(artifact.entries))fail();
      const exclusions=new Map();
      for(const entry of artifact.entries){
        exact(entry,["sourceIdentitySha256","sourceRowSha256","decisionReceiptSha256","reasonCode"]);
        if(![entry.sourceIdentitySha256,entry.sourceRowSha256,entry.decisionReceiptSha256].every(value=>SHA.test(value??""))||! /^[A-Z][A-Z0-9_]{0,127}$/u.test(entry.reasonCode??"")||exclusions.has(entry.sourceIdentitySha256))fail();
        exclusions.set(entry.sourceIdentitySha256,entry);
      }
      familyRecords=rows.filter(row=>{const entry=exclusions.get(row.sourceIdentitySha256);if(!entry)return true;exclusions.delete(row.sourceIdentitySha256);if(entry.sourceRowSha256!==row.sourceRowSha256){familyAccounting.nonApplicableChanged.push(row.sourceIdentitySha256);return true;}familyAccounting.excluded++;return false;});
      familyAccounting.notPresent=[...exclusions.keys()];
    }
    familyAccounting.eligible=familyRecords.length;
    accounting.push({phase:"T5",domain:"family",rows:entry.rows,fileSha256:entry.fileSha256,disposition:"family_api_input_and_explicit_pending"});
  }else if(config.familyExclusions)fail();
  const input = { organizationRecords:config.includeOrganizations?t0.departments:[],positionRecords:config.includePositions?t0.positions:[],includeAssignments:config.includeAssignments??Boolean(config.includeOrganizations||config.includePositions),recipeVersion: "yuzhou-reusable-incremental-v2", recipeSha256: YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256, sourceSystem: "yuzhou-v10", extractedAt: config.extractedAt, familyRecords, profileRecords,...(profileAdmissionEvidence?{profileAdmissionEvidence}:{}),profileBaselineWitness,profileAliasAcceptance:load("profileAliasAcceptance"),employeeRecords: config.includeEmployees ? employees : [], employeeIndex: config.includeEmployees ? [] : employees.map(row => ({ employeeCode: row.sourceKey, sourceTable: row.sourceTable, sourceKey: row.sourceKey })), records: contracts, jobStateDecisionArtifact: load("jobStateDecisionArtifact"), contractTypeMappingArtifact: typeArtifact, contractStateResolutions: load("contractStateResolutions") };
  const receipt = { formatVersion: 1, artifactKind: "yuzhou_staging_assembly", configSha256: sha(configBytes), recipeSha256: input.recipeSha256, sourceCustody: config.sourceCustody, sourceAuthenticity: "caller_declared_not_independently_verified", t0ManifestReference: config.t0Manifest, t2ManifestReference: config.t2Manifest ?? null, t0ManifestSha256: config.t0Manifest.sha256, t2ManifestSha256: config.t2Manifest?.sha256 ?? null, exclusionEvidence: { verification: "caller_declared_original_receipts_not_independently_authenticated", artifactSha256: config.historicalExclusions?.sha256 ?? null, originalReferences: exclusionArtifact ? Object.fromEntries(Object.entries(exclusionArtifact).filter(([key]) => key !== "entries")) : null, requested: { employee: t0.employees.length, contract: t2?.["dbo.compact"].length ?? 0 }, excluded: { employee: t0.employees.length - employees.length, contract: (t2?.["dbo.compact"].length ?? 0) - contracts.length }, eligible: { employee: employees.length, contract: contracts.length }, applied: appliedExclusions, nonApplicableChanged: changedExclusions, notPresent: [...exclusions.keys()].filter(identity => !presentExclusions.has(identity)).map(identity => `sha256:${identity}`) }, mappingReferences: Object.fromEntries(["jobStateDecisionArtifact", "contractTypeMappingArtifact", "contractStateResolutions", "historicalExclusions", "profileManifest", "profileBaselineWitness", "profileAliasAcceptance", "profileExclusions", "profileFieldAdmissions", "familyManifest", "familyExclusions"].filter(key => config[key]).map(key => [key, config[key]])), accounting, ...(config.profileManifest?{profileAccounting,profileArtifactEvidence:profileArtifacts}:{}), ...(config.familyManifest?{familyAccounting}:{}), apiInput: { ...(config.familyManifest?{family:familyRecords.length}:{}), ...(config.includeOrganizations?{organization:input.organizationRecords.length}:{}),...(config.includePositions?{position:input.positionRecords.length}:{}),...(config.profileManifest?{profile:profileRecords.length}:{}), employee: input.employeeRecords.length, contract: input.records.length }, dependencyIndex: { employee: input.employeeIndex.length }, productionImport: "HOLD" };
  return { input, receipt, outputDir: config.outputDir };
}

export function materializeYuzhouImportFromStaging(configPath) {
  const { input, receipt, outputDir } = assembleYuzhouImportFromStaging(configPath);
  if (existsSync(outputDir)) fail();
  safePath(dirname(outputDir), true);
  const temporary = mkdtempSync(join(dirname(outputDir), ".yuzhou-staging-"));
  let outputOwned = false;
  try {
    mkdirSync(outputDir, { mode: 0o700 }); outputOwned = true;
    const inputPath = join(temporary, "input.json");
    writeFileSync(inputPath, `${JSON.stringify(input)}\n`, { mode: 0o600, flag: "wx" });
    const result = materializeYuzhouReusableIncrementalPackage({ inputPath, outputDir });
    if (result.itemCount !== input.organizationRecords.length + input.positionRecords.length + input.employeeRecords.length + input.records.length + input.profileRecords.length + input.familyRecords.length) throw new Error("YUZHOU_STAGING_ENTRY_ACCOUNTING_MISMATCH");
    writeFileSync(join(outputDir, "assembly-receipt.json"), `${JSON.stringify({ ...receipt, manifestId: result.manifestId, itemCount: result.itemCount }, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    return result;
  } catch (error) { if (outputOwned) rmSync(outputDir, { recursive: true }); throw new Error(stagingEntryErrorCode(error)); }
  finally { rmSync(temporary, { recursive: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== "--config") fail();
    process.stdout.write(`${JSON.stringify(materializeYuzhouImportFromStaging(process.argv[3]))}\n`);
  } catch (error) { process.stderr.write(`${stagingEntryErrorCode(error)}\n`); process.exitCode = 1; }
}
