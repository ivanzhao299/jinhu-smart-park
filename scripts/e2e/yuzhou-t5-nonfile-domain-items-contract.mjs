import assert from "node:assert/strict";
import { items } from "../hr-cutover/t5-nonfile-stage-domain-items.mjs";
const sha="a".repeat(64),domains={person_core:{sourceObject:"dbo.person.core_residue",rows:2949,fileSha256:sha},family:{sourceObject:"dbo.family",rows:4560,fileSha256:sha},knowhow:{sourceObject:"dbo.knowhow",rows:6,fileSha256:sha},ticket:{sourceObject:"dbo.ticket",rows:237,fileSha256:sha}};
const manifest={artifactKind:"yuzhou_t5_nonfile_materialization_stage",productionImport:"HOLD",sourceRows:7752,sourceBusinessSha256:sha,sourceCatalogSha256:sha,nonfileBusinessSha256:sha,filesExcluded:["photo","docs"],domains};
assert.equal(items(manifest).length,4);
assert.throws(()=>items({...manifest,filesExcluded:[]}),/T5_NONFILE_DOMAIN_ITEMS_INVALID/);
