-- Incremental production role queue sourced from
-- 《金湖集团部门及人员职责分工（2026）》.
--
-- Safety contract:
-- - never deletes or disables existing users, roles, organizations or links;
-- - never overwrites an existing password;
-- - new identities stay disabled until the protected UAT credential flow runs;
-- - reuses the established production role codes and underscore usernames.

BEGIN;

WITH source_org(org_code, org_name, org_type, parent_code, sort_order) AS (
  VALUES
    ('JH_GROUP', '山东金湖集团有限公司', 'group', NULL, 10),
    ('JH_EXEC', '集团管理层', 'department', 'JH_GROUP', 20),
    ('JH_HR_ADMIN', '人力资源与综合行政管理部', 'department', 'JH_GROUP', 30),
    ('JH_FINANCE', '财务管理部', 'department', 'JH_GROUP', 40),
    ('JH_LEGAL', '法律合规管理部', 'department', 'JH_GROUP', 50),
    ('JH_ENGINEERING_PROPERTY', '工程建设与物业管理部', 'department', 'JH_GROUP', 60),
    ('JH_LEASING_OPERATIONS', '招商与园区运营管理部', 'department', 'JH_GROUP', 70),
    ('JH_SUBSIDIARIES', '成员公司及项目负责人', 'department', 'JH_GROUP', 80),
    ('JH_PRESIDENT_OFFICE', '总裁办公室', 'department', 'JH_GROUP', 90),
    ('JH_LY_GK_TECH_PARK', '临沂国控科技产业园开发有限公司', 'company', 'JH_SUBSIDIARIES', 110),
    ('JH_NEW_MATERIALS', '山东金湖新材料科技有限公司', 'company', 'JH_SUBSIDIARIES', 120),
    ('JH_REAL_ESTATE', '山东金湖置业有限公司', 'company', 'JH_SUBSIDIARIES', 130),
    ('JH_HUIJIN_ZHICHUANG', '汇金智创（山东）产业发展有限公司', 'company', 'JH_SUBSIDIARIES', 140),
    ('JH_SHUAIKE_AUTO', '山东帅科自动化科技有限公司', 'company', 'JH_SUBSIDIARIES', 150)
)
INSERT INTO sys_org (tenant_id, park_id, org_code, org_name, org_type, sort_order, status, remark)
SELECT '10000001', '20000001', org_code, org_name, org_type, sort_order, 'enabled',
       '依据《金湖集团部门及人员职责分工（2026）》增量维护'
FROM source_org
ON CONFLICT (tenant_id, park_id, org_code) WHERE is_deleted = false
DO UPDATE SET org_name = EXCLUDED.org_name,
              org_type = EXCLUDED.org_type,
              sort_order = EXCLUDED.sort_order,
              status = 'enabled',
              update_time = now(),
              remark = EXCLUDED.remark;

WITH source_org(org_code, parent_code) AS (
  VALUES
    ('JH_GROUP', NULL), ('JH_EXEC', 'JH_GROUP'), ('JH_HR_ADMIN', 'JH_GROUP'),
    ('JH_FINANCE', 'JH_GROUP'), ('JH_LEGAL', 'JH_GROUP'),
    ('JH_ENGINEERING_PROPERTY', 'JH_GROUP'), ('JH_LEASING_OPERATIONS', 'JH_GROUP'),
    ('JH_SUBSIDIARIES', 'JH_GROUP'), ('JH_PRESIDENT_OFFICE', 'JH_GROUP'),
    ('JH_LY_GK_TECH_PARK', 'JH_SUBSIDIARIES'), ('JH_NEW_MATERIALS', 'JH_SUBSIDIARIES'),
    ('JH_REAL_ESTATE', 'JH_SUBSIDIARIES'), ('JH_HUIJIN_ZHICHUANG', 'JH_SUBSIDIARIES'),
    ('JH_SHUAIKE_AUTO', 'JH_SUBSIDIARIES')
)
UPDATE sys_org child
SET parent_id = parent.id, update_time = now()
FROM source_org source
LEFT JOIN sys_org parent
  ON parent.tenant_id = '10000001'
 AND parent.park_id = '20000001'
 AND parent.org_code = source.parent_code
 AND parent.is_deleted = false
