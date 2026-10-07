import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { HR_PERMISSIONS, type YuzhouIncrementalPackage } from "@jinhu/shared";
import type { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrPreparedProfileBatchRepository } from "./hr-prepared-profile-batch.repository";
import { HrPreparedProfileBatchService } from "./hr-prepared-profile-batch.service";
import { HrYuzhouIncrementalImportService } from "./hr-yuzhou-incremental-import.service";

test("prepared adapter preserves actor/scope, rejects ordering/permission failures and strips source identifiers",async()=>{
  const scope={tenantId:"10000001",parkId:"20000001"};
  const actor:JwtPrincipal={sub:"00000000-0000-4000-8000-000000000001",username:"synthetic",...scope,roles:[],permissions:[HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE]};
  const pkg:YuzhouIncrementalPackage={version:1,sourceSystem:"yuzhou-v10",manifestId:"synthetic-profile-batch",extractedAt:"2026-10-07T01:00:00Z",
    items:[{domain:"profile",sourceTable:"dbo.person.core_residue",sourceKey:`sha256:${"b".repeat(64)}`,rowDigest:"c".repeat(64),fields:{},
      profileBaselineWitness:{version:1,proof:"original_t5_whole_set_v1",operationId:"yzprod-import-20261004T130000Z-abcdef123456",bindingSha256:"d".repeat(64)}}]};
  let reads=0,previews=0;let state:Record<string,unknown>|null=null;
  const repository={package:()=>{reads++;return {pkg,metadata:{}}}} as unknown as HrPreparedProfileBatchRepository;
  const imports={preview:async(receivedScope:unknown,receivedActor:unknown,dto:unknown)=>{
    previews++;assert.equal(receivedScope,scope);assert.equal(receivedActor,actor);assert.deepEqual(JSON.parse(JSON.stringify(dto)),pkg);
    return {id:actor.sub,status:"previewed",itemCount:1,packageSha256:"f".repeat(64),plan:[{action:"unchanged",sourceKey:"private-source-key",privatePatch:{secret:"must-not-return"}}],privateExtra:"must-not-return"};
  }} as unknown as HrYuzhouIncrementalImportService;
  const db={query:async(_sql:string,params:unknown[])=>{assert.equal(params[0],scope.tenantId);assert.equal(params[1],scope.parkId);assert.match(String(params[2]),/^[a-f0-9]{64}$/);return state?[state]:[]}} as unknown as DataSource;
  const service=new HrPreparedProfileBatchService(repository,imports,db);
  await assert.rejects(()=>service.preview(scope,{...actor,permissions:[]},"a".repeat(64),0));assert.equal(reads,0);assert.equal(previews,0);
  await assert.rejects(()=>service.preview(scope,actor,"a".repeat(64),1),/Previous prepared package/);assert.equal(previews,0);
  state={id:actor.sub,status:"conflicted",conflict_count:1};await assert.rejects(()=>service.preview(scope,actor,"a".repeat(64),1));assert.equal(previews,0);
  state={id:actor.sub,status:"committed",conflict_count:0};
  const output=await service.preview(scope,actor,"a".repeat(64),1);assert.equal(previews,1);
  assert.deepEqual(output.plan,[{action:"unchanged"}]);assert.doesNotMatch(JSON.stringify(output),/private-source|privatePatch|privateExtra|must-not-return/);
  pkg.items[0]!.rowDigest="invalid";await assert.rejects(()=>service.preview(scope,actor,"a".repeat(64),0));assert.equal(previews,1);
});
