BEGIN;
DO $$BEGIN IF(SELECT count(*) FROM sys_role WHERE tenant_id='10000001' AND park_id='20000001' AND code IN('HR_MANAGER','DEPARTMENT_MANAGER','EMPLOYEE_SELF_SERVICE') AND is_deleted=false AND is_enabled=true AND status='enabled')<>3 THEN RAISE EXCEPTION 'Expected exact active T6 review role baseline';END IF;END$$;

INSERT INTO sys_permission(id,tenant_id,park_id,code,name,parent_id,resource,action,permission_path,perm_path,permission_level,level,sort_no,permission_type,perm_type,is_system,is_builtin,is_tenant_custom,visible,keep_alive,always_show,is_enabled,status,create_time,update_time,is_deleted,version,remark)
SELECT uuid_generate_v4(),'10000001','20000001','hr:performance:appeal_review','处理绩效申诉',p.id,'hr.performance','appeal_review','hr/hr:performance:appeal_review','hr/hr:performance:appeal_review',3,3,873,'api',30,true,true,false,false,true,false,true,'enabled',now(),now(),false,1,'HR T6 performance appeal-review atom' FROM sys_permission p WHERE p.tenant_id='10000001' AND p.code='hr' AND p.is_deleted=false
ON CONFLICT(tenant_id,code)WHERE is_deleted=false DO UPDATE SET name=EXCLUDED.name,park_id=EXCLUDED.park_id,parent_id=EXCLUDED.parent_id,resource=EXCLUDED.resource,action=EXCLUDED.action,sort_no=EXCLUDED.sort_no,is_enabled=true,status='enabled',is_deleted=false,update_time=now(),remark=EXCLUDED.remark;

CREATE TEMP TABLE hr_t6_review_grants(role_code varchar(64),permission_code varchar(128),PRIMARY KEY(role_code,permission_code))ON COMMIT DROP;
INSERT INTO hr_t6_review_grants VALUES
 ('HR_MANAGER','hr:performance:self_review'),('HR_MANAGER','hr:performance:manager_review'),('HR_MANAGER','hr:performance:calibrate'),('HR_MANAGER','hr:performance:acknowledge'),('HR_MANAGER','hr:performance:appeal'),('HR_MANAGER','hr:performance:appeal_review'),('HR_MANAGER','hr:performance:result_read'),
 ('DEPARTMENT_MANAGER','hr:performance:self_review'),('DEPARTMENT_MANAGER','hr:performance:manager_review'),('DEPARTMENT_MANAGER','hr:performance:acknowledge'),('DEPARTMENT_MANAGER','hr:performance:appeal'),
 ('EMPLOYEE_SELF_SERVICE','hr:performance:self_review'),('EMPLOYEE_SELF_SERVICE','hr:performance:acknowledge'),('EMPLOYEE_SELF_SERVICE','hr:performance:appeal');
INSERT INTO rel_role_perm(tenant_id,park_id,role_id,permission_id,create_time,update_time,is_deleted,version,remark)
SELECT '10000001','20000001',r.id,p.id,now(),now(),false,1,'HR T6 performance review least privilege' FROM hr_t6_review_grants g JOIN sys_role r ON r.tenant_id='10000001' AND r.park_id='20000001' AND r.code=g.role_code AND r.is_deleted=false AND r.is_enabled=true AND r.status='enabled' JOIN sys_permission p ON p.tenant_id='10000001' AND p.park_id='20000001' AND p.code=g.permission_code AND p.is_deleted=false
ON CONFLICT(tenant_id,park_id,role_id,permission_id)WHERE is_deleted=false DO UPDATE SET is_deleted=false,update_time=now(),remark=EXCLUDED.remark;

DO $$BEGIN
 IF(SELECT count(*) FROM sys_permission WHERE tenant_id='10000001' AND park_id='20000001' AND code='hr:performance:appeal_review' AND is_deleted=false AND is_enabled=true)<>1 THEN RAISE EXCEPTION 'HR T6 appeal-review permission incomplete';END IF;
 IF EXISTS(SELECT 1 FROM rel_role_perm rp JOIN sys_role r ON(r.id,r.tenant_id,r.park_id)=(rp.role_id,rp.tenant_id,rp.park_id) JOIN sys_permission p ON(p.id,p.tenant_id,p.park_id)=(rp.permission_id,rp.tenant_id,rp.park_id) WHERE rp.tenant_id='10000001' AND rp.park_id='20000001' AND rp.is_deleted=false AND r.code IN('DEPARTMENT_MANAGER','EMPLOYEE_SELF_SERVICE') AND p.code IN('hr:performance:calibrate','hr:performance:appeal_review','hr:performance:result_read')) THEN RAISE EXCEPTION 'T6 performance review broad permission leaked';END IF;
END$$;
COMMIT;