WHERE child.tenant_id = '10000001'
  AND child.park_id = '20000001'
  AND child.org_code = source.org_code
  AND child.is_deleted = false;

WITH source_post(post_code, post_name, sort_order) AS (
  VALUES
    ('GROUP_PRESIDENT', '集团总裁', 10),
    ('GROUP_VP', '集团副总裁', 20),
    ('HR_ADMIN_MANAGER', '人力资源管理中心、综合行政管理中心经理', 30),
    ('HR_ASSISTANT', '人力资源助理', 40),
    ('ADMIN_DEPUTY_DIRECTOR', '综合行政管理中心副主任', 50),
    ('FINANCE_MANAGER', '财务管理中心经理', 60),
    ('FINANCE_DEPUTY_MANAGER', '财务管理中心副经理', 70),
    ('LEGAL_COMPLIANCE_MANAGER', '法律合规部经理', 80),
    ('ENGINEERING_PROPERTY_MANAGER', '工程物管中心经理', 90),
    ('ENGINEERING_PROJECT_MANAGER', '工程项目经理、总工程师', 100),
    ('INSTALLATION_ENGINEER', '项目安装工程师', 110),
    ('LEASING_LEAD', '园区招商负责人', 120),
    ('PROPERTY_SITE_MANAGER', '园区物业管理负责人', 130),
    ('SUBSIDIARY_GENERAL_MANAGER', '成员公司总经理/项目负责人', 140),
    ('PRESIDENT_OFFICE_DEPUTY', '总裁办副主任、民宿业务负责人', 150),
    ('PRESIDENT_ASSISTANT', '总裁助理', 160),
    ('PRESIDENT_OFFICE_ASSISTANT', '总裁办综合事务助理', 170)
)
INSERT INTO sys_post (tenant_id, park_id, post_code, post_name, sort_order, status, remark)
SELECT '10000001', '20000001', post_code, post_name, sort_order, 'enabled',
       '依据《金湖集团部门及人员职责分工（2026）》增量维护'
FROM source_post
ON CONFLICT (tenant_id, park_id, post_code) WHERE is_deleted = false
DO UPDATE SET post_name = EXCLUDED.post_name,
              sort_order = EXCLUDED.sort_order,
              status = 'enabled',
              update_time = now(),
              remark = EXCLUDED.remark;

WITH source_user(username, display_name, duty) AS (
  VALUES
    ('zhao_yongwei', '赵永伟', '全面负责集团发展战略、经营管理及重大事项决策'),
    ('xu_wanxi', '许万玺', '分管重点项目、产业园招商运营、工程建设及综合协调；兼汇金智创总经理'),
    ('wu_enguo', '吴恩国', '负责人力资源管理体系、人员规划、薪酬绩效、劳动关系、社保及综合行政管理'),
    ('yuan_haitao', '苑海涛', '协助劳动关系、社会保险、人事事务及生产后勤协调'),
    ('liu_xia', '刘霞', '负责档案、证章、会议组织、行政支持、统计报送及后勤协调'),
    ('liu_hantao', '刘汉涛', '负责财务管理、资金运作、税务管理、融资协调及财务监督'),
    ('wang_yanxiu', '王艳秀', '协助财务核算、资金执行及相关财务管理'),
    ('jiang_beiping', '蒋北平', '负责法律事务、合规管理、合同审查、涉法涉诉及风险防控；兼金湖置业经营管理'),
    ('li_rongjie', '李荣杰', '负责工程建设管理及园区物业运营管理体系运行'),
    ('shao_minghong', '邵明洪', '负责工程项目技术、质量、进度、验收及结算管理'),
    ('zheng_ziyong', '郑子勇', '负责机电安装及相关专业技术管理'),
    ('song_qianchang', '宋乾昌', '负责园区招商策划、实施、客户服务及招商运营管理'),
    ('chen_guohui', '陈国辉', '负责园区物业现场运营、服务管理及物业团队建设'),
    ('cheng_xiaojie', '程效杰', '临沂国控科技产业园开发有限公司总经理'),
    ('song_yongshan', '宋永山', '山东金湖新材料科技有限公司总经理'),
    ('wang_lejin', '王乐金', '山东帅科自动化科技有限公司总经理'),
    ('wang_xinxin', '王欣欣', '负责总裁办公室综合事务及集团民宿业务运营管理'),
    ('li_xiaobin', '李晓斌', '协助总裁处理日常事务、新业务拓展及综合协调'),
    ('zhao_weichen', '赵炜晨', '协助总裁、副总裁开展日常事务协调及相关执行工作')
)
INSERT INTO sys_user (
  tenant_id, park_id, username, display_name, password_hash, is_enabled, status, remark
)
SELECT '10000001', '20000001', username, display_name,
       '!RESPONSIBILITY_USER_CREDENTIAL_NOT_INITIALIZED!', false, 'disabled',
       duty || '；依据《金湖集团部门及人员职责分工（2026）》增量维护'
