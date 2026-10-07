import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { HrPreparedProfileBatchRepository } from "./hr-prepared-profile-batch.repository";
const scope = {tenantId:"10000001",parkId:"20000001"};
const revision = "a".repeat(40);
const hash = (text:string|Buffer) => createHash("sha256").update(text).digest("hex");
const canonical = (v:unknown):string => v===null||typeof v!=="object"?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonical).join(",")}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical((v as Record<string,unknown>)[k])}`).join(",")}}`;

test("actual ordered producer files admit metadata only and reject unsafe/tampered neighbors",async t=>{
  const root=realpathSync(mkdtempSync(join(tmpdir(),"hr-prepared-")));chmodSync(root,0o700);
  try {
    // Reuse the real producer fixture and real builder; no hand-written consumer receipt.
    const producer=spawnSync(process.execPath,["--input-type=module","-e",`
      import {aliasBatchFixture} from './scripts/e2e/yuzhou-profile-alias-batch.contract.mjs';
      import {materializeYuzhouProfileAliasBatch} from './scripts/hr-cutover/build-yuzhou-profile-alias-batch.mjs';
      import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
      import {join} from 'node:path';
      const root=process.argv[1],control=mkdtempSync(join(root,'preparation-')),result=join(control,'result');
      mkdirSync(result,{mode:0o700});const input=aliasBatchFixture();
      input.plannerInput.binding.targetScope={tenantId:'10000001',parkId:'20000001'};
      for(const row of [...input.plannerInput.employees,...input.plannerInput.profiles])Object.assign(row,input.plannerInput.binding.targetScope);
      const path=join(result,'input.json');writeFileSync(path,JSON.stringify(input),{mode:0o600});
      const output=materializeYuzhouProfileAliasBatch({inputPath:path,outputDir:join(result,'batch')});
      const receipt=JSON.parse(readFileSync(output.receiptPath,'utf8'));
      writeFileSync(join(result,'preparation-receipt.json'),JSON.stringify({formatVersion:1,kind:'yuzhou_original_profile_alias_private_preparation',
        collectorSha256:'e2de6e37d8007dd713002f437d714c7e454a64370c1a24efae3e98eac11eb632',runtimeCommit:'${revision}',
        inputSha256:'1'.repeat(64),beforeImagesSha256:'2'.repeat(64),batchReceiptSha256:receipt.receiptSha256,
        sourceProfiles:receipt.sourceProfiles,aliasProfiles:receipt.aliasProfiles,productionImport:'HOLD',authorizationGranted:false,writerPresent:false,
        expected:{profileCount:receipt.sourceProfiles,aliasProfiles:receipt.aliasProfiles,nativePlaceFills:receipt.nativePlaceFills,degreeFills:receipt.degreeFills}}),{mode:0o600});
      console.log('PREPARED_CONTROL='+control);
    `,root],{cwd:resolve(__dirname,"../../../../.."),encoding:"utf8",timeout:30000,maxBuffer:1024*1024});
    assert.equal(producer.status,0,producer.stderr);
    const control=producer.stdout.match(/^PREPARED_CONTROL=(.+)$/m)?.[1];assert.ok(control);
    const repository=new HrPreparedProfileBatchRepository(root,revision);
    const result=join(control,"result"),receiptPath=join(result,"batch","receipt.json"),preparationPath=join(result,"preparation-receipt.json");
    const receiptText=readFileSync(receiptPath),preparationText=readFileSync(preparationPath);
    const batch=repository.list(scope)[0]!;assert.equal(batch.sourceProfiles,5);assert.equal(batch.aliasProfiles,3);
    const packagePath=join(result,"batch","0001-baseline.json"),packageText=readFileSync(packagePath);
    await t.test("producer agreement and metadata boundary",()=>{
      assert.equal(repository.package(scope,batch.id,0).pkg.items.length,5);
      assert.doesNotMatch(JSON.stringify(repository.list(scope)),/原籍|学士|sourceKey|sourceIdentity|directory|input.json/);
      assert.deepEqual(repository.list({...scope,tenantId:"foreign"}),[]);
      assert.deepEqual(new HrPreparedProfileBatchRepository(root,"b".repeat(40)).list(scope),repository.list(scope));
      assert.deepEqual(new HrPreparedProfileBatchRepository(root,"invalid-runtime").list(scope),[]);
      assert.throws(()=>repository.package(scope,"../private",0));
    });
    for(const oldRecipe of ["5ba25c32890045910cd04f83325fd4dfbbac7cc5cb9e15f652e50ea7bb035d2e","161530bdc3e45693ee8063b408edef1eb9936bd96f6d69934c4d9f1029943d0c"]) await t.test("frozen recipe remains admissible: "+oldRecipe.slice(0,8),()=>{
      const receipt=JSON.parse(receiptText.toString());
      receipt.recipeSha256=oldRecipe;
      delete receipt.receiptSha256;receipt.receiptSha256=hash(canonical(receipt));
      const preparation=JSON.parse(preparationText.toString());preparation.batchReceiptSha256=receipt.receiptSha256;
      writeFileSync(receiptPath,JSON.stringify(receipt));writeFileSync(preparationPath,JSON.stringify(preparation));
      try {
        const oldBatch=repository.list(scope)[0]!;
        assert.equal(repository.package(scope,oldBatch.id,0).pkg.items.length,5);
        const aliasCount=oldBatch.packages.filter(entry=>entry.kind==="alias")
          .reduce((count,entry)=>count+repository.package(scope,oldBatch.id,entry.index).pkg.items.length,0);
        assert.equal(aliasCount,3);
      } finally {
        writeFileSync(receiptPath,receiptText);writeFileSync(preparationPath,preparationText);
      }
      assert.equal(repository.list(scope)[0]!.id,batch.id);
    });
    await t.test("payload hash, symlink and permissions",()=>{
      writeFileSync(packagePath,"{}");assert.throws(()=>repository.package(scope,batch.id,0));writeFileSync(packagePath,packageText);
      chmodSync(packagePath,0o644);assert.throws(()=>repository.package(scope,batch.id,0));chmodSync(packagePath,0o600);
      rmSync(packagePath);symlinkSync(join(result,"input.json"),packagePath);assert.throws(()=>repository.package(scope,batch.id,0));
      rmSync(packagePath);writeFileSync(packagePath,packageText,{mode:0o600});
    });
    await t.test("producer revision and collector contract remain validated",()=>{
      const original=JSON.parse(preparationText.toString());
      for(const change of [(r:Record<string,unknown>)=>{r.runtimeCommit="invalid"},
        (r:Record<string,unknown>)=>{r.collectorSha256="f".repeat(64)}]){
        const preparation=structuredClone(original);change(preparation);
        writeFileSync(preparationPath,JSON.stringify(preparation));assert.throws(()=>repository.list(scope));
      }
      writeFileSync(preparationPath,preparationText);
      assert.equal(new HrPreparedProfileBatchRepository(root,"b".repeat(40)).package(scope,batch.id,0).pkg.items.length,5);
    });
    await t.test("receipt hash and resealed foreign scope/order rejected",()=>{
      const original=JSON.parse(receiptText.toString());
      for(const change of [(r:Record<string,unknown>)=>{r.targetScope={tenantId:"foreign",parkId:scope.parkId}},
        (r:Record<string,unknown>)=>{(r.executionOrder as Array<Record<string,unknown>>)[0]!.kind="alias"},
        (r:Record<string,unknown>)=>{r.sourceProfiles="5"},
        (r:Record<string,unknown>)=>{r.recipeSha256="f".repeat(64)},
        (r:Record<string,unknown>)=>{r.adapterSha256="f".repeat(64)}]){
        const receipt=structuredClone(original);change(receipt);delete receipt.receiptSha256;receipt.receiptSha256=hash(canonical(receipt));
        const preparation=JSON.parse(preparationText.toString());preparation.batchReceiptSha256=receipt.receiptSha256;
        writeFileSync(receiptPath,JSON.stringify(receipt));writeFileSync(preparationPath,JSON.stringify(preparation));assert.throws(()=>repository.list(scope));
      }
      writeFileSync(receiptPath,receiptText);writeFileSync(preparationPath,preparationText);
      assert.equal(repository.list(scope).length,1);
    });
  } finally {rmSync(root,{recursive:true,force:true});}
});
