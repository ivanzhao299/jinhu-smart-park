import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import {
  formalOperationV11, formalStaticV11, formalSuccessPayloadV11,
} from "../track-b2c-000197-preliminary-orchestrator-v11.mjs";

test("formal executable callgraph invokes every hard capability on both targets", () => {
  const calls=[]; const state={history_primary:null,history_mirror:null,approval_rows:0,indexdef:"old",predicate:"old",build_residue:false};
  const mark=(name,value={})=>(...args)=>{calls.push([name,args[1]?.key??args[0]?.key??null]);return value;};
  const faultResult=["before-create","after-create","after-drop","before-rename"].map((boundary)=>({boundary,sqlstate:"P0001",
    expected_marker:`v11-injected-${boundary}`,child_valid:true,sqlstate_valid:true,marker_valid:true,
    snapshot_checked:true,snapshot_exact:true}));
  const targets=[{key:"e",formalRunId:"unit-v11"},{key:"f",formalRunId:"unit-v11"}];
  const result=formalOperationV11({}, { targets,inputs:mark("inputs"),authorities:mark("authorities",{reviews:2,drain:true}),
    formalStatic:mark("formalStatic"),inspect:mark("inspect","identity"),snapshot:mark("snapshot",state),
    inspectNoPorts:mark("inspectNoPorts",{host_port_bindings:0}),preflightHealth:mark("preflightHealth",{clean:true}),
    assertAbsent:mark("assertAbsent",state),migrate:mark("migrate",{running:true,sql:true,succeeded:true,failed:true,rerun_exact:true}),
    predicateMatrix:mark("predicateMatrix",{active:7,terminal:5,total:12,active_duplicate_sqlstate:"23505",terminal_same_source_count:2}),
    faults:mark("faults",faultResult),approval:mark("approval",{compile:true,connect:true,setup:true,named7:true,cleanup:true,after:true}) });
  for(const name of ["inputs","authorities","formalStatic","inspect","snapshot","inspectNoPorts","preflightHealth","assertAbsent","migrate","predicateMatrix","faults","approval"])
    assert.ok(calls.some(([actual])=>actual===name),name);
  assert.equal(calls.filter(([name])=>name==="migrate").length,2);assert.equal(calls.filter(([name])=>name==="predicateMatrix").length,2);
  assert.equal(calls.filter(([name])=>name==="faults").length,2);assert.equal(result.results.length,2);
  assert.equal(result.failures.length,2);assert.equal(result.fault_summary.length,8);
  assert.ok(calls.filter(([name])=>name==="faults").every((call)=>calls.indexOf(call)<calls.findIndex(([name])=>name==="migrate")));
  assert.deepEqual(result.results[0].predicate,{active:7,terminal:5,total:12,active_duplicate_sqlstate:"23505",terminal_same_source_count:2});
  assert.equal(result.approval.named7,true);
  assert.deepEqual(formalSuccessPayloadV11(result).fault_summary,result.fault_summary);
});

test("formal static child receives frozen mode as recorded benign env",()=>{const calls=[];formalStaticV11({runChild:(x)=>{calls.push(x);return{};}});
 const stage=calls.find((x)=>x.stage==="static-v11-orchestrator");assert.equal(stage.env.B2C_000197_V11_STATIC_MODE,"frozen");
 assert.deepEqual(stage.envAllowlist.find((x)=>x.name==="B2C_000197_V11_STATIC_MODE"),{name:"B2C_000197_V11_STATIC_MODE",persist:"value"});});

test("authoritative manifest closure excludes returned artifacts and matches declared local dependencies",()=>{
 const source=readFileSync(resolve(process.cwd(),"scripts/e2e/property-remediation/track-b2c-000197-preliminary-orchestrator-v11.mjs"),"utf8");
 assert.doesNotMatch(source,/93fb2c36|old-writer-drain-v4-returned/u);
 assert.doesNotMatch(source,/preliminary-(?:executor|orchestrator)-v[34567]\.mjs/u);
 for(const dependency of ["track-b2c-000197-failure-cases-v11.mjs","track-b2c-000197-preliminary-executor-v11.mjs",
   "track-b2c-000197-closure-resolver-v11.mjs","static-v11-capability","static-v11-recursive-closure",
   "property-approval.port.pg-cli.ts","property-approval.port.pg.spec.ts","b2c-approval-port-runtime-implementation-v8-handoff.md"])
   assert.match(source,new RegExp(dependency.replaceAll(".","\\.")));
});
