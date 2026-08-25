BEGIN;
DO $$BEGIN IF(SELECT count(*) FROM sys_role WHERE tenant_id='10000001' AND park_id='20000001' AND code IN('HR_MANAGER','DEPARTMENT_MANAGER','EMPLOYEE_SELF_SERVICE') AND is_deleted=false AND is_enabled=true AND status='enabled')<>3 THEN RAISE EXCEPTION 'Expected exact active T6 feedback role baseline';END IF;END$$;

CREATE TEMP TABLE hr_t6_feedback_permissions(code varchar(128)PRIMARY KEY,name varchar(128),action varchar(64),sort_no integer)ON COMMIT DROP;
INSERT INTO hr_t6_feedback_permissions VALUES
 ('hr:feedback:read','读取园区360评价','read',874),('hr:feedback:team_read','读取组织树360评价','team_read',875),('hr:feedback:self_read','读取本人360评价','self_read',876),
 ('hr:feedback:model_manage','管理胜任力与问卷','model_manage',877),('hr:feedback:cycle_manage','管理360周期','cycle_manage',878),('hr:feedback:nominate','提名360评价人','nominate',879),
 ('hr:feedback:nomination_review','审批360评价人','nomination_review',880),('hr:feedback:result_publish','发布360匿名结果','result_publish',881);
INSERT INTO sys_permission(id,tenant_id,park_id,code,name,parent_id,resource,action,permission_path,perm_path,permission_level,level,sort_no,permission_type,perm_type,is_system,is_builtin,is_tenant_custom,visible,keep_alive,always_show,is_enabled,status,create_time,update_time,is_deleted,version,remark)
SELECT uuid_generate_v4(),'10000001','20000001',x.code,x.name,p.id,'hr.feedback',x.action,'hr/'||x.code,'hr/'||x.code,3,3,x.sort_no,'api',30,true,true,false,false,true,false,true,'enabled',now(),now(),false,1,'HR T6 feedback360 least privilege atom' FROM hr_t6_feedback_permissions x CROSS JOIN LATERAL(SELECT id FROM sys_permission WHERE tenant_id='10000001' AND code='hr' AND is_deleted=false LIMIT 1)p
ON CONFLICT(tenant_id,code)WHERE is_deleted=false DO UPDATE SET name=EXCLUDED.name,park_id=EXCLUDED.park_id,parent_id=EXCLUDED.parent_id,resource=EXCLUDED.resource,action=EXCLUDED.action,sort_no=EXCLUDED.sort_no,is_enabled=true,status='enabled',is_deleted=false,update_time=now(),remark=EXCLUDED.remark;

CREATE TEMP TABLE hr_t6_feedback_grants(role_code varchar(64),permission_code varchar(128),PRIMARY KEY(role_code,permission_code))ON COMMIT DROP;
INSERT INTO hr_t6_feedback_grants VALUES
 ('HR_MANAGER','hr:feedback:read'),('HR_MANAGER','hr:feedback:model_manage'),('HR_MANAGER','hr:feedback:cycle_manage'),('HR_MANAGER','hr:feedback:nominate'),('HR_MANAGER','hr:feedback:nomination_review'),('HR_MANAGER','hr:feedback:respond'),('HR_MANAGER','hr:feedback:result_publish'),('HR_MANAGER','hr:feedback:result_read'),
 ('DEPARTMENT_MANAGER','hr:feedback:team_read'),('DEPARTMENT_MANAGER','hr:feedback:nominate'),('DEPARTMENT_MANAGER','hr:feedback:nomination_review'),('DEPARTMENT_MANAGER','hr:feedback:respond'),
 ('EMPLOYEE_SELF_SERVICE','hr:feedback:self_read'),('EMPLOYEE_SELF_SERVICE','hr:feedback:nominate'),('EMPLOYEE_SELF_SERVICE','hr:feedback:respond');
INSERT INTO rel_role_perm(tenant_id,park_id,role_id,permission_id,create_time,update_time,is_deleted,version,remark)
SELECT '10000001','20000001',r.id,p.id,now(),now(),false,1,'HR T6 feedback360 least privilege' FROM hr_t6_feedback_grants g JOIN sys_role r ON r.tenant_id='10000001' AND r.park_id='20000001' AND r.code=g.role_code AND r.is_deleted=false AND r.is_enabled=true AND r.status='enabled' JOIN sys_permission p ON p.tenant_id='10000001' AND p.park_id='20000001' AND p.code=g.permission_code AND p.is_deleted=false
ON CONFLICT(tenant_id,park_id,role_id,permission_id)WHERE is_deleted=false DO UPDATE SET is_deleted=false,update_time=now(),remark=EXCLUDED.remark;

DO $$BEGIN
 IF(SELECT count(*) FROM sys_permission WHERE tenant_id='10000001' AND park_id='20000001' AND code IN(SELECT code FROM hr_t6_feedback_permissions) AND is_deleted=false AND is_enabled=true)<>8 THEN RAISE EXCEPTION 'HR T6 feedback permissions incomplete';END IF;
 IF EXISTS(SELECT 1 FROM rel_role_perm rp JOIN sys_role r ON(r.id,r.tenant_id,r.park_id)=(rp.role_id,rp.tenant_id,rp.park_id) JOIN sys_permission p ON(p.id,p.tenant_id,p.park_id)=(rp.permission_id,rp.tenant_id,rp.park_id) WHERE rp.tenant_id='10000001' AND rp.park_id='20000001' AND rp.is_deleted=false AND ((r.code='DEPARTMENT_MANAGER' AND p.code IN('hr:feedback:read','hr:feedback:model_manage','hr:feedback:cycle_manage','hr:feedback:result_publish','hr:feedback:result_read')) OR (r.code='EMPLOYEE_SELF_SERVICE' AND p.code IN('hr:feedback:read','hr:feedback:team_read','hr:feedback:model_manage','hr:feedback:cycle_manage','hr:feedback:nomination_review','hr:feedback:result_publish','hr:feedback:result_read')))) THEN RAISE EXCEPTION 'T6 feedback broad permission leaked';END IF;
END$$;
COMMIT;
