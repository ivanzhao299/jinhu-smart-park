import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { canonicalT5Baseline } from "../hr-cutover/t5-canonical-baseline.mjs";
import { items } from "../hr-cutover/t5-nonfile-stage-domain-items.mjs";
const sha="a".repeat(64),baseline=canonicalT5Baseline(),domains={person_core:{sourceObject:"dbo.person.core_residue",rows:2949,fileSha256:sha},family:{sourceObject:"dbo.family",rows:4560,fileSha256:sha},knowhow:{sourceObject:"dbo.knowhow",rows:6,fileSha256:sha},ticket:{sourceObject:"dbo.ticket",rows:237,fileSha256:sha}};
const manifest={artifactKind:"yuzhou_t5_nonfile_materialization_stage",productionImport:"HOLD",sourceRows:7752,sourceSnapshotSha256:baseline.sourceSnapshotSha256,sourceRestoreReceiptSha256:baseline.sourceRestoreReceiptSha256,sourceBusinessSha256:baseline.businessSha256,sourceCatalogSha256:baseline.catalogSha256,mappingContractSha256:baseline.mappingContractSha256,nonfileBusinessSha256:sha,filesExcluded:["photo","docs"],domains};
assert.equal(items(manifest).length,4);
assert.throws(()=>items({...manifest,filesExcluded:[]}),/T5_NONFILE_DOMAIN_ITEMS_INVALID/);
assert.throws(()=>items({...manifest,mappingContractSha256:sha}),/T5_NONFILE_DOMAIN_ITEMS_INVALID/);

const root=mkdtempSync(join(tmpdir(),"yuzhou-t5-domain-items-"));
chmodSync(root,0o700);
const candidate={...baseline,sourceRestoreReceiptSha256:"b".repeat(64)};
const candidatePath=join(root,"candidate-baseline.json"),candidateManifestPath=join(root,"candidate-manifest.json");
for(const [path,value] of [[candidatePath,candidate],[candidateManifestPath,{...manifest,sourceRestoreReceiptSha256:candidate.sourceRestoreReceiptSha256}]]){writeFileSync(path,JSON.stringify(value),{mode:0o600});chmodSync(path,0o600);}
assert.equal(items(JSON.parse(readFileSync(candidateManifestPath,"utf8")),candidate).length,4);
const candidateCli=spawnSync(process.execPath,["scripts/hr-cutover/t5-nonfile-stage-domain-items.mjs",candidateManifestPath,"--baseline",candidatePath],{cwd:resolve(import.meta.dirname,"../.."),encoding:"utf8"});
assert.equal(candidateCli.status,0);
assert.equal(JSON.parse(candidateCli.stdout).length,4);
assert.equal(candidateCli.stderr,"");