FROM source_user
ON CONFLICT (tenant_id, park_id, username) WHERE is_deleted = false
DO UPDATE SET display_name = EXCLUDED.display_name,
              update_time = now(),
              remark = EXCLUDED.remark;

WITH assignment(username, org_code, post_code) AS (
  VALUES
    ('zhao_yongwei', 'JH_EXEC', 'GROUP_PRESIDENT'),
    ('xu_wanxi', 'JH_EXEC', 'GROUP_VP'),
    ('wu_enguo', 'JH_HR_ADMIN', 'HR_ADMIN_MANAGER'),
    ('yuan_haitao', 'JH_HR_ADMIN', 'HR_ASSISTANT'),
    ('liu_xia', 'JH_HR_ADMIN', 'ADMIN_DEPUTY_DIRECTOR'),
    ('liu_hantao', 'JH_FINANCE', 'FINANCE_MANAGER'),
    ('wang_yanxiu', 'JH_FINANCE', 'FINANCE_DEPUTY_MANAGER'),
    ('jiang_beiping', 'JH_LEGAL', 'LEGAL_COMPLIANCE_MANAGER'),
    ('li_rongjie', 'JH_ENGINEERING_PROPERTY', 'ENGINEERING_PROPERTY_MANAGER'),
    ('shao_minghong', 'JH_ENGINEERING_PROPERTY', 'ENGINEERING_PROJECT_MANAGER'),
    ('zheng_ziyong', 'JH_ENGINEERING_PROPERTY', 'INSTALLATION_ENGINEER'),
    ('song_qianchang', 'JH_LEASING_OPERATIONS', 'LEASING_LEAD'),
    ('chen_guohui', 'JH_LEASING_OPERATIONS', 'PROPERTY_SITE_MANAGER'),
    ('cheng_xiaojie', 'JH_LY_GK_TECH_PARK', 'SUBSIDIARY_GENERAL_MANAGER'),
    ('song_yongshan', 'JH_NEW_MATERIALS', 'SUBSIDIARY_GENERAL_MANAGER'),
    ('wang_lejin', 'JH_SHUAIKE_AUTO', 'SUBSIDIARY_GENERAL_MANAGER'),
    ('wang_xinxin', 'JH_PRESIDENT_OFFICE', 'PRESIDENT_OFFICE_DEPUTY'),
    ('li_xiaobin', 'JH_PRESIDENT_OFFICE', 'PRESIDENT_ASSISTANT'),
    ('zhao_weichen', 'JH_PRESIDENT_OFFICE', 'PRESIDENT_OFFICE_ASSISTANT')
), resolved AS (
  SELECT app_user.id AS user_id, org.id AS org_id, post.id AS post_id
  FROM assignment
  JOIN sys_user app_user
    ON app_user.tenant_id = '10000001' AND app_user.park_id = '20000001'
   AND app_user.username = assignment.username AND app_user.is_deleted = false
  JOIN sys_org org
    ON org.tenant_id = '10000001' AND org.park_id = '20000001'
   AND org.org_code = assignment.org_code AND org.is_deleted = false
  JOIN sys_post post
    ON post.tenant_id = '10000001' AND post.park_id = '20000001'
   AND post.post_code = assignment.post_code AND post.is_deleted = false
), updated AS (
  UPDATE rel_user_org link
  SET org_id = resolved.org_id,
      post_id = resolved.post_id,
      is_primary = true,
      is_deleted = false,
      update_time = now(),
      remark = '2026 职责分工主组织岗位'
  FROM resolved
  WHERE link.tenant_id = '10000001'
    AND link.park_id = '20000001'
    AND link.user_id = resolved.user_id
    AND link.is_primary = true
  RETURNING link.user_id
)
INSERT INTO rel_user_org (tenant_id, park_id, user_id, org_id, post_id, is_primary, remark)
SELECT '10000001', '20000001', user_id, org_id, post_id, true, '2026 职责分工主组织岗位'
FROM resolved
WHERE NOT EXISTS (
  SELECT 1 FROM rel_user_org existing
  WHERE existing.tenant_id = '10000001'
    AND existing.park_id = '20000001'
    AND existing.user_id = resolved.user_id
    AND existing.is_primary = true
    AND existing.is_deleted = false
);

