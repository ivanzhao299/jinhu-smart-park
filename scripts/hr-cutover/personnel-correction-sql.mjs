import { snapshotRelations } from './personnel-correction-snapshot-contract.mjs';
import { personnelAliasSql } from '../diagnose-yuzhou-personnel-alias.mjs';

// Reuse the reviewed PostgreSQL JSONB algorithm verbatim. Only replace the
// observer's fixed scope with parameters and select one independently bound op.
const start = personnelAliasSql.indexOf('WITH ops AS (');
const end = personnelAliasSql.indexOf('), hashed AS (');
if (start < 0 || end < 0) throw new Error('CORRECTION_OBSERVER_CONTRACT_CHANGED');
export const correctionCtes = personnelAliasSql.slice(start, end + 1)
  .replaceAll("'10000001'", '$1').replaceAll("'20000001'", '$2')
  .replace("WHERE o.status='succeeded'", "WHERE o.operation_id=$3 AND o.parent_operation_id=$4 AND o.status='succeeded'");

export const sealSelect = `SELECT jsonb_build_object('sealVersion',1,
 'mappingVersion','yuzhou-personnel-alias-null-fill-v1','plannedProfiles',planned_profiles,
 'nativePlaceFills',native_place_fills,'degreeFills',degree_fills,
 'planSha256',plan_sha256,'beforeSha256',before_sha256,'afterSha256',after_sha256) seal
 FROM correction_seal`;

export const lockSql = `LOCK TABLE hr_yuzhou_t5_followon_operation,
 hr_yuzhou_production_import_operation,migration_batch,hr_yuzhou_t5_followon_source,
 hr_yuzhou_t5_followon_projection_receipt,legacy_record_map,
 hr_yuzhou_production_import_record,hr_yuzhou_production_import_phase,
 hr_yuzhou_production_import_projection_receipt,hr_employee,
 hr_legacy_identity_registry,hr_legacy_archive_record,hr_employee_profile
 IN SHARE ROW EXCLUSIVE MODE`;

export const materializeSql = `CREATE TEMP TABLE correction_rows_private ON COMMIT DROP AS
 ${correctionCtes}
 SELECT c.*,to_jsonb(p) full_before FROM correction_rows c
 JOIN hr_employee_profile p ON p.id=c.profile_id`;

export const applySql = `UPDATE hr_employee_profile p SET
 native_place=CASE WHEN r.patch ? 'native_place' AND p.native_place IS NULL THEN r.patch->>'native_place' ELSE p.native_place END,
 degree=CASE WHEN r.patch ? 'degree' AND p.degree IS NULL THEN r.patch->>'degree' ELSE p.degree END
 FROM correction_rows_private r
 WHERE p.id=r.profile_id AND to_jsonb(p)=r.full_before
 AND p.tenant_id=r.binding->>'tenantId' AND p.park_id=r.binding->>'parkId'
 AND p.employee_id::text=r.binding->>'employeeId' AND NOT p.is_deleted
 AND p.legacy_source_identity_sha256=r.binding->>'sourceIdentitySha256'
 AND p.legacy_source_row_sha256=r.binding->>'sourceRowSha256'`;

export const detailSql = `INSERT INTO hr_personnel_correction_detail
 (operation_id,profile_id,binding,patch,before_image,after_image,after_xmin)
 SELECT $1,p.id,r.binding,r.patch,r.full_before,to_jsonb(p),p.xmin::text
 FROM correction_rows_private r JOIN hr_employee_profile p ON p.id=r.profile_id
 WHERE jsonb_build_object('native_place',p.native_place,'degree',p.degree)=r.after_image
 AND (to_jsonb(p)-'native_place'-'degree')=(r.full_before-'native_place'-'degree')`;

export const rollbackSql = `UPDATE hr_employee_profile p SET
 native_place=CASE WHEN d.patch ? 'native_place' THEN d.before_image->>'native_place' ELSE p.native_place END,
 degree=CASE WHEN d.patch ? 'degree' THEN d.before_image->>'degree' ELSE p.degree END
 FROM hr_personnel_correction_detail d WHERE d.operation_id=$1 AND p.id=d.profile_id
 AND to_jsonb(p)=d.after_image AND p.xmin::text=d.after_xmin
 AND p.tenant_id=d.binding->>'tenantId' AND p.park_id=d.binding->>'parkId'
 AND p.employee_id::text=d.binding->>'employeeId' AND NOT p.is_deleted`;

// Replace only FROM/JOIN relation tokens, never quoted target_table literals or
// arbitrary caller mappings. Profile remains the real writable public table.
export const snapshotCorrectionCtes = snapshotRelations.filter(n=>n!=='hr_employee_profile').reduce((sql,name)=>
 sql.replace(new RegExp(`\\b(FROM|JOIN) ${name}\\b`,'g'),`$1 hr_correction_snapshot.${name}`),correctionCtes)
 .replace('follow_batch.target_database=current_database()','follow_batch.target_database=$5');
export const snapshotLockSql = `LOCK TABLE public.hr_employee_profile IN SHARE ROW EXCLUSIVE MODE`;
