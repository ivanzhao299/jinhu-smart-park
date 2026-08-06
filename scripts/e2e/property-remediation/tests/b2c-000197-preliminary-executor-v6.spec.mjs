import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import test, { afterEach } from "node:test";
import { EvidenceRecorderV6, executeWithEvidenceV6, parseTapV6 } from "../track-b2c-000197-preliminary-executor-v6.mjs";
const roots=[]; const temp=()=>{const base=mkdtempSync("/tmp/v6-");roots.push(base);return{base,evidence:resolve(base,"evidence")};};
const success=(out="ok\n")=>({status:0,signal:null,error:null,stdout:Buffer.from(out),stderr:Buffer.alloc(0)});
const text=(root)=>readdirSync(root).map((name)=>readFileSync(resolve(root,name),"utf8")).join("\n");
afterEach(()=>{while(roots.length)rmSync(roots.pop(),{recursive:true,force:true});});
test("benign argv elements remain exact in immutable intent",()=>{const p=temp();const r=new EvidenceRecorderV6({evidenceRoot:p.evidence,spawn:()=>success()});
 r.runChild({stage:"args",command:"node",args:["--test-reporter=tap","safe/spec.mjs","probe"],cwd:p.base});const out=text(p.evidence);
 for(const value of ["--test-reporter=tap","safe/spec.mjs","probe"])assert.ok(out.includes(value));});
test("secret-bearing argv elements are redacted without hiding benign siblings",()=>{const p=temp();const r=new EvidenceRecorderV6({evidenceRoot:p.evidence,spawn:()=>success()});
 r.runChild({stage:"args",command:"node",args:["--test-reporter=tap","password=exact-1","postgresql://u:exact-2@db/x"],cwd:p.base});
 const out=text(p.evidence);assert.ok(out.includes("--test-reporter=tap"));assert.ok(!out.includes("exact-1"));assert.ok(!out.includes("exact-2"));});
test("terminal success discovers nested token and env secrets",()=>{const p=temp();executeWithEvidenceV6({evidenceRoot:p.evidence,operation:()=>1,
 successPayload:{nested:{token:"terminal-exact",env:{password:"env-exact"}}}});const out=text(p.evidence);assert.ok(!out.includes("terminal-exact"));assert.ok(!out.includes("env-exact"));});
test("terminal failure discovers error token",()=>{const p=temp();assert.throws(()=>executeWithEvidenceV6({evidenceRoot:p.evidence,
 operation:()=>{const e=new Error("boom");e.token="failure-exact";throw e;}}));assert.ok(!text(p.evidence).includes("failure-exact"));});
test("nonsecret environment allowlist records exact key and value",()=>{const p=temp();const r=new EvidenceRecorderV6({evidenceRoot:p.evidence,spawn:()=>success()});
 r.runChild({stage:"env",command:"node",cwd:p.base,env:{B2C_000197_V6_STATIC_MODE:"frozen"},
 envAllowlist:[{name:"B2C_000197_V6_STATIC_MODE",persist:"value"}]});assert.match(text(p.evidence),/"B2C_000197_V6_STATIC_MODE": "frozen"/u);});
test("real fixture five explicit reporter parses",()=>{const p=temp();const r=new EvidenceRecorderV6({evidenceRoot:p.evidence});const x=r.runChild({stage:"five",command:process.execPath,
 args:["--test-reporter=tap","--require","ts-node/register","src/modules/property-approvals/property-approval.port.pg-fixture.spec.ts"],
 cwd:resolve(process.cwd(),"apps/api"),env:{PATH:process.env.PATH},envAllowlist:[{name:"PATH",persist:"value"}],parser:(s)=>parseTapV6(s,5)});assert.equal(x.parsed.tests,5);});
test("real exact eight explicit reporter parses",()=>{const p=temp();const r=new EvidenceRecorderV6({evidenceRoot:p.evidence});const code="const t=require('node:test');"+Array.from({length:8},(_,i)=>`t('x${i}',()=>{});`).join("");
 const x=r.runChild({stage:"eight",command:process.execPath,args:["--test-reporter=tap","-e",code],cwd:p.base,
 env:{PATH:process.env.PATH},envAllowlist:[{name:"PATH",persist:"value"}],parser:(s)=>parseTapV6(s,8)});assert.equal(x.parsed.pass,8);});
test("suite or skip drift rejects",()=>{for(const out of ["# tests 8\n# suites 1\n# pass 8\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n",
 "# tests 8\n# suites 0\n# pass 8\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n"])assert.throws(()=>parseTapV6(out,8));});