WITH responsibility_users(username) AS (
  VALUES
    ('zhao_yongwei'), ('xu_wanxi'), ('wu_enguo'), ('yuan_haitao'), ('liu_xia'),
    ('liu_hantao'), ('wang_yanxiu'), ('jiang_beiping'), ('li_rongjie'),
    ('shao_minghong'), ('zheng_ziyong'), ('song_qianchang'), ('chen_guohui'),
    ('cheng_xiaojie'), ('song_yongshan'), ('wang_lejin'), ('wang_xinxin'),
    ('li_xiaobin'), ('zhao_weichen')
), resolved AS (
  SELECT app_user.id AS user_id
  FROM responsibility_users
  JOIN sys_user app_user
    ON app_user.tenant_id = '10000001' AND app_user.park_id = '20000001'
   AND app_user.username = responsibility_users.username AND app_user.is_deleted = false
)
INSERT INTO rel_user_park (tenant_id, user_id, park_id, is_default, status, remark)
SELECT '10000001', user_id, '20000001', true, 'enabled', '2026 职责分工默认园区'
FROM resolved
ON CONFLICT (tenant_id, user_id, park_id) WHERE is_deleted = false
DO UPDATE SET is_default = true,
              status = 'enabled',
              update_time = now(),
              remark = EXCLUDED.remark;

DO $$
DECLARE missing_roles text;
BEGIN
  WITH required(code) AS (
    VALUES ('EXECUTIVE'), ('OPERATIONS_OWNER'), ('INVEST_MANAGER'), ('PROPERTY_MANAGER'),
           ('SYSTEM_ADMIN'), ('AUDITOR'), ('FINANCE_MANAGER'), ('FINANCE_SPECIALIST'),
           ('SAFETY_MANAGER'), ('IOT_MANAGER'), ('PROPERTY_STAFF'),
           ('MAINTENANCE_ENGINEER'), ('IOT_OPERATOR')
  )
  SELECT string_agg(required.code, ', ' ORDER BY required.code) INTO missing_roles
  FROM required
  WHERE NOT EXISTS (
    SELECT 1 FROM sys_role role
    WHERE role.tenant_id = '10000001'
      AND role.code = required.code
      AND role.is_deleted = false
  );

  IF missing_roles IS NOT NULL THEN
    RAISE EXCEPTION 'Missing responsibility role codes: %', missing_roles;
  END IF;
END $$;

