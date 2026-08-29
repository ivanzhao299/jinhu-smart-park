import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"../..");
const script=readFileSync(resolve(root,"scripts/profile-yuzhou-t3-attendance-events.sh"),"utf8");

test("T3 attendance event source receipt is aggregate-only, read-only, and holds production import",()=>{
  for(const value of ["dbo.[leave]","dbo.overtime","dbo.attrecord","dbo.timekeeprecord","sourceReadOnly!==1","operationMode:\"read_only_aggregate\"","productionImport:\"HOLD\""])assert.match(script,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  for(const forbidden of ["SELECT person","cardno","memo","starttime AS","endtime AS","recordtime AS"])assert.doesNotMatch(script,new RegExp(forbidden));
  assert.match(script,/YUZHOU_SQLSERVER_ETL_LOGIN" != "sa"/);
});
