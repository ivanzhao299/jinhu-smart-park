import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { snapshotColumns,snapshotRelations,snapshotCaptureQueries } from '../personnel-correction-snapshot-contract.mjs';
import { correctionCtes,snapshotCorrectionCtes } from '../personnel-correction-sql.mjs';

test('all thirteen typed CTAS projections match immutable capture columns exactly',()=>{
 const migration=readFileSync(new URL('../../../database/migrations/000325_hr_personnel_correction_snapshot.sql',import.meta.url),'utf8');
 assert.equal(snapshotRelations.length,13);
 for(const name of snapshotRelations){
  const match=migration.match(new RegExp(`CREATE TABLE hr_correction_snapshot\\.${name} AS SELECT ([^;]+) FROM public\\.${name} WITH NO DATA;`));
  assert.ok(match,`missing fixed projection ${name}`);
  const expected=snapshotColumns[name].split(' ').join(',')+(name==='hr_employee_profile'?',xmin::text AS origin_xmin':'');
  assert.equal(match[1],expected,`projection mismatch ${name}`);
  assert.ok(snapshotCaptureQueries[name].includes('$4::text parent_operation_id'));
 }
});

test('every mapped source relation keeps its exact FROM/JOIN occurrence count',()=>{
 for(const name of snapshotRelations.filter(n=>n!=='hr_employee_profile')){
  const original=correctionCtes.match(new RegExp(`\\b(?:FROM|JOIN) ${name}\\b`,'g'))||[];
  const mapped=snapshotCorrectionCtes.match(new RegExp(`\\b(?:FROM|JOIN) hr_correction_snapshot\\.${name}\\b`,'g'))||[];
  assert.ok(original.length>0);assert.equal(mapped.length,original.length);
  assert.equal((snapshotCorrectionCtes.match(new RegExp(`\\b(?:FROM|JOIN) ${name}\\b`,'g'))||[]).length,0);
 }
});
