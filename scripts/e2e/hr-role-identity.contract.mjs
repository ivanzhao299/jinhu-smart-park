import { test } from 'node:test';
import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagnoseIdentity, identitySql } from '../diagnose-hr-role-identity.mjs';

test('only fixed scope aggregate SQL runs in read-only transaction with deadlines', () => {
  const result = diagnoseIdentity('/synthetic', (cmd,args,options) => {
    assert.equal(cmd,'docker'); assert.ok(args.includes('postgres'));
    assert.equal(options.input,identitySql); assert.equal(options.timeout,15000);
    assert.match(identitySql,/BEGIN TRANSACTION READ ONLY/); assert.match(identitySql,/ROLLBACK;/);
    assert.doesNotMatch(identitySql,/\b(INSERT|UPDATE|DELETE|GRANT|CREATE|ALTER)\b/i);
    return '{"matchingUsers":2,"enabledUsers":1,"eligibleRoles":1,"boundUsers":0}';
  });
  assert.equal(result.classification,'IDENTITY_AMBIGUOUS');
  assert.equal(result.productionImport,'HOLD');
});
test('missing/exact/role failures and no diagnostic or unexpected-field leakage', () => {
  for (const [n,r,c] of [[0,1,'IDENTITY_MISSING'],[1,1,'EXACT_IDENTITY_AND_ROLE'],[1,0,'ROLE_UNRESOLVED']]) {
    assert.equal(diagnoseIdentity('/synthetic',()=>JSON.stringify({matchingUsers:n,enabledUsers:n,eligibleRoles:r,boundUsers:0})).classification,c);
  }
  assert.throws(()=>diagnoseIdentity('/synthetic',()=>{throw new Error('private diagnostic');}),/^Error: HR_ROLE_IDENTITY_PROBE_FAILED$/);
  for (const v of ['null','{}','{"matchingUsers":-1}',JSON.stringify({matchingUsers:1,enabledUsers:2,eligibleRoles:1,boundUsers:0}),
    JSON.stringify({matchingUsers:1,enabledUsers:1,eligibleRoles:1,boundUsers:0,secret:'private'})]) {
    assert.throws(()=>diagnoseIdentity('/synthetic',()=>v),/^Error: HR_ROLE_IDENTITY_RESULT_INVALID$/);
  }
  assert.throws(()=>diagnoseIdentity('relative'),/PATH_INVALID/);
});
test('workflow limits probe to explicit read-only runtime diagnosis',()=>{
  const workflow=readFileSync(new URL('../../.github/workflows/deploy-production.yml',import.meta.url),'utf8');
  const step=workflow.split('- name: Diagnose HR role identity counts (read-only)')[1].split('- name: Diagnose production runtime image revisions')[0];
  assert.match(step,/inputs.deploy_mode == 'diagnose-production-runtime-revision' && inputs.diagnose_hr_role/);
  assert.doesNotMatch(step,/prod:deploy|db:seed|db:migrate/);
});
