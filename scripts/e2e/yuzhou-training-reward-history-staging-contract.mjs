import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
const root=resolve(import.meta.dirname,"../..");
const extract=readFileSync(resolve(root,"scripts/extract-yuzhou-training-reward-history.sh"),"utf8");
const transform=readFileSync(resolve(root,"scripts/transform-yuzhou-training-reward-history.mjs"),"utf8");
test("training reward staging extracts only the controlled source domains and preserves HOLD",()=>{
 for(const value of ["trainhis.raw.json","bonuscode.raw.json","source-meta.json","catalog.raw.json","YUZHOU_SQLSERVER_ETL_LOGIN","sa is forbidden","productionImport:\"HOLD\""])assert.match(extract+transform,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
 for(const forbidden of ["dbo.person.photo","dbo.docs","salary01","bonusrecord.raw.json","password","photo"])assert.doesNotMatch(extract,new RegExp(forbidden));
 assert.match(transform,/TRAINING_HISTORY_INCOMPLETE/);assert.match(transform,/REWARD_CATEGORY_IMPACT_UNRESOLVED/);assert.match(transform,/sourceRowSha256/);assert.match(transform,/sourceIdentitySha256/);
});
