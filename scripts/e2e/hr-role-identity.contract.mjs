import { test } from 'node:test';
import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagnoseIdentity, identitySql } from '../diagnose-hr-role-identity.mjs';

const fixture = (v={}) => ({matchingUsers:1,enabledUsers:1,eligibleRoles:1,boundUsers:0,selectedUsers:1,enabledSelectedUsers:1,selectedBoundUsers:0,requiredPermissions:5,rolePermissions:5,effectivePermissions:0,...v});

test('only fixed scope aggregate SQL runs in read-only transaction with deadlines', () => {
  const result = diagnoseIdentity('/synthetic', (cmd,args,options) => {
    assert.equal(cmd,'docker'); assert.ok(args.includes('postgres'));
    assert.equal(options.input,identitySql); assert.equal(options.timeout,15000);
    assert.match(identitySql,/BEGIN TRANSACTION READ ONLY/); assert.match(identitySql,/ROLLBACK;/);
    assert.doesNotMatch(identitySql,/\b(INSERT|UPDATE|DELETE|GRANT|CREATE|ALTER)\b/i);
    return JSON.stringify(fixture({matchingUsers:2,enabledUsers:1}));
  });
  assert.equal(result.classification,'IDENTITY_AMBIGUOUS');
  assert.equal(result.productionImport,'HOLD');
});
test('missing/exact/role failures and no diagnostic or unexpected-field leakage', () => {
  for (const [n,r,c] of [[0,1,'IDENTITY_MISSING'],[1,1,'EXACT_IDENTITY_AND_ROLE'],[1,0,'ROLE_UNRESOLVED']]) {
    assert.equal(diagnoseIdentity('/synthetic',()=>JSON.stringify(fixture({matchingUsers:n,enabledUsers:n,selectedUsers:n,enabledSelectedUsers:n,eligibleRoles:r}))).classification,c);
  }
  assert.throws(()=>diagnoseIdentity('/synthetic',()=>{throw new Error('private diagnostic');}),/^Error: HR_ROLE_IDENTITY_PROBE_FAILED$/);
  for (const v of ['null','{}','{"matchingUsers":-1}',JSON.stringify({matchingUsers:1,enabledUsers:2,eligibleRoles:1,boundUsers:0}),
    JSON.stringify({...fixture(),secret:'private'}),JSON.stringify(fixture({effectivePermissions:6})),JSON.stringify(fixture({selectedBoundUsers:2}))]) {
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

test('canonical selection differentiates duplicate aliases, disabled identity and missing capabilities',()=>{
 for(const [changes,expected] of [
  [{matchingUsers:2,enabledUsers:2},'SELECTED_ROLE_UNBOUND'],
  [{selectedUsers:2,matchingUsers:2,enabledUsers:2,enabledSelectedUsers:2},'SELECTED_IDENTITY_AMBIGUOUS'],
  [{enabledSelectedUsers:0},'SELECTED_IDENTITY_DISABLED'],
  [{selectedBoundUsers:1,effectivePermissions:4},'PROFILE_CAPABILITIES_INCOMPLETE'],
  [{selectedBoundUsers:1,effectivePermissions:5},'SELECTED_PROFILE_ACCESS_READY'],
 ]) assert.equal(diagnoseIdentity('/synthetic',()=>JSON.stringify(fixture(changes))).selectedClassification,expected);
});
