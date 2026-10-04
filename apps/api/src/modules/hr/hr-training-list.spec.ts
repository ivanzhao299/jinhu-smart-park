import assert from "node:assert/strict";
import test from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrTrainingService } from "./hr-training.service";

const scope = { tenantId: "10000001", parkId: "20000001" };

function actor(permission: string): JwtPrincipal {
  return {
    sub: "30000001",
    username: "training-query-test",
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    roles: [],
    permissions: [permission],
  };
}

test("training plan list binds only SQL parameters used by each access scope", async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    query: async (sql: string, params: unknown[]) => {
      if (!sql.includes("COUNT(DISTINCT p.id)")) calls.push({ sql, params });
      return [];
    },
  } as unknown as DataSource;
  const service = new HrTrainingService(db, {
    recordOperationRequired: async () => undefined,
  } as never);

  await service.listPlans(scope, actor(HR_PERMISSIONS.HR_TRAINING_READ), {
    page: 1,
    page_size: 20,
  });
  const parkCall = calls[0];
  assert.ok(parkCall);
  assert.equal(parkCall.params.length, 4);
  assert.doesNotMatch(parkCall.sql, /\$5/);

  await service.listPlans(scope, actor(HR_PERMISSIONS.HR_TRAINING_READ), {
    page: 2,
    page_size: 20,
    status: "in_progress",
  });
  const parkStatusCall = calls[1];
  assert.ok(parkStatusCall);
  assert.deepEqual(parkStatusCall.params, ["10000001", "20000001", 20, 20, "in_progress"]);
  assert.match(parkStatusCall.sql, /p\.status=\$5/);

  await service.listPlans(scope, actor(HR_PERMISSIONS.HR_TRAINING_SELF_READ), {
    page: 1,
    page_size: 20,
  });
  const selfCall = calls[2];
  assert.ok(selfCall);
  assert.equal(selfCall.params[4], "30000001");
  assert.match(selfCall.sql, /e\.user_id=\$5/);

  await service.listPlans(scope, actor(HR_PERMISSIONS.HR_TRAINING_TEAM_READ), {
    page: 1,
    page_size: 20,
    status: "published",
  });
  const teamStatusCall = calls[3];
  assert.ok(teamStatusCall);
  assert.deepEqual(teamStatusCall.params.slice(4), ["30000001", "published"]);
  assert.match(teamStatusCall.sql, /leader_user_id=\$5/);
  assert.match(teamStatusCall.sql, /p\.status=\$6/);
});

test("empty later pages count within the same scope and still require audit", async () => {
  for (const permission of [HR_PERMISSIONS.HR_TRAINING_READ,HR_PERMISSIONS.HR_TRAINING_TEAM_READ,HR_PERMISSIONS.HR_TRAINING_SELF_READ]) {
    const calls:Array<{sql:string;params:unknown[]}>=[];
    const db={query:async(sql:string,params:unknown[])=>{calls.push({sql,params});return sql.includes("COUNT(DISTINCT p.id)")?[{total:7}]:[];}} as unknown as DataSource;
    let auditCalls=0;
    const service=new HrTrainingService(db,{recordOperationRequired:async()=>{auditCalls++;}} as never);
    const result=await service.listPlans(scope,actor(permission),{page:9,page_size:20,status:"published"});
    assert.equal(result.total,7);assert.deepEqual(result.items,[]);assert.equal(auditCalls,1);assert.equal(calls.length,2);
    const count=calls[1];assert.ok(count);assert.match(count.sql,/COUNT\(DISTINCT p.id\)/);
    assert.doesNotMatch(count.sql,/LIMIT|OFFSET/);
    if(permission===HR_PERMISSIONS.HR_TRAINING_READ){assert.deepEqual(count.params,[scope.tenantId,scope.parkId,"published"]);assert.match(count.sql,/p\.status=\$3/);}
    else {assert.deepEqual(count.params,[scope.tenantId,scope.parkId,"30000001","published"]);assert.match(count.sql,/p\.status=\$4/);assert.match(count.sql,permission===HR_PERMISSIONS.HR_TRAINING_SELF_READ?/e\.user_id=\$3/:/leader_user_id=\$3/);}
  }
});

test("populated later pages keep the single-query projection",async()=>{
  let queries=0;
  const service=new HrTrainingService({query:async()=>{queries++;return [{id:"synthetic-plan",name:"plan",totalCount:41}];}} as unknown as DataSource,{recordOperationRequired:async()=>undefined} as never);
  const result=await service.listPlans(scope,actor(HR_PERMISSIONS.HR_TRAINING_READ),{page:2,page_size:20});assert.equal(result.total,41);assert.deepEqual(result.items,[{id:"synthetic-plan",name:"plan"}]);assert.equal(queries,1);
});

test("first empty page and denied scope avoid a redundant count; audit failure blocks later-page response",async()=>{
  let queries=0;
  const db={query:async()=>{queries++;return [];}} as unknown as DataSource;
  const service=new HrTrainingService(db,{recordOperationRequired:async()=>undefined} as never);
  assert.equal((await service.listPlans(scope,actor(HR_PERMISSIONS.HR_TRAINING_READ),{page:1,page_size:20})).total,0);assert.equal(queries,1);
  assert.equal((await service.listPlans(scope,actor("unrelated:read"),{page:9,page_size:20})).total,0);assert.equal(queries,1);
  const failed=new HrTrainingService(db,{recordOperationRequired:async()=>{throw new Error("audit unavailable");}} as never);
  await assert.rejects(failed.listPlans(scope,actor(HR_PERMISSIONS.HR_TRAINING_READ),{page:9,page_size:20}),/audit unavailable/);
});
