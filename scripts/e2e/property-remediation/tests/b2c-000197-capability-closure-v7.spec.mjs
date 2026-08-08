import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { formalOperationV7, formalStaticV7 } from "../track-b2c-000197-preliminary-orchestrator-v7.mjs";

test("formal executable callgraph invokes every hard capability on both targets", () => {
  const calls=[]; const state={history_primary:null,history_mirror:null,approval_rows:0,indexdef:"old",predicate:"old",build_residue:false};
  const mark=(name,value={})=>(...args)=>{calls.push([name,args[1]?.key??args[0]?.key??null]);return value;};
  const result=formalOperationV7({}, { inputs:mark("inputs"),authorities:mark("authorities",{reviews:2,drain:true}),
    formalStatic:mark("formalStatic"),inspect:mark("inspect","identity"),snapshot:mark("snapshot",state),
    assertAbsent:mark("assertAbsent",state),migrate:mark("migrate",{running:true,sql:true,succeeded:true,failed:true,rerun_exact:true}),
    predicateMatrix:mark("predicateMatrix",{active:7,terminal:5,total:12,active_duplicate_sqlstate:"23505",terminal_same_source_count:2}),
    faults:mark("faults",Array(4).fill({rollback:true,residue:false})),approval:mark("approval",{compile:true,connect:true,setup:true,named7:true,cleanup:true,after:true}) });
  for(const name of ["inputs","authorities","formalStatic","inspect","snapshot","assertAbsent","migrate","predicateMatrix","faults","approval"])
    assert.ok(calls.some(([actual])=>actual===name),name);
  assert.equal(calls.filter(([name])=>name==="migrate").length,2);assert.equal(calls.filter(([name])=>name==="predicateMatrix").length,2);
  assert.equal(calls.filter(([name])=>name==="faults").length,2);assert.equal(result.results.length,2);
  assert.deepEqual(result.results[0].predicate,{active:7,terminal:5,total:12,active_duplicate_sqlstate:"23505",terminal_same_source_count:2});
  assert.equal(result.results[0].failures.length,4);
  assert.equal(result.approval.named7,true);
});

test("formal static child receives frozen mode as recorded benign env",()=>{const calls=[];formalStaticV7({runChild:(x)=>{calls.push(x);return{};}});
 const stage=calls.find((x)=>x.stage==="static-v7-orchestrator");assert.equal(stage.env.B2C_000197_V7_STATIC_MODE,"frozen");
 assert.deepEqual(stage.envAllowlist.find((x)=>x.name==="B2C_000197_V7_STATIC_MODE"),{name:"B2C_000197_V7_STATIC_MODE",persist:"value"});});

test("authoritative manifest closure excludes returned artifacts and matches declared local dependencies",()=>{
 const source=readFileSync(resolve(process.cwd(),"scripts/e2e/property-remediation/track-b2c-000197-preliminary-orchestrator-v7.mjs"),"utf8");
 assert.doesNotMatch(source,/93fb2c36|old-writer-drain-v4-returned/u);
 assert.doesNotMatch(source,/preliminary-(?:executor|orchestrator)-v[3456]\.mjs/u);
 for(const dependency of ["track-b2c-000197-failure-cases-v7.mjs","track-b2c-000197-preliminary-executor-v7.mjs",
   "property-approval.port.pg-cli.ts","property-approval.port.pg.spec.ts","b2c-approval-port-runtime-implementation-v8-handoff.md"])
   assert.match(source,new RegExp(dependency.replaceAll(".","\\.")));
});
