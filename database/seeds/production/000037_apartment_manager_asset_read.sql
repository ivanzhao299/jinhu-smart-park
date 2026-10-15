-- 公寓管理员下拉数据修复：补齐资产与字典只读权限。
-- 背景：房间/房源管理页的用途/楼栋/楼层下拉分别依赖 system:dict-item:list、
-- asset:building:list、asset:floor:list，新增房源与列表依赖 asset:unit:list。
-- APARTMENT_MANAGER 角色此前仅有 unit:read，导致仅有该角色的账号
-- （如生产 wu_enguo）页面可打开但所有下拉为空。
-- 只增不减、幂等可重放。
BEGIN;

INSERT INTO rel_role_perm(tenant_id,park_id,role_id,permission_id,create_time,update_time,is_deleted,version,remark)
SELECT '10000001','20000001',r.id,p.id,now(),now(),false,1,'Apartment manager needs asset/dict read permissions for unit page dropdowns'
FROM sys_role r
JOIN sys_permission p ON p.tenant_id=r.tenant_id AND p.is_deleted=false AND p.is_enabled=true
  AND p.code IN ('asset:building:list','asset:floor:list','asset:unit:list','system:dict-item:list')
WHERE r.tenant_id='10000001' AND r.code='APARTMENT_MANAGER' AND r.is_deleted=false
ON CONFLICT(tenant_id,park_id,role_id,permission_id) WHERE is_deleted=false DO UPDATE SET is_deleted=false,update_time=now(),remark=EXCLUDED.remark;

DO $$ BEGIN
 IF (SELECT count(*) FROM rel_role_perm rp
     JOIN sys_role r ON r.id=rp.role_id AND r.tenant_id='10000001' AND r.code='APARTMENT_MANAGER' AND r.is_deleted=false
     JOIN sys_permission p ON p.id=rp.permission_id AND p.is_deleted=false
     WHERE rp.is_deleted=false AND p.code IN ('asset:building:list','asset:floor:list','asset:unit:list','system:dict-item:list')) <> 4
 THEN RAISE EXCEPTION 'apartment manager asset/dict read permissions incomplete'; END IF;
END $$;

-- 数据范围：与其他业务角色一致，绑定"本园区"（current_park）规则。
-- 缺失时数据范围回退为受限集，楼栋/楼层/房源列表会被过滤为空。
INSERT INTO rel_role_data_scope(tenant_id,park_id,role_id,rule_id,create_time,update_time,is_deleted,version,remark)
SELECT '10000001','20000001',r.id,rule.id,now(),now(),false,1,'Apartment manager follows current-park data scope'
FROM sys_role r
JOIN sys_data_scope_rule rule ON rule.tenant_id='10000001' AND rule.park_id='20000001'
  AND rule.rule_code='current_park' AND rule.dimension='park' AND rule.scope_type='park'
  AND rule.status='enabled' AND rule.is_deleted=false
WHERE r.tenant_id='10000001' AND r.code='APARTMENT_MANAGER' AND r.is_deleted=false
ON CONFLICT(tenant_id,park_id,role_id,rule_id) WHERE is_deleted=false DO UPDATE SET
  is_deleted=false,update_time=now(),remark=EXCLUDED.remark;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM rel_role_data_scope rds
     JOIN sys_role r ON r.id=rds.role_id AND r.tenant_id='10000001' AND r.code='APARTMENT_MANAGER' AND r.is_deleted=false
     JOIN sys_data_scope_rule rule ON rule.id=rds.rule_id AND rule.rule_code='current_park' AND rule.is_deleted=false
     WHERE rds.tenant_id='10000001' AND rds.park_id='20000001' AND rds.is_deleted=false)
 THEN RAISE EXCEPTION 'apartment manager current_park data scope binding incomplete'; END IF;
END $$;

COMMIT;