WITH assignment(username, role_code) AS (
  VALUES
    ('zhao_yongwei', 'EXECUTIVE'), ('zhao_yongwei', 'OPERATIONS_OWNER'),
    ('xu_wanxi', 'EXECUTIVE'), ('xu_wanxi', 'OPERATIONS_OWNER'),
    ('xu_wanxi', 'INVEST_MANAGER'), ('xu_wanxi', 'PROPERTY_MANAGER'),
    ('wu_enguo', 'SYSTEM_ADMIN'),
    ('yuan_haitao', 'AUDITOR'),
    ('liu_xia', 'SYSTEM_ADMIN'), ('liu_xia', 'AUDITOR'),
    ('liu_hantao', 'FINANCE_MANAGER'),
    ('wang_yanxiu', 'FINANCE_SPECIALIST'),
    ('jiang_beiping', 'EXECUTIVE'), ('jiang_beiping', 'AUDITOR'),
    ('li_rongjie', 'PROPERTY_MANAGER'), ('li_rongjie', 'SAFETY_MANAGER'), ('li_rongjie', 'IOT_MANAGER'),
    ('shao_minghong', 'PROPERTY_STAFF'), ('shao_minghong', 'MAINTENANCE_ENGINEER'),
    ('zheng_ziyong', 'MAINTENANCE_ENGINEER'), ('zheng_ziyong', 'IOT_OPERATOR'),
    ('song_qianchang', 'INVEST_MANAGER'),
    ('chen_guohui', 'PROPERTY_MANAGER'), ('chen_guohui', 'SAFETY_MANAGER'),
    ('cheng_xiaojie', 'EXECUTIVE'),
    ('song_yongshan', 'EXECUTIVE'),
    ('wang_lejin', 'EXECUTIVE'),
    ('wang_xinxin', 'SYSTEM_ADMIN'), ('wang_xinxin', 'EXECUTIVE'),
    ('li_xiaobin', 'EXECUTIVE'),
    ('zhao_weichen', 'AUDITOR')
), resolved AS (
  SELECT app_user.id AS user_id, role.id AS role_id
  FROM assignment
  JOIN sys_user app_user
    ON app_user.tenant_id = '10000001' AND app_user.park_id = '20000001'
   AND app_user.username = assignment.username AND app_user.is_deleted = false
  JOIN sys_role role
    ON role.tenant_id = '10000001' AND role.code = assignment.role_code
   AND role.is_deleted = false
)
INSERT INTO rel_user_role (tenant_id, park_id, user_id, role_id, remark)
SELECT '10000001', '20000001', user_id, role_id, '2026 职责分工标准角色队列'
FROM resolved
ON CONFLICT (tenant_id, park_id, user_id, role_id) WHERE is_deleted = false
DO UPDATE SET is_deleted = false,
              update_time = now(),
              remark = EXCLUDED.remark;

WITH leader(org_code, username) AS (
  VALUES
    ('JH_GROUP', 'zhao_yongwei'), ('JH_EXEC', 'zhao_yongwei'),
    ('JH_HR_ADMIN', 'wu_enguo'), ('JH_FINANCE', 'liu_hantao'),
    ('JH_LEGAL', 'jiang_beiping'), ('JH_ENGINEERING_PROPERTY', 'li_rongjie'),
    ('JH_LEASING_OPERATIONS', 'song_qianchang'), ('JH_SUBSIDIARIES', 'xu_wanxi'),
    ('JH_PRESIDENT_OFFICE', 'wang_xinxin'), ('JH_LY_GK_TECH_PARK', 'cheng_xiaojie'),
    ('JH_NEW_MATERIALS', 'song_yongshan'), ('JH_REAL_ESTATE', 'jiang_beiping'),
    ('JH_HUIJIN_ZHICHUANG', 'xu_wanxi'), ('JH_SHUAIKE_AUTO', 'wang_lejin')
)
UPDATE sys_org org
SET leader_user_id = app_user.id, update_time = now()
FROM leader
JOIN sys_user app_user
  ON app_user.tenant_id = '10000001' AND app_user.park_id = '20000001'
 AND app_user.username = leader.username AND app_user.is_deleted = false
WHERE org.tenant_id = '10000001'
  AND org.park_id = '20000001'
  AND org.org_code = leader.org_code
  AND org.is_deleted = false;

COMMIT;
