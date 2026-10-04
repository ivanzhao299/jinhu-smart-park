import test from 'node:test';
import {Buffer} from 'node:buffer';
import assert from 'node:assert/strict';
import {generateKeyPairSync,privateDecrypt,createDecipheriv,constants} from 'node:crypto';
import {buildT5QuarantineImpactReadonlySql,sanitizeCurrentReviewReferences,encryptCurrentReviewReferences} from '../diagnose-production-runtime-revision.mjs';
const row=()=>({targetTable:'hr_employee_profile',reasonCode:'EMPLOYEE_PROFILE_IDENTITY_AMBIGUOUS',employeeId:'00000001-0001-0001-0001-000000000001',sourceIdentitySha256:'a'.repeat(64),sourceRowSha256:'b'.repeat(64),decisionReceiptSha256:'c'.repeat(64),financialFlags:{payroll:false,legacyBook:true,insurance:false,reconciliation:false}});
const fixture=()=>({operationBound:true,sourceAggregateMatches:true,receiptAggregateMatches:true,references:[row()]});
const check=x=>sanitizeCurrentReviewReferences(JSON.stringify(x));
test('review query shares original classification and emits only bounded references',()=>{
 const normal=buildT5QuarantineImpactReadonlySql(),review=buildT5QuarantineImpactReadonlySql({reviewReferences:true});
 assert.equal(normal.slice(0,normal.indexOf(', groups AS (')),review.slice(0,review.indexOf('\nSELECT json_build_object')));
 assert.match(review,/READ ONLY/u);assert.ok(review.endsWith('ROLLBACK;\n'));assert.match(review,/WHERE disposition='current_impact'/u);
 assert.doesNotMatch(review.replace(/'(?:''|[^'])*'/gu,"''"),/\b(?:INSERT|UPDATE|DELETE|COPY|decrypt)\b/iu);
 const output=review.slice(review.indexOf('\nSELECT json_build_object'));assert.doesNotMatch(output,/full_name|identity_card|encrypted_source|salary|LIMIT/iu);
});
test('binding failures, extra values, malformed IDs and duplicate references fail closed',()=>{
 assert.equal(check(fixture()).references.length,1);assert.equal(check({...fixture(),references:[]}).references.length,0);
 for(const key of ['operationBound','sourceAggregateMatches','receiptAggregateMatches'])assert.throws(()=>check({...fixture(),[key]:false}));
 for(const change of [r=>r.fullName='forbidden',r=>r.employeeId='bad',r=>r.sourceRowSha256='bad',r=>r.targetTable='sys_file',r=>r.reasonCode='PHOTO_SOURCE_EMPTY',r=>r.financialFlags.payroll=1]){const f=fixture();change(f.references[0]);assert.throws(()=>check(f));}
 assert.throws(()=>check({...fixture(),references:[row(),row()]}));assert.throws(()=>check({...fixture(),references:Array(501).fill(row())}));assert.throws(()=>check({...fixture(),extra:true}));
});
test('public transport contains ciphertext only and authenticated decryption rejects tampering',()=>{
 const keys=generateKeyPairSync('rsa',{modulusLength:2048});const f=fixture();const envelope=encryptCurrentReviewReferences(JSON.stringify(f),keys.publicKey);
 assert.equal(envelope.recordCount,1);assert.equal(envelope.productionWrites,false);assert.ok(!JSON.stringify(envelope).includes(f.references[0].employeeId));assert.ok(!JSON.stringify(envelope).includes(f.references[0].sourceIdentitySha256));
 const key=privateDecrypt({key:keys.privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(envelope.wrappedKey,'base64'));
 function decrypt(bytes){const d=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));d.setAAD(Buffer.from(envelope.aad,'base64'));d.setAuthTag(Buffer.from(envelope.tag,'base64'));return Buffer.concat([d.update(bytes),d.final()]);}
 const bytes=Buffer.from(envelope.ciphertext,'base64');assert.deepEqual(JSON.parse(decrypt(bytes)),f);bytes[0]^=1;assert.throws(()=>decrypt(bytes));key.fill(0);
});
