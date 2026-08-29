import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
const root=resolve(import.meta.dirname,"../..");
const script=readFileSync(resolve(root,"scripts/profile-yuzhou-training-reward-events.sh"),"utf8");
test("training and reward source receipt remains aggregate-only and holds production import",()=>{
 for(const value of ["dbo.course","dbo.train","dbo.trainhis","dbo.jobtrain","dbo.bonuscode","dbo.bonusrecord","JOIN dbo.person p ON p.person=t.person","JOIN dbo.person p ON p.person=b.person","operationMode:\"read_only_aggregate\"","productionImport:\"HOLD\""])assert.match(script,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
 for(const forbidden of ["coursename","bonusname","cause","memo","SELECT person","SELECT money","SELECT bonuspay"])assert.doesNotMatch(script,new RegExp(forbidden));
 assert.match(script,/YUZHOU_SQLSERVER_ETL_LOGIN" != "sa"/);
});
