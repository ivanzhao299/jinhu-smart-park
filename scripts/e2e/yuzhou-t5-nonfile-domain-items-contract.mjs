import assert from "node:assert/strict";
import { canonicalT5Baseline } from "../hr-cutover/t5-canonical-baseline.mjs";
import { items } from "../hr-cutover/t5-nonfile-stage-domain-items.mjs";
const sha="a".repeat(64),baseline=canonicalT5Baseline(),domains={person_core:{sourceObject:"dbo.person.core_residue",rows:2949,fileSha256:sha},family:{sourceObject:"dbo.family",rows:4560,fileSha256:sha},knowhow:{sourceObject:"dbo.knowhow",rows:6,fileSha256:sha},ticket:{sourceObject:"dbo.ticket",rows:237,fileSha256:sha}};
const manifest={artifactKind:"yuzhou_t5_nonfile_materialization_stage",productionImport:"HOLD",sourceRows:7752,sourceSnapshotSha256:baseline.sourceSnapshotSha256,sourceRestoreReceiptSha256:baseline.sourceRestoreReceiptSha256,sourceBusinessSha256:baseline.businessSha256,sourceCatalogSha256:baseline.catalogSha256,mappingContractSha256:baseline.mappingContractSha256,nonfileBusinessSha256:sha,filesExcluded:["photo","docs"],domains};
assert.equal(items(manifest).length,4);
assert.throws(()=>items({...manifest,filesExcluded:[]}),/T5_NONFILE_DOMAIN_ITEMS_INVALID/);
assert.throws(()=>items({...manifest,mappingContractSha256:sha}),/T5_NONFILE_DOMAIN_ITEMS_INVALID/);
