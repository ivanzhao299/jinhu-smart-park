-- Production-safe S1 core seed.
-- Initializes permissions, default park organization, base roles, and dictionaries.
-- This file must not create users, fixed passwords, test phone numbers, or test emails.
-- Replace tenant_id and park_id when seeding a real environment.
INSERT INTO sys_tenant (
  tenant_id,
  park_id,
  tenant_code,
  tenant_name,
  tenant_type,
  status,
  max_users,
  max_parks,
  plan_code,
  remark
)
VALUES (
  '10000001',
  '0',
  'JH_DEFAULT',
  '金湖科创产业园默认租户',
  'park_operator',
  1,
  0,
  0,
  'GROUP',
  'Production-safe default tenant seed for future SaaS isolation'
)
ON CONFLICT (tenant_id) WHERE is_deleted = false DO UPDATE SET
  tenant_code = EXCLUDED.tenant_code,
  tenant_name = EXCLUDED.tenant_name,
  tenant_type = EXCLUDED.tenant_type,
  status = EXCLUDED.status,
  max_users = EXCLUDED.max_users,
  max_parks = EXCLUDED.max_parks,
  plan_code = EXCLUDED.plan_code,
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

WITH RECURSIVE seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
leaf_permissions(code, name, resource, action) AS (
  VALUES
    ('system:org:list', '组织列表', 'system.org', 'list'),
    ('system:org:create', '新增组织', 'system.org', 'create'),
    ('system:org:detail', '组织详情', 'system.org', 'detail'),
    ('system:org:update', '编辑组织', 'system.org', 'update'),
    ('system:org:delete', '删除组织', 'system.org', 'delete'),
    ('system:user:list', '用户列表', 'system.user', 'list'),
    ('system:user:create', '新增用户', 'system.user', 'create'),
    ('system:user:detail', '用户详情', 'system.user', 'detail'),
    ('system:user:update', '编辑用户', 'system.user', 'update'),
    ('system:user:delete', '删除用户', 'system.user', 'delete'),
    ('system:user:reset-password', '重置密码', 'system.user', 'reset-password'),
    ('system:user:assign-roles', '分配角色', 'system.user', 'assign-roles'),
    ('system:user:me', '当前用户', 'system.user', 'me'),
    ('system:role:list', '角色列表', 'system.role', 'list'),
    ('system:role:create', '新增角色', 'system.role', 'create'),
    ('system:role:detail', '角色详情', 'system.role', 'detail'),
    ('system:role:update', '编辑角色', 'system.role', 'update'),
    ('system:role:delete', '删除角色', 'system.role', 'delete'),
    ('system:role:assign-permissions', '角色授权', 'system.role', 'assign-permissions'),
    ('role:read', '角色读取', 'system.role', 'read'),
    ('role:create', '新增开放角色', 'system.role', 'create'),
    ('role:update', '编辑开放角色', 'system.role', 'update'),
    ('role:copy', '复制模板角色', 'system.role', 'copy'),
    ('role:disable', '停用启用角色', 'system.role', 'disable'),
    ('role:delete', '删除开放角色', 'system.role', 'delete'),
    ('tenant:read', '租户读取', 'system.tenant', 'read'),
    ('tenant:manage', '租户管理', 'system.tenant', 'manage'),
    ('system:permission:list', '权限列表', 'system.permission', 'list'),
    ('system:permission:tree', '权限树', 'system.permission', 'tree'),
    ('system:permission:create', '新增权限', 'system.permission', 'create'),
    ('system:permission:update', '编辑权限', 'system.permission', 'update'),
    ('system:permission:delete', '删除权限', 'system.permission', 'delete'),
    ('permission:read', '权限读取', 'system.permission', 'read'),
    ('permission:create', '新增开放权限', 'system.permission', 'create'),
    ('permission:update', '编辑开放权限', 'system.permission', 'update'),
    ('permission:delete', '删除开放权限', 'system.permission', 'delete'),
    ('system:data-scope:read', '数据权限读取', 'system.data-scope', 'read'),
    ('system:data-scope:create', '新增数据权限', 'system.data-scope', 'create'),
    ('system:data-scope:update', '编辑数据权限', 'system.data-scope', 'update'),
    ('system:data-scope:delete', '删除数据权限', 'system.data-scope', 'delete'),
    ('system:data-scope:assign', '角色数据权限绑定', 'system.data-scope', 'assign'),
    ('data_scope:read', '开放数据权限读取', 'system.data-scope', 'read'),
    ('data_scope:create', '新增开放数据权限', 'system.data-scope', 'create'),
    ('data_scope:update', '编辑开放数据权限', 'system.data-scope', 'update'),
    ('data_scope:delete', '删除开放数据权限', 'system.data-scope', 'delete'),
    ('role:assign_data_scope', '角色绑定数据权限', 'system.role', 'assign-data-scope'),
    ('system:field-policy:read', '字段策略读取', 'system.field-policy', 'read'),
    ('system:field-policy:create', '新增字段策略', 'system.field-policy', 'create'),
    ('system:field-policy:update', '编辑字段策略', 'system.field-policy', 'update'),
    ('system:field-policy:delete', '删除字段策略', 'system.field-policy', 'delete'),
    ('system:field-policy:assign', '角色字段策略绑定', 'system.field-policy', 'assign'),
    ('field_policy:read', '开放字段策略读取', 'system.field-policy', 'read'),
    ('field_policy:create', '新增开放字段策略', 'system.field-policy', 'create'),
    ('field_policy:update', '编辑开放字段策略', 'system.field-policy', 'update'),
    ('field_policy:delete', '删除开放字段策略', 'system.field-policy', 'delete'),
    ('role:assign_field_policy', '角色绑定字段策略', 'system.role', 'assign-field-policy'),
    ('system:code-rule:read', '编码规则读取', 'system.code-rule', 'read'),
    ('system:code-rule:create', '新增编码规则', 'system.code-rule', 'create'),
    ('system:code-rule:update', '编辑编码规则', 'system.code-rule', 'update'),
    ('system:code-rule:delete', '删除编码规则', 'system.code-rule', 'delete'),
    ('system:code-rule:generate', '生成业务编码', 'system.code-rule', 'generate'),
    ('code_rule:read', '开放编码规则读取', 'system.code-rule', 'read'),
    ('code_rule:create', '新增开放编码规则', 'system.code-rule', 'create'),
    ('code_rule:update', '编辑开放编码规则', 'system.code-rule', 'update'),
    ('code_rule:generate', '开放编码生成', 'system.code-rule', 'generate'),
    ('system:module:read', '模块读取', 'system.module', 'read'),
    ('system:module:create', '新增模块', 'system.module', 'create'),
    ('system:module:update', '编辑模块', 'system.module', 'update'),
    ('system:plan:read', '套餐读取', 'system.plan', 'read'),
    ('system:plan:create', '新增套餐', 'system.plan', 'create'),
    ('system:plan:update', '编辑套餐', 'system.plan', 'update'),
    ('system:tenant-module:read', '租户模块授权读取', 'system.tenant-module', 'read'),
    ('system:tenant-module:assign', '租户模块授权', 'system.tenant-module', 'assign'),
    ('module:read', '开放模块读取', 'system.module', 'read'),
    ('module:manage', '开放模块管理', 'system.module', 'manage'),
    ('plan:read', '开放套餐读取', 'system.plan', 'read'),
    ('plan:manage', '开放套餐管理', 'system.plan', 'manage'),
    ('tenant_module:read', '开放租户模块读取', 'system.tenant-module', 'read'),
    ('tenant_module:manage', '开放租户模块管理', 'system.tenant-module', 'manage'),
    ('system:dict-type:list', '字典类型列表', 'system.dict-type', 'list'),
    ('system:dict-type:create', '新增字典类型', 'system.dict-type', 'create'),
    ('system:dict-type:detail', '字典类型详情', 'system.dict-type', 'detail'),
    ('system:dict-type:update', '编辑字典类型', 'system.dict-type', 'update'),
    ('system:dict-type:delete', '删除字典类型', 'system.dict-type', 'delete'),
    ('system:dict-item:list', '字典项列表', 'system.dict-item', 'list'),
    ('system:dict-item:create', '新增字典项', 'system.dict-item', 'create'),
    ('system:dict-item:detail', '字典项详情', 'system.dict-item', 'detail'),
    ('system:dict-item:update', '编辑字典项', 'system.dict-item', 'update'),
    ('system:dict-item:delete', '删除字典项', 'system.dict-item', 'delete'),
    ('system:attachment:list', '附件列表', 'system.attachment', 'list'),
    ('system:attachment:create', '新增附件', 'system.attachment', 'create'),
    ('system:attachment:detail', '附件详情', 'system.attachment', 'detail'),
    ('system:attachment:delete', '删除附件', 'system.attachment', 'delete'),
    ('file:read', '文件读取', 'system.file', 'read'),
    ('file:upload', '文件上传', 'system.file', 'upload'),
    ('file:download', '文件下载', 'system.file', 'download'),
    ('file:delete', '文件删除', 'system.file', 'delete'),
    ('audit:read', '审计读取', 'system.audit', 'read'),
    ('audit:export', '审计导出', 'system.audit', 'export'),
    ('system:audit:login-log:list', '登录日志列表', 'system.audit', 'login-log:list'),
    ('system:audit:op-log:list', '操作日志列表', 'system.audit', 'op-log:list'),
    ('park:read', '园区读取', 'biz.park', 'read'),
    ('park:create', '新增园区', 'biz.park', 'create'),
    ('park:update', '编辑园区', 'biz.park', 'update'),
    ('park:delete', '删除园区', 'biz.park', 'delete'),
    ('building:read', '楼栋读取', 'biz.building', 'read'),
    ('building:create', '新增楼栋', 'biz.building', 'create'),
    ('building:update', '编辑楼栋', 'biz.building', 'update'),
    ('building:delete', '删除楼栋', 'biz.building', 'delete'),
    ('floor:read', '楼层读取', 'biz.floor', 'read'),
    ('floor:create', '新增楼层', 'biz.floor', 'create'),
    ('floor:update', '编辑楼层', 'biz.floor', 'update'),
    ('floor:delete', '删除楼层', 'biz.floor', 'delete'),
    ('floor:upload_layout', '上传楼层平面图', 'biz.floor', 'upload_layout'),
    ('unit:read', '房源读取', 'biz.unit', 'read'),
    ('unit:create', '新增房源', 'biz.unit', 'create'),
    ('unit:update', '编辑房源', 'biz.unit', 'update'),
    ('unit:delete', '删除房源', 'biz.unit', 'delete'),
    ('unit:transition_status', '房源状态流转', 'biz.unit', 'transition_status'),
    ('unit:change_status', '房源状态变更', 'biz.unit', 'change_status'),
    ('unit:force_change_status', '强制调整房源状态', 'biz.unit', 'force_change_status'),
    ('unit:status_log', '房源状态日志', 'biz.unit', 'status_log'),
    ('unit:import', '房源导入', 'biz.unit', 'import'),
    ('unit:import_template', '房源导入模板', 'biz.unit', 'import_template'),
    ('unit:export', '房源导出', 'biz.unit', 'export'),
    ('asset:read', '资产读取', 'biz.asset', 'read'),
    ('asset:status_board', '房源状态看板', 'biz.asset', 'status_board'),
    ('asset:statistics', '资产统计', 'biz.asset', 'statistics'),
    ('asset:statistics:read', '资产统计读取', 'biz.asset', 'statistics:read'),
    ('asset:park:list', '园区列表', 'asset.park', 'list'),
    ('asset:park:create', '新增园区', 'asset.park', 'create'),
    ('asset:park:detail', '园区详情', 'asset.park', 'detail'),
    ('asset:park:update', '编辑园区', 'asset.park', 'update'),
    ('asset:park:delete', '删除园区', 'asset.park', 'delete'),
    ('asset:building:list', '楼栋列表', 'asset.building', 'list'),
    ('asset:building:create', '新增楼栋', 'asset.building', 'create'),
    ('asset:building:detail', '楼栋详情', 'asset.building', 'detail'),
    ('asset:building:update', '编辑楼栋', 'asset.building', 'update'),
    ('asset:building:delete', '删除楼栋', 'asset.building', 'delete'),
    ('asset:floor:list', '楼层列表', 'asset.floor', 'list'),
    ('asset:floor:create', '新增楼层', 'asset.floor', 'create'),
    ('asset:floor:detail', '楼层详情', 'asset.floor', 'detail'),
    ('asset:floor:update', '编辑楼层', 'asset.floor', 'update'),
    ('asset:floor:delete', '删除楼层', 'asset.floor', 'delete'),
    ('asset:unit:list', '房源列表', 'asset.unit', 'list'),
    ('asset:unit:create', '新增房源', 'asset.unit', 'create'),
    ('asset:unit:detail', '房源详情', 'asset.unit', 'detail'),
    ('asset:unit:update', '编辑房源', 'asset.unit', 'update'),
    ('asset:unit:delete', '删除房源', 'asset.unit', 'delete'),
    ('park_tenant:read', '租户企业读取', 'biz.park_tenant', 'read'),
    ('park_tenant:360', '租户企业 360 视图', 'biz.park_tenant', '360'),
    ('park_tenant:create', '新增租户企业', 'biz.park_tenant', 'create'),
    ('park_tenant:update', '编辑租户企业', 'biz.park_tenant', 'update'),
    ('park_tenant:delete', '删除租户企业', 'biz.park_tenant', 'delete'),
    ('park_tenant:risk_update', '租户企业风险调整', 'biz.park_tenant', 'risk_update'),
    ('park_tenant:risk_log', '租户企业风险日志', 'biz.park_tenant_risk_log', 'risk_log'),
    ('park_tenant_contact:read', '租户企业联系人读取', 'biz.park_tenant_contact', 'read'),
    ('park_tenant_contact:create', '新增租户企业联系人', 'biz.park_tenant_contact', 'create'),
    ('park_tenant_contact:update', '编辑租户企业联系人', 'biz.park_tenant_contact', 'update'),
    ('park_tenant_contact:delete', '删除租户企业联系人', 'biz.park_tenant_contact', 'delete'),
    ('park_tenant_qualification:read', '租户企业资质读取', 'biz.park_tenant_qualification', 'read'),
    ('park_tenant_qualification:create', '新增租户企业资质', 'biz.park_tenant_qualification', 'create'),
    ('park_tenant_qualification:update', '编辑租户企业资质', 'biz.park_tenant_qualification', 'update'),
    ('park_tenant_qualification:delete', '删除租户企业资质', 'biz.park_tenant_qualification', 'delete'),
    ('leasing_lead:read', '招商线索读取', 'biz.leasing_lead', 'read'),
    ('leasing_lead:create', '新增招商线索', 'biz.leasing_lead', 'create'),
    ('leasing_lead:update', '编辑招商线索', 'biz.leasing_lead', 'update'),
    ('leasing_lead:delete', '删除招商线索', 'biz.leasing_lead', 'delete'),
    ('leasing_lead:change_status', '招商线索状态流转', 'biz.leasing_lead', 'change_status'),
    ('leasing_lead:force_change_status', '招商线索强制状态流转', 'biz.leasing_lead', 'force_change_status'),
    ('leasing_lead:confirm_sign', '确认招商线索签约入驻', 'biz.leasing_lead', 'confirm_sign'),
    ('leasing_lead:status_log', '招商线索状态日志', 'biz.leasing_lead_status_log', 'status_log'),
    ('leasing_lead:convert_to_park_tenant', '招商线索转租户企业', 'biz.leasing_lead', 'convert_to_park_tenant'),
    ('leasing_lead_pool:read', '招商公海池读取', 'biz.leasing_lead_pool', 'read'),
    ('leasing_lead:assign', '招商线索分配', 'biz.leasing_lead', 'assign'),
    ('leasing_lead:reclaim', '招商线索领取', 'biz.leasing_lead', 'reclaim'),
    ('leasing_lead:move_to_pool', '招商线索移入公海池', 'biz.leasing_lead', 'move_to_pool'),
    ('leasing_follow:read', '招商跟进记录读取', 'biz.leasing_follow', 'read'),
    ('leasing_follow:create', '新增招商跟进记录', 'biz.leasing_follow', 'create'),
    ('leasing_follow:update', '编辑招商跟进记录', 'biz.leasing_follow', 'update'),
    ('leasing_follow:delete', '删除招商跟进记录', 'biz.leasing_follow', 'delete'),
    ('leasing_visit:read', '招商看房记录读取', 'biz.leasing_visit', 'read'),
    ('leasing_visit:create', '新增招商看房记录', 'biz.leasing_visit', 'create'),
    ('leasing_visit:update', '编辑招商看房记录', 'biz.leasing_visit', 'update'),
    ('leasing_visit:delete', '删除招商看房记录', 'biz.leasing_visit', 'delete'),
    ('leasing_quote:read', '招商报价读取', 'biz.leasing_quote', 'read'),
    ('leasing_quote:create', '新增招商报价', 'biz.leasing_quote', 'create'),
    ('leasing_quote:update', '编辑招商报价', 'biz.leasing_quote', 'update'),
    ('leasing_quote:delete', '删除招商报价', 'biz.leasing_quote', 'delete'),
    ('leasing_quote:submit', '提交招商报价审批', 'biz.leasing_quote', 'submit'),
    ('leasing_quote:approve', '招商报价审批通过', 'biz.leasing_quote', 'approve'),
    ('leasing_quote:reject', '招商报价审批驳回', 'biz.leasing_quote', 'reject'),
    ('leasing_quote:create_contract', '报价生成合同草稿', 'biz.leasing_quote', 'create_contract'),
    ('leasing_contract:read', '合同读取', 'biz.leasing_contract', 'read'),
    ('leasing_contract:create', '新增合同', 'biz.leasing_contract', 'create'),
    ('leasing_contract:update', '编辑合同', 'biz.leasing_contract', 'update'),
    ('leasing_contract:delete', '删除合同', 'biz.leasing_contract', 'delete'),
    ('leasing_contract:submit', '提交合同审批', 'biz.leasing_contract', 'submit'),
    ('leasing_contract:approve', '合同审批通过', 'biz.leasing_contract', 'approve'),
    ('leasing_contract:reject', '合同审批驳回', 'biz.leasing_contract', 'reject'),
    ('leasing_contract:void', '合同作废', 'biz.leasing_contract', 'void'),
    ('leasing_contract:archive', '合同签章归档', 'biz.leasing_contract', 'archive'),
    ('leasing_contract:effective', '合同生效', 'biz.leasing_contract', 'effective'),
    ('leasing_contract:renew', '生成续租合同草稿', 'biz.leasing_contract', 'renew'),
    ('leasing_contract:status_log', '合同状态日志', 'biz.leasing_contract_status_log', 'status_log'),
    ('leasing_contract:action_log', '合同操作日志', 'biz.leasing_contract_action_log', 'action_log'),
    ('leasing_contract:file_read', '合同附件读取', 'biz.leasing_contract', 'file_read'),
    ('leasing_contract_unit:read', '合同房源读取', 'rel.leasing_contract_unit', 'read'),
    ('leasing_contract_unit:create', '新增合同房源', 'rel.leasing_contract_unit', 'create'),
    ('leasing_contract_unit:update', '编辑合同房源', 'rel.leasing_contract_unit', 'update'),
    ('leasing_contract_unit:delete', '删除合同房源', 'rel.leasing_contract_unit', 'delete'),
    ('leasing_contract:recalculate', '合同金额重算', 'biz.leasing_contract', 'recalculate'),
    ('leasing_contract:override_area', '合同房源面积超额覆盖', 'rel.leasing_contract_unit', 'override_area'),
    ('leasing_contract:force_bind_unit', '合同强制绑定房源', 'rel.leasing_contract_unit', 'force_bind_unit'),
    ('leasing_contract:edit_after_submit', '提交后编辑合同房源', 'rel.leasing_contract_unit', 'edit_after_submit'),
    ('leasing_contract_change:read', '合同变更读取', 'biz.leasing_contract_change', 'read'),
    ('leasing_contract_change:create', '新增合同变更', 'biz.leasing_contract_change', 'create'),
    ('leasing_contract_change:update', '编辑合同变更', 'biz.leasing_contract_change', 'update'),
    ('leasing_contract_change:delete', '删除合同变更', 'biz.leasing_contract_change', 'delete'),
    ('leasing_contract_change:preview', '合同变更财务影响预览', 'biz.leasing_contract_change', 'preview'),
    ('leasing_contract_change:submit', '提交合同变更审批', 'biz.leasing_contract_change', 'submit'),
    ('leasing_contract_change:approve', '合同变更审批通过', 'biz.leasing_contract_change', 'approve'),
    ('leasing_contract_change:reject', '合同变更审批驳回', 'biz.leasing_contract_change', 'reject'),
    ('leasing_contract_change:effective', '合同变更生效', 'biz.leasing_contract_change', 'effective'),
    ('leasing_checkout:read', '退租申请读取', 'biz.leasing_checkout', 'read'),
    ('leasing_checkout:create', '新增退租申请', 'biz.leasing_checkout', 'create'),
    ('leasing_checkout:update', '编辑退租申请', 'biz.leasing_checkout', 'update'),
    ('leasing_checkout:delete', '删除退租申请', 'biz.leasing_checkout', 'delete'),
    ('leasing_checkout:submit', '提交退租审批', 'biz.leasing_checkout', 'submit'),
    ('leasing_checkout:approve', '退租审批通过', 'biz.leasing_checkout', 'approve'),
    ('leasing_checkout:reject', '退租审批驳回', 'biz.leasing_checkout', 'reject'),
    ('leasing_checkout:preview_settlement', '退租结算预览', 'biz.leasing_checkout', 'preview_settlement'),
    ('leasing_checkout:confirm_settlement', '退租结算确认', 'biz.leasing_checkout', 'confirm_settlement'),
    ('leasing_checkout:effective', '退租生效', 'biz.leasing_checkout', 'effective'),
    ('leasing_refund:read', '退租退款读取', 'biz.leasing_refund', 'read'),
    ('leasing_refund:create', '新增退租退款', 'biz.leasing_refund', 'create'),
    ('leasing_receivable:read', '应收账单读取', 'biz.leasing_receivable', 'read'),
    ('leasing_receivable:create', '新增应收账单', 'biz.leasing_receivable', 'create'),
    ('leasing_receivable:update', '编辑应收账单', 'biz.leasing_receivable', 'update'),
    ('leasing_receivable:delete', '删除应收账单', 'biz.leasing_receivable', 'delete'),
    ('leasing_receivable:generate', '合同生成应收', 'biz.leasing_receivable', 'generate'),
    ('leasing_receivable:generate_batch', '批量生成应收', 'biz.leasing_receivable', 'generate_batch'),
    ('leasing_receivable:overdue', '应收逾期管理', 'biz.leasing_receivable', 'overdue'),
    ('leasing_receivable:aging', '应收账龄分析', 'biz.leasing_receivable', 'aging'),
    ('leasing_receivable:status_log', '应收状态日志', 'biz.leasing_receivable_status_log', 'status_log'),
    ('leasing_payment:read', '收款登记读取', 'biz.leasing_payment', 'read'),
    ('leasing_payment:create', '新增收款登记', 'biz.leasing_payment', 'create'),
    ('leasing_payment:update', '编辑收款登记', 'biz.leasing_payment', 'update'),
    ('leasing_payment:delete', '删除收款登记', 'biz.leasing_payment', 'delete'),
    ('leasing_payment:apply', '收款核销', 'rel.leasing_payment_receivable', 'apply'),
    ('leasing_waiver:read', '豁免申请读取', 'biz.leasing_waiver', 'read'),
    ('leasing_waiver:create', '新增豁免申请', 'biz.leasing_waiver', 'create'),
    ('leasing_waiver:approve', '豁免审批通过', 'biz.leasing_waiver', 'approve'),
    ('leasing_waiver:reject', '豁免审批驳回', 'biz.leasing_waiver', 'reject'),
    ('leasing_invoice:read', '发票登记读取', 'biz.leasing_invoice', 'read'),
    ('leasing_invoice:create', '新增发票登记', 'biz.leasing_invoice', 'create'),
    ('leasing_invoice:update', '编辑发票登记', 'biz.leasing_invoice', 'update'),
    ('leasing_invoice:delete', '删除发票登记', 'biz.leasing_invoice', 'delete'),
    ('leasing_statistics:funnel', '招商漏斗统计', 'biz.leasing_statistics', 'funnel'),
    ('invest:read', '招商租赁读取', 'leasing', 'read'),
    ('ar:read', '应收读取', 'leasing.receivable', 'read'),
    ('wo:read', '工单读取', 'workorder', 'read'),
    ('workorder:read', '工单读取', 'biz.work_order', 'read'),
    ('workorder:create', '新增工单', 'biz.work_order', 'create'),
    ('workorder:update', '编辑工单', 'biz.work_order', 'update'),
    ('workorder:delete', '删除工单', 'biz.work_order', 'delete'),
    ('workorder:assign', '工单派单', 'biz.work_order', 'assign'),
    ('workorder:reassign', '工单改派', 'biz.work_order', 'reassign'),
    ('workorder:accept', '工单接单', 'biz.work_order', 'accept'),
    ('workorder:start', '开始处理工单', 'biz.work_order', 'start'),
    ('workorder:wait_material', '工单待物料', 'biz.work_order', 'wait_material'),
    ('workorder:finish', '完成处理工单', 'biz.work_order', 'finish'),
    ('workorder:confirm', '工单确认完成', 'biz.work_order', 'confirm'),
    ('workorder:evaluate', '工单评价', 'biz.work_order', 'evaluate'),
    ('workorder:close', '工单关闭', 'biz.work_order', 'close'),
    ('workorder:cancel', '工单取消', 'biz.work_order', 'cancel'),
    ('workorder:return', '工单退回', 'biz.work_order', 'return'),
    ('workorder:reject', '工单驳回', 'biz.work_order', 'reject'),
    ('workorder_sla:read', '工单 SLA 规则读取', 'biz.work_order_sla_rule', 'read'),
    ('workorder_sla:create', '新增工单 SLA 规则', 'biz.work_order_sla_rule', 'create'),
    ('workorder_sla:update', '编辑工单 SLA 规则', 'biz.work_order_sla_rule', 'update'),
    ('workorder_sla:delete', '删除工单 SLA 规则', 'biz.work_order_sla_rule', 'delete'),
    ('workorder:recalculate_overdue', '重算工单超时', 'biz.work_order', 'recalculate_overdue'),
    ('workorder:overdue', '超时工单读取', 'biz.work_order', 'overdue'),
    ('workorder:stats', '工单统计', 'biz.work_order', 'stats'),
    ('workorder_log:read', '工单日志读取', 'biz.work_order_log', 'read'),
    ('workorder_log:create', '新增工单日志', 'biz.work_order_log', 'create'),
    ('workorder:manage_all', '管理全部工单', 'biz.work_order', 'manage_all'),
    ('iot:read', 'IoT 平台读取', 'iot', 'read'),
    ('energy:read', '能耗读取', 'energy', 'read'),
    ('robot:read', '机器人运营读取', 'robot', 'read'),
    ('video:read', '视频安防读取', 'video', 'read'),
    ('bim:read', '数字孪生读取', 'bim', 'read'),
    ('ai:read', 'AI 助手读取', 'ai', 'read'),
    ('cockpit:read', '经营驾驶舱读取', 'cockpit', 'read')
),
permission_groups(code, name, parent_code, resource, action, permission_type, perm_type, sort_no) AS (
  VALUES
    ('system', '系统管理', NULL, 'system', 'menu', 'menu', 10, 10),
    ('system:org', '组织管理', 'system', 'system.org', 'page', 'page', 20, 10),
    ('system:user', '用户管理', 'system', 'system.user', 'page', 'page', 20, 20),
    ('system:role', '角色管理', 'system', 'system.role', 'page', 'page', 20, 30),
    ('system:permission', '权限管理', 'system', 'system.permission', 'page', 'page', 20, 40),
    ('system:data-scope', '数据权限', 'system', 'system.data-scope', 'page', 'page', 20, 50),
    ('system:field-policy', '字段权限', 'system', 'system.field-policy', 'page', 'page', 20, 60),
    ('system:code-rule', '编码规则', 'system', 'system.code-rule', 'page', 'page', 20, 70),
    ('system:tenant', '租户管理', 'system', 'system.tenant', 'page', 'page', 20, 75),
    ('system:module', '模块授权', 'system', 'system.module', 'page', 'page', 20, 80),
    ('system:dict-type', '字典管理', 'system', 'system.dict-type', 'page', 'page', 20, 90),
    ('system:dict-item', '字典项', 'system:dict-type', 'system.dict-item', 'page', 'page', 20, 100),
    ('system:file', '附件中心', 'system', 'system.file', 'page', 'page', 20, 110),
    ('system:audit', '审计日志', 'system', 'system.audit', 'page', 'page', 20, 120),
    ('asset', '资产管理', NULL, 'asset', 'menu', 'menu', 10, 20),
    ('asset:park', '园区管理', 'asset', 'asset.park', 'page', 'page', 20, 10),
    ('asset:building', '楼栋管理', 'asset', 'asset.building', 'page', 'page', 20, 20),
    ('asset:floor', '楼层管理', 'asset', 'asset.floor', 'page', 'page', 20, 30),
    ('asset:unit', '房间/房源管理', 'asset', 'asset.unit', 'page', 'page', 20, 40),
    ('asset:unit-status-board', '房源状态看板', 'asset', 'asset.status-board', 'page', 'page', 20, 50),
    ('asset:statistics-page', '资产统计', 'asset', 'asset.statistics', 'page', 'page', 20, 60),
    ('leasing', '招商租赁', NULL, 'leasing', 'menu', 'menu', 10, 30),
    ('leasing:tenant', '租户企业档案', 'leasing', 'leasing.tenant', 'page', 'page', 20, 10),
    ('leasing:lead', '招商线索', 'leasing', 'leasing.lead', 'page', 'page', 20, 20),
    ('leasing:lead-pool', '公海池', 'leasing', 'leasing.lead_pool', 'page', 'page', 20, 25),
    ('leasing:invest', '招商漏斗', 'leasing', 'leasing.funnel', 'page', 'page', 20, 26),
    ('leasing:contract', '合同管理', 'leasing', 'leasing.contract', 'page', 'page', 20, 30),
    ('leasing:contract-change', '合同变更', 'leasing', 'leasing.contract_change', 'page', 'page', 20, 35),
    ('leasing:checkout', '退租结算', 'leasing', 'leasing.checkout', 'page', 'page', 20, 38),
    ('leasing:refund', '退款登记', 'leasing', 'leasing.refund', 'page', 'page', 20, 39),
    ('leasing:receivable', '应收账单', 'leasing', 'leasing.receivable', 'page', 'page', 20, 40),
    ('leasing:payment', '收款登记', 'leasing', 'leasing.payment', 'page', 'page', 20, 42),
    ('leasing:aging', '欠费账龄', 'leasing', 'leasing.aging', 'page', 'page', 20, 45),
    ('leasing:waiver', '豁免管理', 'leasing', 'leasing.waiver', 'page', 'page', 20, 50),
    ('leasing:invoice', '发票登记', 'leasing', 'leasing.invoice', 'page', 'page', 20, 55),
    ('workorder', '工单管理', NULL, 'workorder', 'menu', 'menu', 10, 40),
    ('workorder:center', '工单看板', 'workorder', 'workorder.center', 'page', 'page', 20, 10),
    ('workorder:list-page', '工单列表', 'workorder', 'workorder.list', 'page', 'page', 20, 15),
    ('workorder:sla-rules', 'SLA 规则', 'workorder', 'workorder.sla_rules', 'page', 'page', 20, 20),
    ('workorder:overdue-page', '超时工单', 'workorder', 'workorder.overdue', 'page', 'page', 20, 30),
    ('workorder:stats-page', '工单统计', 'workorder', 'workorder.stats', 'page', 'page', 20, 40),
    ('iot', 'IoT 平台', NULL, 'iot', 'menu', 'menu', 10, 50),
    ('iot:dashboard', 'IoT 看板', 'iot', 'iot.dashboard', 'page', 'page', 20, 10),
    ('iot:devices', '设备管理', 'iot', 'iot.device', 'page', 'page', 20, 20),
    ('iot:gateways', '网关管理', 'iot', 'iot.gateway', 'page', 'page', 20, 30),
    ('iot:metrics', '指标管理', 'iot', 'iot.metric', 'page', 'page', 20, 40),
    ('iot:alert-rules', '告警规则', 'iot', 'iot.alert_rule', 'page', 'page', 20, 50),
    ('iot:alerts', '设备告警', 'iot', 'iot.alert', 'page', 'page', 20, 60),
    ('energy', '能耗管理', NULL, 'energy', 'menu', 'menu', 10, 60),
    ('energy:overview', '能耗总览', 'energy', 'energy.overview', 'page', 'page', 20, 10),
    ('robot', '机器人运营', NULL, 'robot', 'menu', 'menu', 10, 70),
    ('robot:overview', '机器人总览', 'robot', 'robot.overview', 'page', 'page', 20, 10),
    ('video', '视频安防', NULL, 'video', 'menu', 'menu', 10, 80),
    ('video:overview', '视频总览', 'video', 'video.overview', 'page', 'page', 20, 10),
    ('bim', '数字孪生', NULL, 'bim', 'menu', 'menu', 10, 90),
    ('bim:overview', 'BIM 总览', 'bim', 'bim.overview', 'page', 'page', 20, 10),
    ('ai', 'AI 助手', NULL, 'ai', 'menu', 'menu', 10, 100),
    ('ai:assistant', 'AI 助手', 'ai', 'ai.assistant', 'page', 'page', 20, 10),
    ('cockpit', '经营驾驶舱', NULL, 'cockpit', 'menu', 'menu', 10, 110)
),
permission_nodes(code, name, parent_code, resource, action, permission_type, perm_type, sort_no) AS (
  SELECT code, name, parent_code, resource, action, permission_type, perm_type, sort_no
  FROM permission_groups
  UNION ALL
  SELECT
    leaf_permissions.code,
    leaf_permissions.name,
    CASE
      WHEN leaf_permissions.code LIKE 'system:org:%' THEN 'system:org'
      WHEN leaf_permissions.code LIKE 'system:user:%' THEN 'system:user'
      WHEN leaf_permissions.code LIKE 'system:role:%' THEN 'system:role'
      WHEN leaf_permissions.code LIKE 'role:%' THEN 'system:role'
      WHEN leaf_permissions.code LIKE 'tenant:%' THEN 'system:tenant'
      WHEN leaf_permissions.code LIKE 'system:permission:%' THEN 'system:permission'
      WHEN leaf_permissions.code LIKE 'permission:%' THEN 'system:permission'
      WHEN leaf_permissions.code LIKE 'system:data-scope:%' THEN 'system:data-scope'
      WHEN leaf_permissions.code LIKE 'data_scope:%' THEN 'system:data-scope'
      WHEN leaf_permissions.code LIKE 'system:field-policy:%' THEN 'system:field-policy'
      WHEN leaf_permissions.code LIKE 'field_policy:%' THEN 'system:field-policy'
      WHEN leaf_permissions.code LIKE 'system:code-rule:%' THEN 'system:code-rule'
      WHEN leaf_permissions.code LIKE 'code_rule:%' THEN 'system:code-rule'
      WHEN leaf_permissions.code LIKE 'system:module:%' THEN 'system:module'
      WHEN leaf_permissions.code LIKE 'system:plan:%' THEN 'system:module'
      WHEN leaf_permissions.code LIKE 'system:tenant-module:%' THEN 'system:module'
      WHEN leaf_permissions.code LIKE 'module:%' THEN 'system:module'
      WHEN leaf_permissions.code LIKE 'plan:%' THEN 'system:module'
      WHEN leaf_permissions.code LIKE 'tenant_module:%' THEN 'system:module'
      WHEN leaf_permissions.code LIKE 'system:dict-type:%' THEN 'system:dict-type'
      WHEN leaf_permissions.code LIKE 'system:dict-item:%' THEN 'system:dict-item'
      WHEN leaf_permissions.code LIKE 'system:attachment:%' THEN 'system:file'
      WHEN leaf_permissions.code LIKE 'system:audit:%' THEN 'system:audit'
      WHEN leaf_permissions.code LIKE 'file:%' THEN 'system:file'
      WHEN leaf_permissions.code LIKE 'audit:%' THEN 'system:audit'
      WHEN leaf_permissions.code LIKE 'park:%' THEN 'asset:park'
      WHEN leaf_permissions.code LIKE 'asset:park:%' THEN 'asset:park'
      WHEN leaf_permissions.code LIKE 'building:%' THEN 'asset:building'
      WHEN leaf_permissions.code LIKE 'asset:building:%' THEN 'asset:building'
      WHEN leaf_permissions.code LIKE 'floor:%' THEN 'asset:floor'
      WHEN leaf_permissions.code LIKE 'asset:floor:%' THEN 'asset:floor'
      WHEN leaf_permissions.code LIKE 'unit:%' THEN 'asset:unit'
      WHEN leaf_permissions.code LIKE 'asset:unit:%' THEN 'asset:unit'
      WHEN leaf_permissions.code = 'asset:status_board' THEN 'asset:unit-status-board'
      WHEN leaf_permissions.code IN ('asset:statistics', 'asset:statistics:read') THEN 'asset:statistics-page'
      WHEN leaf_permissions.code = 'asset:read' THEN 'asset'
      WHEN leaf_permissions.code LIKE 'park_tenant:%' OR leaf_permissions.code LIKE 'park_tenant_contact:%' OR leaf_permissions.code LIKE 'park_tenant_qualification:%' THEN 'leasing:tenant'
      WHEN leaf_permissions.code LIKE 'leasing_lead_pool:%' THEN 'leasing:lead-pool'
      WHEN leaf_permissions.code LIKE 'leasing_statistics:%' THEN 'leasing:invest'
      WHEN leaf_permissions.code LIKE 'leasing_lead:%' OR leaf_permissions.code LIKE 'leasing_follow:%' OR leaf_permissions.code LIKE 'leasing_visit:%' OR leaf_permissions.code LIKE 'leasing_quote:%' THEN 'leasing:lead'
      WHEN leaf_permissions.code = 'invest:read' THEN 'leasing:invest'
      WHEN leaf_permissions.code LIKE 'leasing_contract_change:%' THEN 'leasing:contract-change'
      WHEN leaf_permissions.code LIKE 'leasing_checkout:%' THEN 'leasing:checkout'
      WHEN leaf_permissions.code LIKE 'leasing_refund:%' THEN 'leasing:refund'
      WHEN leaf_permissions.code LIKE 'leasing_contract:%' OR leaf_permissions.code LIKE 'leasing_contract_unit:%' THEN 'leasing:contract'
      WHEN leaf_permissions.code IN ('leasing_receivable:overdue', 'leasing_receivable:aging') THEN 'leasing:aging'
      WHEN leaf_permissions.code LIKE 'leasing_receivable:%' OR leaf_permissions.code = 'ar:read' THEN 'leasing:receivable'
      WHEN leaf_permissions.code LIKE 'leasing_payment:%' THEN 'leasing:payment'
      WHEN leaf_permissions.code LIKE 'leasing_waiver:%' THEN 'leasing:waiver'
      WHEN leaf_permissions.code LIKE 'leasing_invoice:%' THEN 'leasing:invoice'
      WHEN leaf_permissions.code LIKE 'workorder_sla:%' THEN 'workorder:sla-rules'
      WHEN leaf_permissions.code IN ('workorder:recalculate_overdue', 'workorder:overdue') THEN 'workorder:overdue-page'
      WHEN leaf_permissions.code = 'workorder:stats' THEN 'workorder:stats-page'
      WHEN leaf_permissions.code = 'wo:read' OR leaf_permissions.code LIKE 'workorder:%' OR leaf_permissions.code LIKE 'workorder_log:%' THEN 'workorder:center'
      WHEN leaf_permissions.code = 'iot:read' THEN 'iot:dashboard'
      WHEN leaf_permissions.code = 'energy:read' THEN 'energy:overview'
      WHEN leaf_permissions.code = 'robot:read' THEN 'robot:overview'
      WHEN leaf_permissions.code = 'video:read' THEN 'video:overview'
      WHEN leaf_permissions.code = 'bim:read' THEN 'bim:overview'
      WHEN leaf_permissions.code = 'ai:read' THEN 'ai:assistant'
      WHEN leaf_permissions.code = 'cockpit:read' THEN 'cockpit'
      ELSE NULL
    END,
    leaf_permissions.resource,
    leaf_permissions.action,
    'api',
    40,
    100
  FROM leaf_permissions
),
permission_tree(code, name, parent_code, resource, action, permission_type, perm_type, sort_no, perm_path, level) AS (
  SELECT
    permission_nodes.code,
    permission_nodes.name,
    permission_nodes.parent_code,
    permission_nodes.resource,
    permission_nodes.action,
    permission_nodes.permission_type,
    permission_nodes.perm_type,
    permission_nodes.sort_no,
    permission_nodes.code::varchar(500),
    1
  FROM permission_nodes
  WHERE permission_nodes.parent_code IS NULL
  UNION ALL
  SELECT
    child.code,
    child.name,
    child.parent_code,
    child.resource,
    child.action,
    child.permission_type,
    child.perm_type,
    child.sort_no,
    (parent.perm_path || '/' || child.code)::varchar(500),
    parent.level + 1
  FROM permission_nodes child
  JOIN permission_tree parent ON parent.code = child.parent_code
),
upsert_permissions AS (
  INSERT INTO sys_permission (
    tenant_id,
    park_id,
    code,
    name,
    parent_id,
    resource,
    action,
    permission_path,
    perm_path,
    permission_level,
    level,
    sort_no,
    permission_type,
    perm_type,
    api_method,
    api_path,
    frontend_route,
    component_key,
    icon,
    keep_alive,
    always_show,
    field_key,
    data_dimension,
    is_system,
    is_builtin,
    is_tenant_custom,
    visible,
    is_enabled,
    status,
    remark
  )
  SELECT
    seed_scope.tenant_id,
    seed_scope.park_id,
    permission_tree.code,
    permission_tree.name,
    NULL,
    permission_tree.resource,
    permission_tree.action,
    permission_tree.perm_path,
    permission_tree.perm_path,
    permission_tree.level,
    permission_tree.level,
    permission_tree.sort_no,
    permission_tree.permission_type,
    permission_tree.perm_type,
    NULL,
    NULL,
    CASE permission_tree.code
      WHEN 'system' THEN NULL
      WHEN 'system:org' THEN '/system/orgs'
      WHEN 'system:user' THEN '/system/users'
      WHEN 'system:role' THEN '/system/roles'
      WHEN 'system:permission' THEN '/system/permissions'
      WHEN 'system:data-scope' THEN '/system/data-scopes'
      WHEN 'system:field-policy' THEN '/system/field-policies'
      WHEN 'system:code-rule' THEN '/system/code-rules'
      WHEN 'system:tenant' THEN '/system/tenants'
      WHEN 'system:module' THEN '/system/modules'
      WHEN 'system:dict-type' THEN '/system/dicts'
      WHEN 'system:dict-item' THEN '/system/dicts'
      WHEN 'system:file' THEN '/system/files'
      WHEN 'system:audit' THEN '/system/audit/op-logs'
      WHEN 'asset' THEN NULL
      WHEN 'asset:park' THEN '/assets/parks'
      WHEN 'asset:building' THEN '/assets/buildings'
      WHEN 'asset:floor' THEN '/assets/floors'
      WHEN 'asset:unit' THEN '/assets/units'
      WHEN 'asset:unit-status-board' THEN '/assets/unit-status-board'
      WHEN 'asset:statistics-page' THEN '/assets/statistics'
      WHEN 'leasing:tenant' THEN '/leasing/tenants'
      WHEN 'leasing:lead' THEN '/leasing/leads'
      WHEN 'leasing:lead-pool' THEN '/leasing/lead-pool'
      WHEN 'leasing:invest' THEN '/leasing/funnel'
      WHEN 'leasing:contract' THEN '/leasing/contracts'
      WHEN 'leasing:contract-change' THEN '/leasing/contract-changes'
      WHEN 'leasing:checkout' THEN '/leasing/checkouts'
      WHEN 'leasing:refund' THEN '/leasing/refunds'
      WHEN 'leasing:receivable' THEN '/leasing/receivables'
      WHEN 'leasing:payment' THEN '/leasing/payments'
      WHEN 'leasing:aging' THEN '/leasing/aging'
      WHEN 'leasing:waiver' THEN '/leasing/waivers'
      WHEN 'leasing:invoice' THEN '/leasing/invoices'
      WHEN 'workorder:center' THEN '/workorders'
      WHEN 'workorder:list-page' THEN '/workorders/list'
      WHEN 'workorder:sla-rules' THEN '/workorders/sla-rules'
      WHEN 'workorder:overdue-page' THEN '/workorders/overdue'
      WHEN 'workorder:stats-page' THEN '/workorders/stats'
      WHEN 'iot:dashboard' THEN '/iot/dashboard'
      WHEN 'iot:devices' THEN '/iot/devices'
      WHEN 'iot:gateways' THEN '/iot/gateways'
      WHEN 'iot:metrics' THEN '/iot/metrics'
      WHEN 'iot:alert-rules' THEN '/iot/alert-rules'
      WHEN 'iot:alerts' THEN '/iot/alerts'
      WHEN 'energy:overview' THEN '/energy/overview'
      WHEN 'robot:overview' THEN '/robots/overview'
      WHEN 'video:overview' THEN '/video/overview'
      WHEN 'bim:overview' THEN '/bim/overview'
      WHEN 'ai:assistant' THEN '/ai/assistant'
      ELSE NULL
    END,
    CASE permission_tree.code
      WHEN 'system' THEN 'Layout'
      WHEN 'system:org' THEN 'system/orgs'
      WHEN 'system:user' THEN 'system/users'
      WHEN 'system:role' THEN 'system/roles'
      WHEN 'system:permission' THEN 'system/permissions'
      WHEN 'system:data-scope' THEN 'system/data-scopes'
      WHEN 'system:field-policy' THEN 'system/field-policies'
      WHEN 'system:code-rule' THEN 'system/code-rules'
      WHEN 'system:tenant' THEN 'system/tenants'
      WHEN 'system:module' THEN 'system/modules'
      WHEN 'system:dict-type' THEN 'system/dicts'
      WHEN 'system:dict-item' THEN 'system/dict-items'
      WHEN 'system:file' THEN 'system/files'
      WHEN 'system:audit' THEN 'system/audit-op-logs'
      ELSE NULL
    END,
    CASE permission_tree.code
      WHEN 'system' THEN 'shield-check'
      WHEN 'system:org' THEN 'building-2'
      WHEN 'system:user' THEN 'users'
      WHEN 'system:role' THEN 'shield'
      WHEN 'system:permission' THEN 'key-round'
      WHEN 'system:data-scope' THEN 'database'
      WHEN 'system:field-policy' THEN 'key-round'
      WHEN 'system:code-rule' THEN 'settings'
      WHEN 'system:tenant' THEN 'building-2'
      WHEN 'system:module' THEN 'folder-tree'
      WHEN 'system:dict-type' THEN 'tags'
      WHEN 'system:dict-item' THEN 'tags'
      WHEN 'system:file' THEN 'file-text'
      WHEN 'system:audit' THEN 'scroll-text'
      WHEN 'asset' THEN 'building-2'
      WHEN 'leasing' THEN 'file-text'
      WHEN 'workorder' THEN 'wrench'
      WHEN 'iot' THEN 'cpu'
      WHEN 'energy' THEN 'zap'
      WHEN 'robot' THEN 'bot'
      WHEN 'video' THEN 'video'
      WHEN 'bim' THEN 'layout-dashboard'
      WHEN 'ai' THEN 'brain-circuit'
      WHEN 'cockpit' THEN 'layout-dashboard'
      ELSE NULL
    END,
    true,
    permission_tree.code <> 'system:dict-item',
    NULL,
    NULL,
    true,
    true,
    false,
    true,
    true,
    'enabled',
    'System built-in permission seed'
  FROM permission_tree
  CROSS JOIN seed_scope
  ON CONFLICT (tenant_id, code) WHERE is_deleted = false DO UPDATE SET
    name = EXCLUDED.name,
    resource = EXCLUDED.resource,
    action = EXCLUDED.action,
    permission_path = EXCLUDED.permission_path,
    perm_path = EXCLUDED.perm_path,
    permission_level = EXCLUDED.permission_level,
    level = EXCLUDED.level,
    sort_no = EXCLUDED.sort_no,
    permission_type = EXCLUDED.permission_type,
    perm_type = EXCLUDED.perm_type,
    api_method = EXCLUDED.api_method,
    api_path = EXCLUDED.api_path,
    frontend_route = EXCLUDED.frontend_route,
    component_key = EXCLUDED.component_key,
    icon = EXCLUDED.icon,
    keep_alive = EXCLUDED.keep_alive,
    always_show = EXCLUDED.always_show,
    field_key = EXCLUDED.field_key,
    data_dimension = EXCLUDED.data_dimension,
    is_system = true,
    is_builtin = true,
    is_tenant_custom = false,
    visible = true,
    is_enabled = true,
    status = 'enabled',
    remark = EXCLUDED.remark,
    is_deleted = false,
    update_time = now()
  RETURNING id, tenant_id, park_id, code
)
UPDATE sys_permission child
SET parent_id = parent_permission.id,
    permission_path = permission_tree.perm_path,
    perm_path = permission_tree.perm_path,
    permission_level = permission_tree.level,
    level = permission_tree.level,
    update_time = now()
FROM permission_tree
JOIN upsert_permissions current_permission
  ON current_permission.code = permission_tree.code
LEFT JOIN upsert_permissions parent_permission
  ON parent_permission.code = permission_tree.parent_code
WHERE child.id = current_permission.id;

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
permission_parent_map AS (
  SELECT
    child.id AS child_id,
    parent.id AS parent_id
  FROM sys_permission child
  JOIN seed_scope
    ON seed_scope.tenant_id = child.tenant_id
   AND seed_scope.park_id = child.park_id
  LEFT JOIN sys_permission parent
    ON parent.tenant_id = child.tenant_id
   AND parent.park_id = child.park_id
   AND parent.is_deleted = false
   AND parent.code = CASE
      WHEN child.code IN ('system', 'asset', 'leasing', 'workorder', 'iot', 'energy', 'robot', 'video', 'bim', 'ai', 'cockpit') THEN NULL
      WHEN child.code IN ('system:org', 'system:user', 'system:role', 'system:permission', 'system:data-scope', 'system:field-policy', 'system:code-rule', 'system:tenant', 'system:module', 'system:dict-type', 'system:file', 'system:audit', 'system:audit-login-log') THEN 'system'
      WHEN child.code = 'system:dict-item' THEN 'system:dict-type'
      WHEN child.code IN ('asset:park', 'asset:building', 'asset:floor', 'asset:unit', 'asset:unit-status-board', 'asset:statistics-page') THEN 'asset'
      WHEN child.code IN ('leasing:tenant', 'leasing:lead', 'leasing:lead-pool', 'leasing:invest', 'leasing:contract', 'leasing:contract-change', 'leasing:checkout', 'leasing:refund', 'leasing:receivable', 'leasing:payment', 'leasing:aging', 'leasing:waiver', 'leasing:invoice') THEN 'leasing'
      WHEN child.code IN ('workorder:center', 'workorder:list-page', 'workorder:sla-rules', 'workorder:overdue-page', 'workorder:stats-page') THEN 'workorder'
      WHEN child.code IN ('iot:dashboard', 'iot:devices', 'iot:gateways', 'iot:metrics', 'iot:alert-rules', 'iot:alerts') THEN 'iot'
      WHEN child.code = 'energy:overview' THEN 'energy'
      WHEN child.code = 'robot:overview' THEN 'robot'
      WHEN child.code = 'video:overview' THEN 'video'
      WHEN child.code = 'bim:overview' THEN 'bim'
      WHEN child.code = 'ai:assistant' THEN 'ai'
      WHEN child.code LIKE 'system:org:%' THEN 'system:org'
      WHEN child.code LIKE 'system:user:%' THEN 'system:user'
      WHEN child.code LIKE 'system:role:%' THEN 'system:role'
      WHEN child.code LIKE 'role:%' THEN 'system:role'
      WHEN child.code LIKE 'tenant:%' THEN 'system:tenant'
      WHEN child.code LIKE 'system:permission:%' THEN 'system:permission'
      WHEN child.code LIKE 'permission:%' THEN 'system:permission'
      WHEN child.code LIKE 'system:data-scope:%' THEN 'system:data-scope'
      WHEN child.code LIKE 'data_scope:%' THEN 'system:data-scope'
      WHEN child.code LIKE 'system:field-policy:%' THEN 'system:field-policy'
      WHEN child.code LIKE 'field_policy:%' THEN 'system:field-policy'
      WHEN child.code LIKE 'system:code-rule:%' THEN 'system:code-rule'
      WHEN child.code LIKE 'code_rule:%' THEN 'system:code-rule'
      WHEN child.code LIKE 'system:module:%' THEN 'system:module'
      WHEN child.code LIKE 'system:plan:%' THEN 'system:module'
      WHEN child.code LIKE 'system:tenant-module:%' THEN 'system:module'
      WHEN child.code LIKE 'module:%' THEN 'system:module'
      WHEN child.code LIKE 'plan:%' THEN 'system:module'
      WHEN child.code LIKE 'tenant_module:%' THEN 'system:module'
      WHEN child.code LIKE 'system:dict-type:%' THEN 'system:dict-type'
      WHEN child.code LIKE 'system:dict-item:%' THEN 'system:dict-item'
      WHEN child.code LIKE 'system:attachment:%' THEN 'system:file'
      WHEN child.code LIKE 'system:audit:%' THEN 'system:audit'
      WHEN child.code LIKE 'file:%' THEN 'system:file'
      WHEN child.code LIKE 'audit:%' THEN 'system:audit'
      WHEN child.code LIKE 'park:%' THEN 'asset:park'
      WHEN child.code LIKE 'asset:park:%' THEN 'asset:park'
      WHEN child.code LIKE 'building:%' THEN 'asset:building'
      WHEN child.code LIKE 'asset:building:%' THEN 'asset:building'
      WHEN child.code LIKE 'floor:%' THEN 'asset:floor'
      WHEN child.code LIKE 'asset:floor:%' THEN 'asset:floor'
      WHEN child.code LIKE 'unit:%' THEN 'asset:unit'
      WHEN child.code LIKE 'asset:unit:%' THEN 'asset:unit'
      WHEN child.code = 'asset:status_board' THEN 'asset:unit-status-board'
      WHEN child.code IN ('asset:statistics', 'asset:statistics:read') THEN 'asset:statistics-page'
      WHEN child.code = 'asset:read' THEN 'asset'
      WHEN child.code LIKE 'park_tenant:%' OR child.code LIKE 'park_tenant_contact:%' OR child.code LIKE 'park_tenant_qualification:%' THEN 'leasing:tenant'
      WHEN child.code LIKE 'leasing_lead_pool:%' THEN 'leasing:lead-pool'
      WHEN child.code LIKE 'leasing_statistics:%' THEN 'leasing:invest'
      WHEN child.code LIKE 'leasing_lead:%' OR child.code LIKE 'leasing_follow:%' OR child.code LIKE 'leasing_visit:%' OR child.code LIKE 'leasing_quote:%' THEN 'leasing:lead'
      WHEN child.code = 'invest:read' THEN 'leasing:invest'
      WHEN child.code LIKE 'leasing_contract_change:%' THEN 'leasing:contract-change'
      WHEN child.code LIKE 'leasing_checkout:%' THEN 'leasing:checkout'
      WHEN child.code LIKE 'leasing_refund:%' THEN 'leasing:refund'
      WHEN child.code LIKE 'leasing_contract:%' OR child.code LIKE 'leasing_contract_unit:%' THEN 'leasing:contract'
      WHEN child.code IN ('leasing_receivable:overdue', 'leasing_receivable:aging') THEN 'leasing:aging'
      WHEN child.code LIKE 'leasing_receivable:%' OR child.code = 'ar:read' THEN 'leasing:receivable'
      WHEN child.code LIKE 'leasing_payment:%' THEN 'leasing:payment'
      WHEN child.code LIKE 'leasing_waiver:%' THEN 'leasing:waiver'
      WHEN child.code LIKE 'leasing_invoice:%' THEN 'leasing:invoice'
      WHEN child.code LIKE 'workorder_sla:%' THEN 'workorder:sla-rules'
      WHEN child.code IN ('workorder:recalculate_overdue', 'workorder:overdue') THEN 'workorder:overdue-page'
      WHEN child.code = 'workorder:stats' THEN 'workorder:stats-page'
      WHEN child.code = 'wo:read' OR child.code LIKE 'workorder:%' OR child.code LIKE 'workorder_log:%' THEN 'workorder:center'
      WHEN child.code = 'iot:read' THEN 'iot:dashboard'
      WHEN child.code LIKE 'iot_gateway:%' OR child.code LIKE 'iot_mqtt:%' THEN 'iot:gateways'
      WHEN child.code LIKE 'iot_device:%' OR child.code LIKE 'iot_point:%' OR child.code LIKE 'iot_data:%' THEN 'iot:devices'
      WHEN child.code LIKE 'iot_metric:%' THEN 'iot:metrics'
      WHEN child.code LIKE 'iot_alert_rule:%' THEN 'iot:alert-rules'
      WHEN child.code LIKE 'iot_alert:%' OR child.code LIKE 'iot_alert_log:%' THEN 'iot:alerts'
      WHEN child.code = 'energy:read' THEN 'energy:overview'
      WHEN child.code = 'robot:read' THEN 'robot:overview'
      WHEN child.code = 'video:read' THEN 'video:overview'
      WHEN child.code = 'bim:read' THEN 'bim:overview'
      WHEN child.code = 'ai:read' THEN 'ai:assistant'
      WHEN child.code = 'cockpit:read' THEN 'cockpit'
      ELSE NULL
    END
  WHERE child.is_deleted = false
)
UPDATE sys_permission permission
SET parent_id = permission_parent_map.parent_id,
    update_time = now()
FROM permission_parent_map
WHERE permission.id = permission_parent_map.child_id;

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
data_scope_rules(rule_code, rule_name, dimension, scope_type, scope_config, remark) AS (
  VALUES
    ('all_parks', '全部园区', 'park', 'all', '{}'::jsonb, 'Production-safe data scope rule for all parks'),
    ('current_park', '当前园区', 'park', 'park', '{}'::jsonb, 'Production-safe data scope rule for current park'),
    ('self_only', '仅本人', 'customer_owner', 'self', '{}'::jsonb, 'Production-safe data scope rule for self-owned data'),
    ('self_contract_owner', '仅本人合同', 'contract_owner', 'self', '{}'::jsonb, 'Production-safe data scope rule for self-owned contracts'),
    ('org_and_children', '本部门及下级', 'org', 'org_and_children', '{}'::jsonb, 'Production-safe data scope rule for organization tree')
)
INSERT INTO sys_data_scope_rule (
  tenant_id,
  park_id,
  rule_code,
  rule_name,
  dimension,
  scope_type,
  scope_config,
  status,
  remark
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  data_scope_rules.rule_code,
  data_scope_rules.rule_name,
  data_scope_rules.dimension,
  data_scope_rules.scope_type,
  data_scope_rules.scope_config,
  'enabled',
  data_scope_rules.remark
FROM data_scope_rules
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, rule_code) WHERE is_deleted = false DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  dimension = EXCLUDED.dimension,
  scope_type = EXCLUDED.scope_type,
  scope_config = EXCLUDED.scope_config,
  status = 'enabled',
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

UPDATE sys_field_policy
SET is_deleted = true,
    status = 'disabled',
    update_time = now()
WHERE tenant_id = '10000001'
  AND module = 'leasing'
  AND is_deleted = false
  AND (
    (entity = 'park_tenant' AND field_key IN ('contactMobile', 'legalPersonId'))
    OR (entity = 'park_tenant_qualification' AND field_key IN ('certificateNo', 'fileId'))
    OR (entity = 'leasing_lead' AND field_key IN ('contactMobile', 'demandPrice'))
    OR (entity = 'leasing_quote' AND field_key IN ('quotePrice', 'propertyFeePrice'))
    OR (entity = 'leasing_follow' AND field_key IN ('content'))
    OR (entity = 'leasing_checkout' AND field_key IN ('unpaidAmount', 'lateFeeAmount', 'depositAmount', 'deductionAmount', 'additionalChargeAmount', 'refundAmount', 'amountDueFromTenant'))
    OR (entity = 'leasing_refund' AND field_key IN ('refundAmount', 'receiverBankAccount', 'bankSerial', 'receiptFileId'))
    OR (entity = 'leasing_receivable' AND field_key IN ('amountDue', 'amountPaid', 'amountWaived', 'amountRemain', 'lateFee', 'overdueAmount'))
    OR (entity = 'leasing_payment' AND field_key IN ('bankSerial', 'payAmount', 'unappliedAmount', 'receipt_file_id', 'receiptFileId'))
    OR (entity = 'leasing_waiver' AND field_key IN ('waiverAmount'))
    OR (entity = 'leasing_invoice' AND field_key IN ('buyerTaxNo', 'amount', 'file_id', 'fileId'))
  );

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
field_policies(module, entity, field_key, field_name, policy_type, mask_rule, remark) AS (
  VALUES
    ('system', 'user', 'mobile', '手机号', 'masked', 'mobile', 'Sensitive mobile number default policy'),
    ('system', 'user', 'id_card_no', '身份证号', 'masked', 'id_card', 'Sensitive identity number default policy'),
    ('finance', 'bank_account', 'bank_account_no', '银行账号', 'masked', 'bank_account', 'Sensitive bank account default policy'),
    ('leasing', 'leasing_contract', 'contract_amount', '合同金额', 'masked', 'amount', 'Sensitive contract amount default policy'),
    ('finance', 'receivable', 'amount', '应收金额', 'masked', 'amount', 'Receivable amount default masked policy'),
    ('finance', 'payment', 'amount', '收款金额', 'hidden', 'amount', 'Payment amount default hidden policy'),
    ('finance', 'bank_account', 'bank_account', '银行账号', 'masked', 'bank_account', 'Generic bank account default policy'),
    ('system', 'person', 'id_card', '身份证号', 'masked', 'id_card', 'Generic ID card default policy'),
    ('leasing', 'leasing_contract', 'contract_attachment', '合同附件', 'visible', 'file_name', 'Contract attachment default policy'),
    ('system', 'sys_user', 'mobile', '用户手机号', 'masked', 'mobile', 'sys_user.mobile default field policy'),
    ('tenant', 'biz_tenant', 'contact_mobile', '租户联系人手机号', 'masked', 'mobile', 'biz_tenant.contact_mobile default field policy'),
    ('tenant', 'biz_tenant', 'legal_person_id', '法人身份证号', 'masked', 'id_card', 'biz_tenant.legal_person_id default field policy'),
    ('leasing', 'leasing_contract', 'rent_unit_price', '合同租金单价', 'masked', 'amount', 'leasing contract rent unit price default field policy'),
    ('leasing', 'leasing_contract', 'rentUnitPrice', '合同租金单价', 'masked', 'amount', 'leasing contract rentUnitPrice default field policy'),
    ('leasing', 'leasing_contract', 'total_amount', '合同总金额', 'masked', 'amount', 'leasing contract total amount default field policy'),
    ('leasing', 'leasing_contract', 'totalAmount', '合同总金额', 'masked', 'amount', 'leasing contract totalAmount default field policy'),
    ('leasing', 'leasing_contract', 'rent_per_month', '月租金', 'masked', 'amount', 'leasing contract rent per month default field policy'),
    ('leasing', 'leasing_contract', 'rentPerMonth', '月租金', 'masked', 'amount', 'leasing contract rentPerMonth default field policy'),
    ('leasing', 'leasing_contract', 'deposit_amount', '押金金额', 'masked', 'amount', 'leasing contract deposit amount default field policy'),
    ('leasing', 'leasing_contract', 'depositAmount', '押金金额', 'masked', 'amount', 'leasing contract depositAmount default field policy'),
    ('leasing', 'leasing_contract', 'property_fee_unit_price', '物业费单价', 'masked', 'amount', 'leasing contract property fee unit price default field policy'),
    ('leasing', 'leasing_contract', 'propertyFeeUnitPrice', '物业费单价', 'masked', 'amount', 'leasing contract propertyFeeUnitPrice default field policy'),
    ('leasing', 'leasing_contract', 'contract_pdf_file_id', '合同正文文件', 'visible', 'file_name', 'leasing contract pdf file default field policy'),
    ('leasing', 'leasing_contract', 'contractPdfFileId', '合同正文文件', 'visible', 'file_name', 'leasing contractPdfFileId default field policy'),
    ('leasing', 'leasing_contract', 'scan_pdf_file_id', '合同扫描件', 'visible', 'file_name', 'leasing contract scan file default field policy'),
    ('leasing', 'leasing_contract', 'scanPdfFileId', '合同扫描件', 'visible', 'file_name', 'leasing contract scanPdfFileId default field policy'),
    ('leasing', 'rel_leasing_contract_unit', 'rent_unit_price', '合同房源租金单价', 'masked', 'amount', 'leasing contract unit rent unit price default field policy'),
    ('leasing', 'rel_leasing_contract_unit', 'rentUnitPrice', '合同房源租金单价', 'masked', 'amount', 'leasing contract unit rentUnitPrice default field policy'),
    ('leasing', 'rel_leasing_contract_unit', 'rent_amount_per_month', '合同房源月租金', 'masked', 'amount', 'leasing contract unit monthly amount default field policy'),
    ('leasing', 'rel_leasing_contract_unit', 'rentAmountPerMonth', '合同房源月租金', 'masked', 'amount', 'leasing contract unit rentAmountPerMonth default field policy'),
    ('leasing', 'leasing_contract_change', 'before_snapshot', '合同变更前快照', 'hidden', NULL, 'leasing contract change before snapshot sensitive field policy'),
    ('leasing', 'leasing_contract_change', 'beforeSnapshot', '合同变更前快照', 'hidden', NULL, 'leasing contract change beforeSnapshot sensitive field policy'),
    ('leasing', 'leasing_contract_change', 'after_snapshot', '合同变更后快照', 'hidden', NULL, 'leasing contract change after snapshot sensitive field policy'),
    ('leasing', 'leasing_contract_change', 'afterSnapshot', '合同变更后快照', 'hidden', NULL, 'leasing contract change afterSnapshot sensitive field policy'),
    ('leasing', 'leasing_contract_change', 'finance_impact', '合同变更财务影响', 'masked', 'custom', 'leasing contract change finance impact sensitive field policy'),
    ('leasing', 'leasing_contract_change', 'financeImpact', '合同变更财务影响', 'masked', 'custom', 'leasing contract change financeImpact sensitive field policy'),
    ('leasing', 'leasing_checkout', 'unpaid_amount', '退租未缴金额', 'masked', 'amount', 'leasing checkout unpaid amount default field policy'),
    ('leasing', 'leasing_checkout', 'unpaidAmount', '退租未缴金额', 'masked', 'amount', 'leasing checkout unpaidAmount default field policy'),
    ('leasing', 'leasing_checkout', 'late_fee_amount', '退租滞纳金', 'masked', 'amount', 'leasing checkout late fee default field policy'),
    ('leasing', 'leasing_checkout', 'lateFeeAmount', '退租滞纳金', 'masked', 'amount', 'leasing checkout lateFeeAmount default field policy'),
    ('leasing', 'leasing_checkout', 'deposit_amount', '退租押金金额', 'masked', 'amount', 'leasing checkout deposit amount default field policy'),
    ('leasing', 'leasing_checkout', 'depositAmount', '退租押金金额', 'masked', 'amount', 'leasing checkout depositAmount default field policy'),
    ('leasing', 'leasing_checkout', 'deduction_amount', '退租扣款金额', 'masked', 'amount', 'leasing checkout deduction amount default field policy'),
    ('leasing', 'leasing_checkout', 'deductionAmount', '退租扣款金额', 'masked', 'amount', 'leasing checkout deductionAmount default field policy'),
    ('leasing', 'leasing_checkout', 'additional_charge_amount', '退租补缴金额', 'masked', 'amount', 'leasing checkout additional charge default field policy'),
    ('leasing', 'leasing_checkout', 'additionalChargeAmount', '退租补缴金额', 'masked', 'amount', 'leasing checkout additionalChargeAmount default field policy'),
    ('leasing', 'leasing_checkout', 'refund_amount', '退租退款金额', 'masked', 'amount', 'leasing checkout refund amount default field policy'),
    ('leasing', 'leasing_checkout', 'refundAmount', '退租退款金额', 'masked', 'amount', 'leasing checkout refundAmount default field policy'),
    ('leasing', 'leasing_checkout', 'amount_due_from_tenant', '退租租户应补金额', 'masked', 'amount', 'leasing checkout amount due from tenant default field policy'),
    ('leasing', 'leasing_checkout', 'amountDueFromTenant', '退租租户应补金额', 'masked', 'amount', 'leasing checkout amountDueFromTenant default field policy'),
    ('leasing', 'leasing_refund', 'refund_amount', '退款金额', 'masked', 'amount', 'leasing refund amount default field policy'),
    ('leasing', 'leasing_refund', 'refundAmount', '退款金额', 'masked', 'amount', 'leasing refund refundAmount default field policy'),
    ('leasing', 'leasing_refund', 'receiver_bank_account', '退款收款账号', 'masked', 'bank_account', 'leasing refund receiver bank account default field policy'),
    ('leasing', 'leasing_refund', 'receiverBankAccount', '退款收款账号', 'masked', 'bank_account', 'leasing refund receiverBankAccount default field policy'),
    ('leasing', 'leasing_refund', 'bank_serial', '退款银行流水号', 'masked', 'bank_account', 'leasing refund bank serial default field policy'),
    ('leasing', 'leasing_refund', 'bankSerial', '退款银行流水号', 'masked', 'bank_account', 'leasing refund bankSerial default field policy'),
    ('leasing', 'leasing_refund', 'receipt_file_id', '退款凭证附件 ID', 'visible', 'file_name', 'leasing refund receipt file id default field policy'),
    ('leasing', 'leasing_refund', 'receiptFileId', '退款凭证附件 ID', 'visible', 'file_name', 'leasing refund receiptFileId default field policy'),
    ('payment', 'biz_payment', 'bank_serial', '银行流水号', 'masked', 'bank_account', 'biz_payment.bank_serial default field policy'),
    ('system', 'sys_file', 'file_url', '文件访问地址', 'masked', 'custom', 'sys_file.file_url default field policy'),
    ('asset', 'unit', 'refPrice', '房源参考租金', 'masked', 'amount', 'asset unit reference price default field policy'),
    ('asset', 'unit', 'floorplanUrl', '房源平面图地址', 'masked', 'custom', 'asset unit floorplan url default field policy'),
    ('asset', 'floor', 'layoutUrl', '楼层平面图地址', 'masked', 'custom', 'asset floor layout url default field policy'),
    ('leasing', 'park_tenant', 'contact_mobile', '企业联系人手机号', 'masked', 'mobile', 'park tenant contact mobile default field policy'),
    ('leasing', 'park_tenant', 'legal_person_id', '法人身份证号', 'masked', 'id_card', 'park tenant legal person id default field policy'),
    ('leasing', 'park_tenant_contact', 'mobile', '租户企业联系人手机号', 'masked', 'mobile', 'park tenant contact mobile default field policy'),
    ('leasing', 'park_tenant_contact', 'email', '租户企业联系人邮箱', 'visible', NULL, 'park tenant contact email default visible field policy'),
    ('leasing', 'park_tenant_qualification', 'certificate_no', '租户企业资质证书编号', 'masked', 'custom', 'park tenant qualification certificate number default field policy'),
    ('leasing', 'park_tenant_qualification', 'file_id', '租户企业资质附件 ID', 'masked', 'custom', 'park tenant qualification file id default field policy'),
    ('leasing', 'leasing_lead', 'contact_mobile', '招商线索联系人手机号', 'masked', 'mobile', 'leasing lead contact mobile default field policy'),
    ('leasing', 'leasing_lead', 'demand_price', '招商线索预算价格', 'masked', 'amount', 'leasing lead demand price default field policy'),
    ('leasing', 'leasing_quote', 'quote_price', '招商报价单价', 'masked', 'amount', 'leasing quote price default field policy'),
    ('leasing', 'leasing_quote', 'property_fee_price', '招商报价物业费单价', 'masked', 'amount', 'leasing quote property fee price default field policy'),
    ('leasing', 'leasing_follow', 'content', '招商跟进内容', 'visible', NULL, 'leasing follow content default field policy'),
    ('leasing', 'leasing_receivable', 'amount_due', '应收金额', 'masked', 'amount', 'leasing receivable amount due default field policy'),
    ('leasing', 'leasing_receivable', 'amountDue', '应收金额', 'masked', 'amount', 'leasing receivable amountDue default field policy'),
    ('leasing', 'leasing_receivable', 'amount_paid', '已收金额', 'masked', 'amount', 'leasing receivable amount paid default field policy'),
    ('leasing', 'leasing_receivable', 'amountPaid', '已收金额', 'masked', 'amount', 'leasing receivable amountPaid default field policy'),
    ('leasing', 'leasing_receivable', 'amount_waived', '豁免金额', 'masked', 'amount', 'leasing receivable amount waived default field policy'),
    ('leasing', 'leasing_receivable', 'amountWaived', '豁免金额', 'masked', 'amount', 'leasing receivable amountWaived default field policy'),
    ('leasing', 'leasing_receivable', 'amount_remain', '未收金额', 'masked', 'amount', 'leasing receivable amount remain default field policy'),
    ('leasing', 'leasing_receivable', 'amountRemain', '未收金额', 'masked', 'amount', 'leasing receivable amountRemain default field policy'),
    ('leasing', 'leasing_receivable', 'late_fee', '滞纳金', 'masked', 'amount', 'leasing receivable late fee default field policy'),
    ('leasing', 'leasing_receivable', 'lateFee', '滞纳金', 'masked', 'amount', 'leasing receivable lateFee default field policy'),
    ('leasing', 'leasing_receivable', 'overdue_amount', '逾期金额', 'masked', 'amount', 'leasing receivable overdue amount default field policy'),
    ('leasing', 'leasing_receivable', 'overdueAmount', '逾期金额', 'masked', 'amount', 'leasing receivable overdueAmount default field policy'),
    ('leasing', 'leasing_payment', 'pay_amount', '收款金额', 'masked', 'amount', 'leasing payment pay amount default field policy'),
    ('leasing', 'leasing_payment', 'payAmount', '收款金额', 'masked', 'amount', 'leasing payment payAmount default field policy'),
    ('leasing', 'leasing_payment', 'unapplied_amount', '未核销金额', 'masked', 'amount', 'leasing payment unapplied amount default field policy'),
    ('leasing', 'leasing_payment', 'unappliedAmount', '未核销金额', 'masked', 'amount', 'leasing payment unappliedAmount default field policy'),
    ('leasing', 'leasing_payment', 'bank_serial', '银行流水号', 'masked', 'bank_account', 'leasing payment bank serial default field policy'),
    ('leasing', 'leasing_payment', 'bankSerial', '银行流水号', 'masked', 'bank_account', 'leasing payment bankSerial default field policy'),
    ('leasing', 'leasing_payment', 'receipt_file_id', '收款凭证附件 ID', 'visible', 'file_name', 'leasing payment receipt file id default field policy'),
    ('leasing', 'leasing_payment', 'receiptFileId', '收款凭证附件 ID', 'visible', 'file_name', 'leasing payment receiptFileId default field policy'),
    ('leasing', 'leasing_waiver', 'waiver_amount', '豁免金额', 'masked', 'amount', 'leasing waiver amount default field policy'),
    ('leasing', 'leasing_waiver', 'waiverAmount', '豁免金额', 'masked', 'amount', 'leasing waiver waiverAmount default field policy'),
    ('leasing', 'leasing_invoice', 'buyer_tax_no', '购方税号', 'masked', 'custom', 'leasing invoice buyer tax no default field policy'),
    ('leasing', 'leasing_invoice', 'buyerTaxNo', '购方税号', 'masked', 'custom', 'leasing invoice buyerTaxNo default field policy'),
    ('leasing', 'leasing_invoice', 'amount', '发票金额', 'masked', 'amount', 'leasing invoice amount default field policy'),
    ('leasing', 'leasing_invoice', 'file_id', '发票附件 ID', 'visible', 'file_name', 'leasing invoice file id default field policy'),
    ('leasing', 'leasing_invoice', 'fileId', '发票附件 ID', 'visible', 'file_name', 'leasing invoice fileId default field policy'),
    ('workorder', 'work_order', 'reporter_mobile', '报修人手机号', 'masked', 'mobile', 'work order reporter mobile default field policy'),
    ('workorder', 'work_order', 'reporterMobile', '报修人手机号', 'masked', 'mobile', 'work order reporterMobile default field policy'),
    ('workorder', 'work_order', 'description', '工单描述', 'visible', NULL, 'work order description default field policy'),
    ('workorder', 'work_order', 'image_file_ids', '工单图片附件', 'visible', NULL, 'work order image file ids default field policy'),
    ('workorder', 'work_order', 'imageFileIds', '工单图片附件', 'visible', NULL, 'work order imageFileIds default field policy'),
    ('workorder', 'work_order', 'video_file_ids', '工单视频附件', 'visible', NULL, 'work order video file ids default field policy'),
    ('workorder', 'work_order', 'videoFileIds', '工单视频附件', 'visible', NULL, 'work order videoFileIds default field policy'),
    ('workorder', 'work_order', 'evaluation', '工单评价', 'visible', NULL, 'work order evaluation default field policy')
)
INSERT INTO sys_field_policy (
  tenant_id,
  park_id,
  module,
  entity,
  field_key,
  field_name,
  policy_type,
  mask_rule,
  status,
  remark
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  field_policies.module,
  field_policies.entity,
  field_policies.field_key,
  field_policies.field_name,
  field_policies.policy_type,
  field_policies.mask_rule,
  'enabled',
  field_policies.remark
FROM field_policies
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, module, entity, field_key) WHERE is_deleted = false DO UPDATE SET
  field_name = EXCLUDED.field_name,
  policy_type = EXCLUDED.policy_type,
  mask_rule = EXCLUDED.mask_rule,
  status = EXCLUDED.status,
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id,
    '00000000-0000-4000-8000-000000000201'::uuid AS org_id,
    '00000000-0000-4000-8000-000000002001'::uuid AS super_admin_role_id,
    '00000000-0000-4000-8000-000000002003'::uuid AS system_admin_role_id,
    '00000000-0000-4000-8000-000000002004'::uuid AS auditor_role_id,
    '00000000-0000-4000-8000-000000002101'::uuid AS operations_owner_role_id,
    '00000000-0000-4000-8000-000000002102'::uuid AS executive_role_id,
    '00000000-0000-4000-8000-000000002103'::uuid AS invest_manager_role_id,
    '00000000-0000-4000-8000-000000002104'::uuid AS invest_specialist_role_id,
    '00000000-0000-4000-8000-000000002105'::uuid AS safety_manager_role_id,
    '00000000-0000-4000-8000-000000002106'::uuid AS property_manager_role_id,
    '00000000-0000-4000-8000-000000002107'::uuid AS finance_manager_role_id,
    '00000000-0000-4000-8000-000000002108'::uuid AS finance_specialist_role_id,
    '00000000-0000-4000-8000-000000002109'::uuid AS property_staff_role_id,
    '00000000-0000-4000-8000-000000002110'::uuid AS maintenance_engineer_role_id
),
default_park AS (
  INSERT INTO sys_org (
    id,
    tenant_id,
    park_id,
    org_code,
    org_name,
    org_type,
    sort_order,
    status,
    remark
  )
  SELECT
    org_id,
    tenant_id,
    park_id,
    'JH_ROOT',
    '金湖科创产业园',
    'park',
    0,
    'enabled',
    'Production-safe default park organization'
  FROM seed_scope
  ON CONFLICT DO NOTHING
  RETURNING id
),
updated_default_park AS (
  UPDATE sys_org
  SET
    tenant_id = seed_scope.tenant_id,
    park_id = seed_scope.park_id,
    org_code = 'JH_ROOT',
    org_name = '金湖科创产业园',
    org_type = 'park',
    sort_order = 0,
    status = 'enabled',
    remark = 'Production-safe default park organization',
    is_deleted = false,
    update_time = now()
  FROM seed_scope
  WHERE sys_org.id = seed_scope.org_id
     OR (
      sys_org.tenant_id = seed_scope.tenant_id
      AND sys_org.park_id = seed_scope.park_id
      AND sys_org.org_code = 'JH_ROOT'
    )
  RETURNING sys_org.id
),
roles(id, code, name, role_type, role_scope, data_scope, is_super, sort_no, remark) AS (
  SELECT super_admin_role_id, 'SUPER_ADMIN', '超级管理员', 'system', 'platform', 'all', true, 10, 'Built-in super administrator role template. Assign to a real user after secure account provisioning.'
  FROM seed_scope
  UNION ALL
  SELECT system_admin_role_id, 'SYSTEM_ADMIN', '系统管理员', 'system', 'platform', 'park', false, 20, 'Default system administration role template.'
  FROM seed_scope
  UNION ALL
  SELECT auditor_role_id, 'AUDITOR', '审计员', 'system', 'platform', 'park', false, 30, 'Default audit read-only role template.'
  FROM seed_scope
  UNION ALL
  SELECT operations_owner_role_id, 'OPERATIONS_OWNER', '运营负责人', 'park', 'park', 'park', false, 40, 'Default asset management role template.'
  FROM seed_scope
  UNION ALL
  SELECT executive_role_id, 'EXECUTIVE', '高层', 'tenant', 'tenant', 'park', false, 50, 'Default asset read-only executive role template.'
  FROM seed_scope
  UNION ALL
  SELECT invest_manager_role_id, 'INVEST_MANAGER', '招商主管', 'park', 'park', 'self', false, 60, 'Default investment manager role template.'
  FROM seed_scope
  UNION ALL
  SELECT invest_specialist_role_id, 'INVEST_SPECIALIST', '招商专员', 'park', 'park', 'self', false, 70, 'Default investment specialist role template.'
  FROM seed_scope
  UNION ALL
  SELECT safety_manager_role_id, 'SAFETY_MANAGER', '安全主管', 'park', 'park', 'park', false, 80, 'Default safety manager role template.'
  FROM seed_scope
  UNION ALL
  SELECT property_manager_role_id, 'PROPERTY_MANAGER', '物业主管', 'park', 'park', 'park', false, 90, 'Default property manager role template.'
  FROM seed_scope
  UNION ALL
  SELECT property_staff_role_id, 'PROPERTY_STAFF', '物业专员/派单员', 'park', 'park', 'park', false, 95, 'Default property staff and dispatcher role template.'
  FROM seed_scope
  UNION ALL
  SELECT maintenance_engineer_role_id, 'MAINTENANCE_ENGINEER', '维修工程师', 'park', 'park', 'self', false, 98, 'Default maintenance engineer role template.'
  FROM seed_scope
  UNION ALL
  SELECT finance_manager_role_id, 'FINANCE_MANAGER', '财务主管', 'park', 'park', 'park', false, 100, 'Default finance manager role template.'
  FROM seed_scope
  UNION ALL
  SELECT finance_specialist_role_id, 'FINANCE_SPECIALIST', '财务专员', 'park', 'park', 'park', false, 110, 'Default finance specialist role template.'
  FROM seed_scope
)
INSERT INTO sys_role (
  id,
  tenant_id,
  park_id,
  code,
  name,
  parent_id,
  role_path,
  role_level,
  level,
  sort_no,
  role_type,
  role_scope,
  data_scope,
  data_scope_config,
  is_template,
  is_system,
  is_builtin,
  is_super,
  editable,
  is_editable,
  is_deletable,
  is_enabled,
  status,
  remark
)
SELECT
  roles.id,
  seed_scope.tenant_id,
  seed_scope.park_id,
  roles.code,
  roles.name,
  NULL,
  roles.code,
  1,
  1,
  roles.sort_no,
  roles.role_type,
  roles.role_scope,
  roles.data_scope,
  '{}'::jsonb,
  true,
  roles.code = 'SUPER_ADMIN',
  roles.code = 'SUPER_ADMIN',
  roles.is_super,
  true,
  true,
  roles.code <> 'SUPER_ADMIN',
  true,
  'enabled',
  roles.remark
FROM roles
CROSS JOIN seed_scope
ON CONFLICT DO NOTHING;

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id,
    '00000000-0000-4000-8000-000000002001'::uuid AS super_admin_role_id,
    '00000000-0000-4000-8000-000000002003'::uuid AS system_admin_role_id,
    '00000000-0000-4000-8000-000000002004'::uuid AS auditor_role_id,
    '00000000-0000-4000-8000-000000002101'::uuid AS operations_owner_role_id,
    '00000000-0000-4000-8000-000000002102'::uuid AS executive_role_id,
    '00000000-0000-4000-8000-000000002103'::uuid AS invest_manager_role_id,
    '00000000-0000-4000-8000-000000002104'::uuid AS invest_specialist_role_id,
    '00000000-0000-4000-8000-000000002105'::uuid AS safety_manager_role_id,
    '00000000-0000-4000-8000-000000002106'::uuid AS property_manager_role_id,
    '00000000-0000-4000-8000-000000002107'::uuid AS finance_manager_role_id,
    '00000000-0000-4000-8000-000000002108'::uuid AS finance_specialist_role_id,
    '00000000-0000-4000-8000-000000002109'::uuid AS property_staff_role_id,
    '00000000-0000-4000-8000-000000002110'::uuid AS maintenance_engineer_role_id
),
roles(id, code, name, role_type, role_scope, data_scope, is_super, sort_no, remark) AS (
  SELECT super_admin_role_id, 'SUPER_ADMIN', '超级管理员', 'system', 'platform', 'all', true, 10, 'Built-in super administrator role template. Assign to a real user after secure account provisioning.'
  FROM seed_scope
  UNION ALL
  SELECT system_admin_role_id, 'SYSTEM_ADMIN', '系统管理员', 'system', 'platform', 'park', false, 20, 'Default system administration role template.'
  FROM seed_scope
  UNION ALL
  SELECT auditor_role_id, 'AUDITOR', '审计员', 'system', 'platform', 'park', false, 30, 'Default audit read-only role template.'
  FROM seed_scope
  UNION ALL
  SELECT operations_owner_role_id, 'OPERATIONS_OWNER', '运营负责人', 'park', 'park', 'park', false, 40, 'Default asset management role template.'
  FROM seed_scope
  UNION ALL
  SELECT executive_role_id, 'EXECUTIVE', '高层', 'tenant', 'tenant', 'park', false, 50, 'Default asset read-only executive role template.'
  FROM seed_scope
  UNION ALL
  SELECT invest_manager_role_id, 'INVEST_MANAGER', '招商主管', 'park', 'park', 'self', false, 60, 'Default investment manager role template.'
  FROM seed_scope
  UNION ALL
  SELECT invest_specialist_role_id, 'INVEST_SPECIALIST', '招商专员', 'park', 'park', 'self', false, 70, 'Default investment specialist role template.'
  FROM seed_scope
  UNION ALL
  SELECT safety_manager_role_id, 'SAFETY_MANAGER', '安全主管', 'park', 'park', 'park', false, 80, 'Default safety manager role template.'
  FROM seed_scope
  UNION ALL
  SELECT property_manager_role_id, 'PROPERTY_MANAGER', '物业主管', 'park', 'park', 'park', false, 90, 'Default property manager role template.'
  FROM seed_scope
  UNION ALL
  SELECT property_staff_role_id, 'PROPERTY_STAFF', '物业专员/派单员', 'park', 'park', 'park', false, 95, 'Default property staff and dispatcher role template.'
  FROM seed_scope
  UNION ALL
  SELECT maintenance_engineer_role_id, 'MAINTENANCE_ENGINEER', '维修工程师', 'park', 'park', 'self', false, 98, 'Default maintenance engineer role template.'
  FROM seed_scope
  UNION ALL
  SELECT finance_manager_role_id, 'FINANCE_MANAGER', '财务主管', 'park', 'park', 'park', false, 100, 'Default finance manager role template.'
  FROM seed_scope
  UNION ALL
  SELECT finance_specialist_role_id, 'FINANCE_SPECIALIST', '财务专员', 'park', 'park', 'park', false, 110, 'Default finance specialist role template.'
  FROM seed_scope
)
UPDATE sys_role
SET
  tenant_id = seed_scope.tenant_id,
  park_id = seed_scope.park_id,
  code = roles.code,
  name = roles.name,
  parent_id = NULL,
  role_path = roles.code,
  role_level = 1,
  level = 1,
  sort_no = roles.sort_no,
  role_type = roles.role_type,
  role_scope = roles.role_scope,
  data_scope = roles.data_scope,
  data_scope_config = '{}'::jsonb,
  is_template = true,
  is_system = roles.code = 'SUPER_ADMIN',
  is_builtin = roles.code = 'SUPER_ADMIN',
  is_super = roles.is_super,
  editable = true,
  is_editable = true,
  is_deletable = roles.code <> 'SUPER_ADMIN',
  is_enabled = true,
  status = 'enabled',
  remark = roles.remark,
  is_deleted = false,
  update_time = now()
FROM roles
CROSS JOIN seed_scope
WHERE sys_role.id = roles.id
  AND NOT EXISTS (
    SELECT 1
    FROM sys_role existing_role
    WHERE existing_role.tenant_id = seed_scope.tenant_id
      AND existing_role.park_id = seed_scope.park_id
      AND existing_role.code = roles.code
      AND existing_role.id <> sys_role.id
      AND existing_role.is_deleted = false
  )
   OR (
    sys_role.tenant_id = seed_scope.tenant_id
    AND sys_role.park_id = seed_scope.park_id
    AND sys_role.code = roles.code
    AND sys_role.is_deleted = false
  );

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
role_rule_codes(role_code, rule_code) AS (
  VALUES
    ('SUPER_ADMIN', 'all_parks'),
    ('SYSTEM_ADMIN', 'current_park'),
    ('AUDITOR', 'current_park'),
    ('OPERATIONS_OWNER', 'current_park'),
    ('EXECUTIVE', 'current_park'),
    ('INVEST_MANAGER', 'current_park'),
    ('INVEST_SPECIALIST', 'self_only'),
    ('INVEST_SPECIALIST', 'self_contract_owner'),
    ('SAFETY_MANAGER', 'current_park'),
    ('PROPERTY_MANAGER', 'current_park'),
    ('PROPERTY_STAFF', 'current_park'),
    ('MAINTENANCE_ENGINEER', 'self_only'),
    ('FINANCE_MANAGER', 'current_park'),
    ('FINANCE_SPECIALIST', 'current_park')
),
role_data_scope_links AS (
  SELECT
    role.tenant_id,
    role.park_id,
    role.id AS role_id,
    data_scope_rule.id AS rule_id
  FROM role_rule_codes
  JOIN seed_scope ON true
  JOIN sys_role role
    ON role.tenant_id = seed_scope.tenant_id
   AND role.park_id = seed_scope.park_id
   AND role.code = role_rule_codes.role_code
   AND role.is_deleted = false
  JOIN sys_data_scope_rule data_scope_rule
    ON data_scope_rule.tenant_id = seed_scope.tenant_id
   AND data_scope_rule.park_id = seed_scope.park_id
   AND data_scope_rule.rule_code = role_rule_codes.rule_code
   AND data_scope_rule.is_deleted = false
)
INSERT INTO rel_role_data_scope (
  tenant_id,
  park_id,
  role_id,
  rule_id,
  remark
)
SELECT
  tenant_id,
  park_id,
  role_id,
  rule_id,
  'Production-safe built-in role data scope seed'
FROM role_data_scope_links
ON CONFLICT (tenant_id, role_id, rule_id) WHERE is_deleted = false DO UPDATE SET
  is_deleted = false,
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
asset_seed_roles AS (
  SELECT role.id, role.tenant_id, role.park_id
  FROM sys_role role
  JOIN seed_scope
    ON seed_scope.tenant_id = role.tenant_id
   AND seed_scope.park_id = role.park_id
  WHERE role.code IN ('EXECUTIVE', 'OPERATIONS_OWNER', 'INVEST_MANAGER', 'INVEST_SPECIALIST')
    AND role.is_deleted = false
),
asset_seed_permissions AS (
  SELECT permission.id, permission.tenant_id, permission.park_id
  FROM sys_permission permission
  JOIN seed_scope
    ON seed_scope.tenant_id = permission.tenant_id
   AND seed_scope.park_id = permission.park_id
  WHERE permission.is_deleted = false
    AND (
      permission.code LIKE 'park:%'
      OR permission.code LIKE 'building:%'
      OR permission.code LIKE 'floor:%'
      OR permission.code LIKE 'unit:%'
      OR permission.code IN ('asset:read', 'asset:status_board', 'asset:statistics', 'asset:statistics:read')
    )
)
UPDATE rel_role_perm relation
SET is_deleted = true,
    update_time = now()
FROM asset_seed_roles role,
     asset_seed_permissions permission
WHERE relation.tenant_id = role.tenant_id
  AND relation.park_id = role.park_id
  AND relation.role_id = role.id
  AND relation.permission_id = permission.id
  AND relation.is_deleted = false;

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
managed_roles(role_code) AS (
  VALUES
    ('EXECUTIVE'),
    ('OPERATIONS_OWNER'),
    ('INVEST_MANAGER'),
    ('INVEST_SPECIALIST'),
    ('SAFETY_MANAGER'),
    ('PROPERTY_MANAGER'),
    ('PROPERTY_STAFF'),
    ('MAINTENANCE_ENGINEER'),
    ('FINANCE_MANAGER'),
    ('FINANCE_SPECIALIST')
),
s3a_permissions(permission_code) AS (
  VALUES
    ('park_tenant:read'),
    ('park_tenant:create'),
    ('park_tenant:update'),
    ('park_tenant:delete'),
    ('park_tenant:360'),
    ('park_tenant_contact:read'),
    ('park_tenant_contact:create'),
    ('park_tenant_contact:update'),
    ('park_tenant_contact:delete'),
    ('park_tenant_qualification:read'),
    ('park_tenant_qualification:create'),
    ('park_tenant_qualification:update'),
    ('park_tenant_qualification:delete'),
    ('park_tenant:risk_update'),
    ('park_tenant:risk_log'),
    ('leasing_lead:read'),
    ('leasing_lead:create'),
    ('leasing_lead:update'),
    ('leasing_lead:delete'),
    ('leasing_lead:change_status'),
    ('leasing_lead:force_change_status'),
    ('leasing_lead:confirm_sign'),
    ('leasing_lead:status_log'),
    ('leasing_lead:convert_to_park_tenant'),
    ('leasing_lead_pool:read'),
    ('leasing_lead:assign'),
    ('leasing_lead:reclaim'),
    ('leasing_lead:move_to_pool'),
    ('leasing_follow:read'),
    ('leasing_follow:create'),
    ('leasing_follow:update'),
    ('leasing_follow:delete'),
    ('leasing_visit:read'),
    ('leasing_visit:create'),
    ('leasing_visit:update'),
    ('leasing_visit:delete'),
    ('leasing_quote:read'),
    ('leasing_quote:create'),
    ('leasing_quote:update'),
    ('leasing_quote:delete'),
    ('leasing_quote:submit'),
    ('leasing_quote:approve'),
    ('leasing_quote:reject'),
    ('leasing_quote:create_contract'),
    ('leasing_contract:read'),
    ('leasing_contract:create'),
    ('leasing_contract:update'),
    ('leasing_contract:delete'),
    ('leasing_contract:submit'),
    ('leasing_contract:approve'),
    ('leasing_contract:reject'),
    ('leasing_contract:void'),
    ('leasing_contract:archive'),
    ('leasing_contract:effective'),
    ('leasing_contract:renew'),
    ('leasing_contract:status_log'),
    ('leasing_contract:action_log'),
    ('leasing_contract:file_read'),
    ('leasing_contract_unit:read'),
    ('leasing_contract_unit:create'),
    ('leasing_contract_unit:update'),
    ('leasing_contract_unit:delete'),
    ('leasing_contract:recalculate'),
    ('leasing_contract:override_area'),
    ('leasing_contract:force_bind_unit'),
    ('leasing_contract:edit_after_submit'),
    ('leasing_contract_change:read'),
    ('leasing_contract_change:create'),
    ('leasing_contract_change:update'),
    ('leasing_contract_change:delete'),
    ('leasing_contract_change:preview'),
    ('leasing_contract_change:submit'),
    ('leasing_contract_change:approve'),
    ('leasing_contract_change:reject'),
    ('leasing_contract_change:effective'),
    ('leasing_checkout:read'),
    ('leasing_checkout:create'),
    ('leasing_checkout:update'),
    ('leasing_checkout:delete'),
    ('leasing_checkout:submit'),
    ('leasing_checkout:approve'),
    ('leasing_checkout:reject'),
    ('leasing_checkout:preview_settlement'),
    ('leasing_checkout:confirm_settlement'),
    ('leasing_checkout:effective'),
    ('leasing_refund:read'),
    ('leasing_refund:create'),
    ('leasing_receivable:read'),
    ('leasing_receivable:create'),
    ('leasing_receivable:update'),
    ('leasing_receivable:delete'),
    ('leasing_receivable:generate'),
    ('leasing_receivable:generate_batch'),
    ('leasing_receivable:overdue'),
    ('leasing_receivable:aging'),
    ('leasing_receivable:status_log'),
    ('leasing_payment:read'),
    ('leasing_payment:create'),
    ('leasing_payment:update'),
    ('leasing_payment:delete'),
    ('leasing_payment:apply'),
    ('leasing_waiver:read'),
    ('leasing_waiver:create'),
    ('leasing_waiver:approve'),
    ('leasing_waiver:reject'),
    ('leasing_invoice:read'),
    ('leasing_invoice:create'),
    ('leasing_invoice:update'),
    ('leasing_invoice:delete'),
    ('leasing_statistics:funnel'),
    ('workorder:read'),
    ('workorder:create'),
    ('workorder:update'),
    ('workorder:delete'),
    ('workorder:assign'),
    ('workorder:reassign'),
    ('workorder:accept'),
    ('workorder:start'),
    ('workorder:wait_material'),
    ('workorder:finish'),
    ('workorder:confirm'),
    ('workorder:evaluate'),
    ('workorder:close'),
    ('workorder:cancel'),
    ('workorder:return'),
    ('workorder:reject'),
    ('workorder_sla:read'),
    ('workorder_sla:create'),
    ('workorder_sla:update'),
    ('workorder_sla:delete'),
    ('workorder:recalculate_overdue'),
    ('workorder:overdue'),
    ('workorder:stats'),
    ('workorder_log:read'),
    ('workorder_log:create'),
    ('workorder:manage_all')
),
desired_role_permissions(role_code, permission_code) AS (
  VALUES
    ('EXECUTIVE', 'park_tenant:read'),
    ('EXECUTIVE', 'park_tenant:360'),
    ('EXECUTIVE', 'park_tenant:risk_log'),
    ('EXECUTIVE', 'leasing_lead:read'),
    ('EXECUTIVE', 'leasing_lead:status_log'),
    ('EXECUTIVE', 'leasing_quote:read'),
    ('EXECUTIVE', 'leasing_contract:read'),
    ('EXECUTIVE', 'leasing_contract:status_log'),
    ('EXECUTIVE', 'leasing_contract:action_log'),
    ('EXECUTIVE', 'leasing_contract:file_read'),
    ('EXECUTIVE', 'leasing_contract_unit:read'),
    ('EXECUTIVE', 'leasing_contract_change:read'),
    ('EXECUTIVE', 'leasing_contract_change:preview'),
    ('EXECUTIVE', 'leasing_checkout:read'),
    ('EXECUTIVE', 'leasing_refund:read'),
    ('EXECUTIVE', 'leasing_receivable:read'),
    ('EXECUTIVE', 'leasing_receivable:aging'),
    ('EXECUTIVE', 'leasing_receivable:status_log'),
    ('EXECUTIVE', 'leasing_payment:read'),
    ('EXECUTIVE', 'leasing_waiver:read'),
    ('EXECUTIVE', 'leasing_invoice:read'),
    ('EXECUTIVE', 'leasing_statistics:funnel'),
    ('EXECUTIVE', 'workorder:read'),
    ('EXECUTIVE', 'workorder:stats'),
    ('EXECUTIVE', 'workorder_log:read'),
    ('OPERATIONS_OWNER', 'park_tenant:read'),
    ('OPERATIONS_OWNER', 'park_tenant:create'),
    ('OPERATIONS_OWNER', 'park_tenant:update'),
    ('OPERATIONS_OWNER', 'park_tenant:delete'),
    ('OPERATIONS_OWNER', 'park_tenant:360'),
    ('OPERATIONS_OWNER', 'park_tenant_contact:read'),
    ('OPERATIONS_OWNER', 'park_tenant_contact:create'),
    ('OPERATIONS_OWNER', 'park_tenant_contact:update'),
    ('OPERATIONS_OWNER', 'park_tenant_contact:delete'),
    ('OPERATIONS_OWNER', 'park_tenant_qualification:read'),
    ('OPERATIONS_OWNER', 'park_tenant_qualification:create'),
    ('OPERATIONS_OWNER', 'park_tenant_qualification:update'),
    ('OPERATIONS_OWNER', 'park_tenant_qualification:delete'),
    ('OPERATIONS_OWNER', 'park_tenant:risk_update'),
    ('OPERATIONS_OWNER', 'park_tenant:risk_log'),
    ('OPERATIONS_OWNER', 'leasing_lead:read'),
    ('OPERATIONS_OWNER', 'leasing_lead:create'),
    ('OPERATIONS_OWNER', 'leasing_lead:update'),
    ('OPERATIONS_OWNER', 'leasing_lead:delete'),
    ('OPERATIONS_OWNER', 'leasing_lead:change_status'),
    ('OPERATIONS_OWNER', 'leasing_lead:force_change_status'),
    ('OPERATIONS_OWNER', 'leasing_lead:confirm_sign'),
    ('OPERATIONS_OWNER', 'leasing_lead:status_log'),
    ('OPERATIONS_OWNER', 'leasing_lead:convert_to_park_tenant'),
    ('OPERATIONS_OWNER', 'leasing_lead_pool:read'),
    ('OPERATIONS_OWNER', 'leasing_lead:assign'),
    ('OPERATIONS_OWNER', 'leasing_lead:reclaim'),
    ('OPERATIONS_OWNER', 'leasing_lead:move_to_pool'),
    ('OPERATIONS_OWNER', 'leasing_follow:read'),
    ('OPERATIONS_OWNER', 'leasing_follow:create'),
    ('OPERATIONS_OWNER', 'leasing_follow:update'),
    ('OPERATIONS_OWNER', 'leasing_follow:delete'),
    ('OPERATIONS_OWNER', 'leasing_visit:read'),
    ('OPERATIONS_OWNER', 'leasing_visit:create'),
    ('OPERATIONS_OWNER', 'leasing_visit:update'),
    ('OPERATIONS_OWNER', 'leasing_visit:delete'),
    ('OPERATIONS_OWNER', 'leasing_quote:read'),
    ('OPERATIONS_OWNER', 'leasing_quote:create'),
    ('OPERATIONS_OWNER', 'leasing_quote:update'),
    ('OPERATIONS_OWNER', 'leasing_quote:delete'),
    ('OPERATIONS_OWNER', 'leasing_quote:submit'),
    ('OPERATIONS_OWNER', 'leasing_quote:approve'),
    ('OPERATIONS_OWNER', 'leasing_quote:reject'),
    ('OPERATIONS_OWNER', 'leasing_quote:create_contract'),
    ('OPERATIONS_OWNER', 'leasing_contract:read'),
    ('OPERATIONS_OWNER', 'leasing_contract:create'),
    ('OPERATIONS_OWNER', 'leasing_contract:update'),
    ('OPERATIONS_OWNER', 'leasing_contract:delete'),
    ('OPERATIONS_OWNER', 'leasing_contract:submit'),
    ('OPERATIONS_OWNER', 'leasing_contract:approve'),
    ('OPERATIONS_OWNER', 'leasing_contract:reject'),
    ('OPERATIONS_OWNER', 'leasing_contract:void'),
    ('OPERATIONS_OWNER', 'leasing_contract:archive'),
    ('OPERATIONS_OWNER', 'leasing_contract:effective'),
    ('OPERATIONS_OWNER', 'leasing_contract:renew'),
    ('OPERATIONS_OWNER', 'leasing_contract:status_log'),
    ('OPERATIONS_OWNER', 'leasing_contract:action_log'),
    ('OPERATIONS_OWNER', 'leasing_contract:file_read'),
    ('OPERATIONS_OWNER', 'leasing_contract_unit:read'),
    ('OPERATIONS_OWNER', 'leasing_contract_unit:create'),
    ('OPERATIONS_OWNER', 'leasing_contract_unit:update'),
    ('OPERATIONS_OWNER', 'leasing_contract_unit:delete'),
    ('OPERATIONS_OWNER', 'leasing_contract:recalculate'),
    ('OPERATIONS_OWNER', 'leasing_contract:override_area'),
    ('OPERATIONS_OWNER', 'leasing_contract:force_bind_unit'),
    ('OPERATIONS_OWNER', 'leasing_contract:edit_after_submit'),
    ('OPERATIONS_OWNER', 'leasing_contract_change:read'),
    ('OPERATIONS_OWNER', 'leasing_contract_change:create'),
    ('OPERATIONS_OWNER', 'leasing_contract_change:update'),
    ('OPERATIONS_OWNER', 'leasing_contract_change:delete'),
    ('OPERATIONS_OWNER', 'leasing_contract_change:preview'),
    ('OPERATIONS_OWNER', 'leasing_contract_change:submit'),
    ('OPERATIONS_OWNER', 'leasing_contract_change:approve'),
    ('OPERATIONS_OWNER', 'leasing_contract_change:reject'),
    ('OPERATIONS_OWNER', 'leasing_contract_change:effective'),
    ('OPERATIONS_OWNER', 'leasing_checkout:read'),
    ('OPERATIONS_OWNER', 'leasing_checkout:create'),
    ('OPERATIONS_OWNER', 'leasing_checkout:update'),
    ('OPERATIONS_OWNER', 'leasing_checkout:delete'),
    ('OPERATIONS_OWNER', 'leasing_checkout:submit'),
    ('OPERATIONS_OWNER', 'leasing_checkout:approve'),
    ('OPERATIONS_OWNER', 'leasing_checkout:reject'),
    ('OPERATIONS_OWNER', 'leasing_checkout:preview_settlement'),
    ('OPERATIONS_OWNER', 'leasing_checkout:confirm_settlement'),
    ('OPERATIONS_OWNER', 'leasing_checkout:effective'),
    ('OPERATIONS_OWNER', 'leasing_refund:read'),
    ('OPERATIONS_OWNER', 'leasing_refund:create'),
    ('OPERATIONS_OWNER', 'leasing_receivable:read'),
    ('OPERATIONS_OWNER', 'leasing_receivable:create'),
    ('OPERATIONS_OWNER', 'leasing_receivable:update'),
    ('OPERATIONS_OWNER', 'leasing_receivable:delete'),
    ('OPERATIONS_OWNER', 'leasing_receivable:generate'),
    ('OPERATIONS_OWNER', 'leasing_receivable:generate_batch'),
    ('OPERATIONS_OWNER', 'leasing_receivable:overdue'),
    ('OPERATIONS_OWNER', 'leasing_receivable:aging'),
    ('OPERATIONS_OWNER', 'leasing_receivable:status_log'),
    ('OPERATIONS_OWNER', 'leasing_payment:read'),
    ('OPERATIONS_OWNER', 'leasing_payment:create'),
    ('OPERATIONS_OWNER', 'leasing_payment:update'),
    ('OPERATIONS_OWNER', 'leasing_payment:delete'),
    ('OPERATIONS_OWNER', 'leasing_payment:apply'),
    ('OPERATIONS_OWNER', 'leasing_waiver:read'),
    ('OPERATIONS_OWNER', 'leasing_waiver:create'),
    ('OPERATIONS_OWNER', 'leasing_waiver:approve'),
    ('OPERATIONS_OWNER', 'leasing_waiver:reject'),
    ('OPERATIONS_OWNER', 'leasing_invoice:read'),
    ('OPERATIONS_OWNER', 'leasing_invoice:create'),
    ('OPERATIONS_OWNER', 'leasing_invoice:update'),
    ('OPERATIONS_OWNER', 'leasing_invoice:delete'),
    ('OPERATIONS_OWNER', 'leasing_statistics:funnel'),
    ('OPERATIONS_OWNER', 'workorder:read'),
    ('OPERATIONS_OWNER', 'workorder:create'),
    ('OPERATIONS_OWNER', 'workorder:update'),
    ('OPERATIONS_OWNER', 'workorder:delete'),
    ('OPERATIONS_OWNER', 'workorder:assign'),
    ('OPERATIONS_OWNER', 'workorder:reassign'),
    ('OPERATIONS_OWNER', 'workorder:accept'),
    ('OPERATIONS_OWNER', 'workorder:start'),
    ('OPERATIONS_OWNER', 'workorder:wait_material'),
    ('OPERATIONS_OWNER', 'workorder:finish'),
    ('OPERATIONS_OWNER', 'workorder:confirm'),
    ('OPERATIONS_OWNER', 'workorder:evaluate'),
    ('OPERATIONS_OWNER', 'workorder:close'),
    ('OPERATIONS_OWNER', 'workorder:cancel'),
    ('OPERATIONS_OWNER', 'workorder:return'),
    ('OPERATIONS_OWNER', 'workorder:reject'),
    ('OPERATIONS_OWNER', 'workorder_sla:read'),
    ('OPERATIONS_OWNER', 'workorder_sla:create'),
    ('OPERATIONS_OWNER', 'workorder_sla:update'),
    ('OPERATIONS_OWNER', 'workorder_sla:delete'),
    ('OPERATIONS_OWNER', 'workorder:recalculate_overdue'),
    ('OPERATIONS_OWNER', 'workorder:overdue'),
    ('OPERATIONS_OWNER', 'workorder:stats'),
    ('OPERATIONS_OWNER', 'workorder_log:read'),
    ('OPERATIONS_OWNER', 'workorder_log:create'),
    ('OPERATIONS_OWNER', 'workorder:manage_all'),
    ('INVEST_MANAGER', 'park_tenant:read'),
    ('INVEST_MANAGER', 'park_tenant:create'),
    ('INVEST_MANAGER', 'park_tenant:update'),
    ('INVEST_MANAGER', 'park_tenant:360'),
    ('INVEST_MANAGER', 'park_tenant_contact:read'),
    ('INVEST_MANAGER', 'park_tenant_contact:create'),
    ('INVEST_MANAGER', 'park_tenant_contact:update'),
    ('INVEST_MANAGER', 'park_tenant_qualification:read'),
    ('INVEST_MANAGER', 'park_tenant:risk_log'),
    ('INVEST_MANAGER', 'leasing_lead:read'),
    ('INVEST_MANAGER', 'leasing_lead:create'),
    ('INVEST_MANAGER', 'leasing_lead:update'),
    ('INVEST_MANAGER', 'leasing_lead:delete'),
    ('INVEST_MANAGER', 'leasing_lead:change_status'),
    ('INVEST_MANAGER', 'leasing_lead:confirm_sign'),
    ('INVEST_MANAGER', 'leasing_lead:status_log'),
    ('INVEST_MANAGER', 'leasing_lead:convert_to_park_tenant'),
    ('INVEST_MANAGER', 'leasing_lead_pool:read'),
    ('INVEST_MANAGER', 'leasing_lead:assign'),
    ('INVEST_MANAGER', 'leasing_lead:reclaim'),
    ('INVEST_MANAGER', 'leasing_lead:move_to_pool'),
    ('INVEST_MANAGER', 'leasing_follow:read'),
    ('INVEST_MANAGER', 'leasing_follow:create'),
    ('INVEST_MANAGER', 'leasing_follow:update'),
    ('INVEST_MANAGER', 'leasing_follow:delete'),
    ('INVEST_MANAGER', 'leasing_visit:read'),
    ('INVEST_MANAGER', 'leasing_visit:create'),
    ('INVEST_MANAGER', 'leasing_visit:update'),
    ('INVEST_MANAGER', 'leasing_visit:delete'),
    ('INVEST_MANAGER', 'leasing_quote:read'),
    ('INVEST_MANAGER', 'leasing_quote:create'),
    ('INVEST_MANAGER', 'leasing_quote:update'),
    ('INVEST_MANAGER', 'leasing_quote:delete'),
    ('INVEST_MANAGER', 'leasing_quote:submit'),
    ('INVEST_MANAGER', 'leasing_quote:approve'),
    ('INVEST_MANAGER', 'leasing_quote:reject'),
    ('INVEST_MANAGER', 'leasing_quote:create_contract'),
    ('INVEST_MANAGER', 'leasing_contract:read'),
    ('INVEST_MANAGER', 'leasing_contract:create'),
    ('INVEST_MANAGER', 'leasing_contract:update'),
    ('INVEST_MANAGER', 'leasing_contract:submit'),
    ('INVEST_MANAGER', 'leasing_contract:approve'),
    ('INVEST_MANAGER', 'leasing_contract:reject'),
    ('INVEST_MANAGER', 'leasing_contract:archive'),
    ('INVEST_MANAGER', 'leasing_contract:renew'),
    ('INVEST_MANAGER', 'leasing_contract:status_log'),
    ('INVEST_MANAGER', 'leasing_contract:action_log'),
    ('INVEST_MANAGER', 'leasing_contract:file_read'),
    ('INVEST_MANAGER', 'leasing_contract_unit:read'),
    ('INVEST_MANAGER', 'leasing_contract_unit:create'),
    ('INVEST_MANAGER', 'leasing_contract_unit:update'),
    ('INVEST_MANAGER', 'leasing_contract_unit:delete'),
    ('INVEST_MANAGER', 'leasing_contract:recalculate'),
    ('INVEST_MANAGER', 'leasing_contract_change:read'),
    ('INVEST_MANAGER', 'leasing_contract_change:create'),
    ('INVEST_MANAGER', 'leasing_contract_change:update'),
    ('INVEST_MANAGER', 'leasing_contract_change:delete'),
    ('INVEST_MANAGER', 'leasing_contract_change:preview'),
    ('INVEST_MANAGER', 'leasing_contract_change:submit'),
    ('INVEST_MANAGER', 'leasing_contract_change:approve'),
    ('INVEST_MANAGER', 'leasing_contract_change:reject'),
    ('INVEST_MANAGER', 'leasing_contract_change:effective'),
    ('INVEST_MANAGER', 'leasing_checkout:read'),
    ('INVEST_MANAGER', 'leasing_checkout:create'),
    ('INVEST_MANAGER', 'leasing_checkout:update'),
    ('INVEST_MANAGER', 'leasing_checkout:delete'),
    ('INVEST_MANAGER', 'leasing_checkout:submit'),
    ('INVEST_MANAGER', 'leasing_checkout:approve'),
    ('INVEST_MANAGER', 'leasing_checkout:reject'),
    ('INVEST_MANAGER', 'leasing_checkout:preview_settlement'),
    ('INVEST_MANAGER', 'leasing_refund:read'),
    ('INVEST_MANAGER', 'leasing_receivable:read'),
    ('INVEST_MANAGER', 'leasing_payment:read'),
    ('INVEST_MANAGER', 'leasing_invoice:read'),
    ('INVEST_MANAGER', 'leasing_statistics:funnel'),
    ('INVEST_SPECIALIST', 'park_tenant:read'),
    ('INVEST_SPECIALIST', 'park_tenant:create'),
    ('INVEST_SPECIALIST', 'park_tenant:update'),
    ('INVEST_SPECIALIST', 'park_tenant:360'),
    ('INVEST_SPECIALIST', 'park_tenant_contact:read'),
    ('INVEST_SPECIALIST', 'park_tenant_contact:create'),
    ('INVEST_SPECIALIST', 'park_tenant_contact:update'),
    ('INVEST_SPECIALIST', 'park_tenant_qualification:read'),
    ('INVEST_SPECIALIST', 'leasing_lead:read'),
    ('INVEST_SPECIALIST', 'leasing_lead:create'),
    ('INVEST_SPECIALIST', 'leasing_lead:update'),
    ('INVEST_SPECIALIST', 'leasing_lead:change_status'),
    ('INVEST_SPECIALIST', 'leasing_lead:status_log'),
    ('INVEST_SPECIALIST', 'leasing_lead_pool:read'),
    ('INVEST_SPECIALIST', 'leasing_lead:reclaim'),
    ('INVEST_SPECIALIST', 'leasing_follow:read'),
    ('INVEST_SPECIALIST', 'leasing_follow:create'),
    ('INVEST_SPECIALIST', 'leasing_follow:update'),
    ('INVEST_SPECIALIST', 'leasing_follow:delete'),
    ('INVEST_SPECIALIST', 'leasing_visit:read'),
    ('INVEST_SPECIALIST', 'leasing_visit:create'),
    ('INVEST_SPECIALIST', 'leasing_visit:update'),
    ('INVEST_SPECIALIST', 'leasing_visit:delete'),
    ('INVEST_SPECIALIST', 'leasing_quote:read'),
    ('INVEST_SPECIALIST', 'leasing_quote:create'),
    ('INVEST_SPECIALIST', 'leasing_quote:update'),
    ('INVEST_SPECIALIST', 'leasing_quote:delete'),
    ('INVEST_SPECIALIST', 'leasing_quote:submit'),
    ('INVEST_SPECIALIST', 'leasing_quote:create_contract'),
    ('INVEST_SPECIALIST', 'leasing_contract:read'),
    ('INVEST_SPECIALIST', 'leasing_contract:create'),
    ('INVEST_SPECIALIST', 'leasing_contract:update'),
    ('INVEST_SPECIALIST', 'leasing_contract:submit'),
    ('INVEST_SPECIALIST', 'leasing_contract:renew'),
    ('INVEST_SPECIALIST', 'leasing_contract:status_log'),
    ('INVEST_SPECIALIST', 'leasing_contract:action_log'),
    ('INVEST_SPECIALIST', 'leasing_contract:file_read'),
    ('INVEST_SPECIALIST', 'leasing_contract_unit:read'),
    ('INVEST_SPECIALIST', 'leasing_contract_unit:create'),
    ('INVEST_SPECIALIST', 'leasing_contract_unit:update'),
    ('INVEST_SPECIALIST', 'leasing_contract_unit:delete'),
    ('INVEST_SPECIALIST', 'leasing_contract:recalculate'),
    ('INVEST_SPECIALIST', 'leasing_contract_change:read'),
    ('INVEST_SPECIALIST', 'leasing_contract_change:create'),
    ('INVEST_SPECIALIST', 'leasing_contract_change:update'),
    ('INVEST_SPECIALIST', 'leasing_contract_change:preview'),
    ('INVEST_SPECIALIST', 'leasing_contract_change:submit'),
    ('INVEST_SPECIALIST', 'leasing_checkout:read'),
    ('INVEST_SPECIALIST', 'leasing_checkout:create'),
    ('INVEST_SPECIALIST', 'leasing_checkout:update'),
    ('INVEST_SPECIALIST', 'leasing_checkout:submit'),
    ('INVEST_SPECIALIST', 'leasing_checkout:preview_settlement'),
    ('INVEST_SPECIALIST', 'leasing_receivable:read'),
    ('INVEST_SPECIALIST', 'leasing_statistics:funnel'),
    ('FINANCE_MANAGER', 'leasing_contract:read'),
    ('FINANCE_MANAGER', 'park_tenant:read'),
    ('FINANCE_MANAGER', 'park_tenant:360'),
    ('FINANCE_MANAGER', 'park_tenant_contact:read'),
    ('FINANCE_MANAGER', 'park_tenant_qualification:read'),
    ('FINANCE_MANAGER', 'leasing_contract:approve'),
    ('FINANCE_MANAGER', 'leasing_contract:reject'),
    ('FINANCE_MANAGER', 'leasing_contract:status_log'),
    ('FINANCE_MANAGER', 'leasing_contract:action_log'),
    ('FINANCE_MANAGER', 'leasing_contract:file_read'),
    ('FINANCE_MANAGER', 'leasing_contract_change:read'),
    ('FINANCE_MANAGER', 'leasing_contract_change:preview'),
    ('FINANCE_MANAGER', 'leasing_contract_change:approve'),
    ('FINANCE_MANAGER', 'leasing_contract_change:reject'),
    ('FINANCE_MANAGER', 'leasing_contract_change:effective'),
    ('FINANCE_MANAGER', 'leasing_checkout:read'),
    ('FINANCE_MANAGER', 'leasing_checkout:approve'),
    ('FINANCE_MANAGER', 'leasing_checkout:reject'),
    ('FINANCE_MANAGER', 'leasing_checkout:preview_settlement'),
    ('FINANCE_MANAGER', 'leasing_checkout:confirm_settlement'),
    ('FINANCE_MANAGER', 'leasing_checkout:effective'),
    ('FINANCE_MANAGER', 'leasing_refund:read'),
    ('FINANCE_MANAGER', 'leasing_refund:create'),
    ('FINANCE_MANAGER', 'leasing_receivable:read'),
    ('FINANCE_MANAGER', 'leasing_receivable:create'),
    ('FINANCE_MANAGER', 'leasing_receivable:update'),
    ('FINANCE_MANAGER', 'leasing_receivable:delete'),
    ('FINANCE_MANAGER', 'leasing_receivable:generate'),
    ('FINANCE_MANAGER', 'leasing_receivable:generate_batch'),
    ('FINANCE_MANAGER', 'leasing_receivable:overdue'),
    ('FINANCE_MANAGER', 'leasing_receivable:aging'),
    ('FINANCE_MANAGER', 'leasing_receivable:status_log'),
    ('FINANCE_MANAGER', 'leasing_payment:read'),
    ('FINANCE_MANAGER', 'leasing_payment:create'),
    ('FINANCE_MANAGER', 'leasing_payment:update'),
    ('FINANCE_MANAGER', 'leasing_payment:delete'),
    ('FINANCE_MANAGER', 'leasing_payment:apply'),
    ('FINANCE_MANAGER', 'leasing_waiver:read'),
    ('FINANCE_MANAGER', 'leasing_waiver:create'),
    ('FINANCE_MANAGER', 'leasing_waiver:approve'),
    ('FINANCE_MANAGER', 'leasing_waiver:reject'),
    ('FINANCE_MANAGER', 'leasing_invoice:read'),
    ('FINANCE_MANAGER', 'leasing_invoice:create'),
    ('FINANCE_MANAGER', 'leasing_invoice:update'),
    ('FINANCE_MANAGER', 'leasing_invoice:delete'),
    ('FINANCE_MANAGER', 'workorder:read'),
    ('FINANCE_SPECIALIST', 'leasing_contract:read'),
    ('FINANCE_SPECIALIST', 'park_tenant:read'),
    ('FINANCE_SPECIALIST', 'park_tenant:360'),
    ('FINANCE_SPECIALIST', 'park_tenant_contact:read'),
    ('FINANCE_SPECIALIST', 'park_tenant_qualification:read'),
    ('FINANCE_SPECIALIST', 'leasing_contract:status_log'),
    ('FINANCE_SPECIALIST', 'leasing_contract:action_log'),
    ('FINANCE_SPECIALIST', 'leasing_contract:file_read'),
    ('FINANCE_SPECIALIST', 'leasing_contract_change:read'),
    ('FINANCE_SPECIALIST', 'leasing_contract_change:preview'),
    ('FINANCE_SPECIALIST', 'leasing_checkout:read'),
    ('FINANCE_SPECIALIST', 'leasing_checkout:preview_settlement'),
    ('FINANCE_SPECIALIST', 'leasing_refund:read'),
    ('FINANCE_SPECIALIST', 'leasing_refund:create'),
    ('FINANCE_SPECIALIST', 'leasing_receivable:read'),
    ('FINANCE_SPECIALIST', 'leasing_receivable:create'),
    ('FINANCE_SPECIALIST', 'leasing_receivable:update'),
    ('FINANCE_SPECIALIST', 'leasing_receivable:generate'),
    ('FINANCE_SPECIALIST', 'leasing_receivable:generate_batch'),
    ('FINANCE_SPECIALIST', 'leasing_receivable:overdue'),
    ('FINANCE_SPECIALIST', 'leasing_receivable:aging'),
    ('FINANCE_SPECIALIST', 'leasing_receivable:status_log'),
    ('FINANCE_SPECIALIST', 'leasing_payment:read'),
    ('FINANCE_SPECIALIST', 'leasing_payment:create'),
    ('FINANCE_SPECIALIST', 'leasing_payment:update'),
    ('FINANCE_SPECIALIST', 'leasing_payment:apply'),
    ('FINANCE_SPECIALIST', 'leasing_waiver:read'),
    ('FINANCE_SPECIALIST', 'leasing_waiver:create'),
    ('FINANCE_SPECIALIST', 'leasing_invoice:read'),
    ('FINANCE_SPECIALIST', 'leasing_invoice:create'),
    ('FINANCE_SPECIALIST', 'leasing_invoice:update'),
    ('SAFETY_MANAGER', 'park_tenant:read'),
    ('SAFETY_MANAGER', 'park_tenant:360'),
    ('SAFETY_MANAGER', 'park_tenant:risk_update'),
    ('SAFETY_MANAGER', 'park_tenant:risk_log'),
    ('SAFETY_MANAGER', 'park_tenant_contact:read'),
    ('SAFETY_MANAGER', 'park_tenant_qualification:read'),
    ('SAFETY_MANAGER', 'file:upload'),
    ('SAFETY_MANAGER', 'workorder:read'),
    ('SAFETY_MANAGER', 'workorder:create'),
    ('SAFETY_MANAGER', 'workorder:stats'),
    ('SAFETY_MANAGER', 'workorder_log:read'),
    ('PROPERTY_MANAGER', 'park_tenant:read'),
    ('PROPERTY_MANAGER', 'park_tenant:360'),
    ('PROPERTY_MANAGER', 'park_tenant_contact:read'),
    ('PROPERTY_MANAGER', 'file:read'),
    ('PROPERTY_MANAGER', 'file:upload'),
    ('PROPERTY_MANAGER', 'file:download'),
    ('PROPERTY_MANAGER', 'leasing_checkout:read'),
    ('PROPERTY_MANAGER', 'leasing_contract:action_log'),
    ('PROPERTY_MANAGER', 'workorder:read'),
    ('PROPERTY_MANAGER', 'workorder:create'),
    ('PROPERTY_MANAGER', 'workorder:update'),
    ('PROPERTY_MANAGER', 'workorder:assign'),
    ('PROPERTY_MANAGER', 'workorder:reassign'),
    ('PROPERTY_MANAGER', 'workorder:close'),
    ('PROPERTY_MANAGER', 'workorder:cancel'),
    ('PROPERTY_MANAGER', 'workorder:reject'),
    ('PROPERTY_MANAGER', 'workorder_sla:read'),
    ('PROPERTY_MANAGER', 'workorder_sla:create'),
    ('PROPERTY_MANAGER', 'workorder_sla:update'),
    ('PROPERTY_MANAGER', 'workorder_sla:delete'),
    ('PROPERTY_MANAGER', 'workorder:overdue'),
    ('PROPERTY_MANAGER', 'workorder:stats'),
    ('PROPERTY_MANAGER', 'workorder_log:read'),
    ('PROPERTY_MANAGER', 'workorder:manage_all'),
    ('PROPERTY_STAFF', 'workorder:read'),
    ('PROPERTY_STAFF', 'workorder:create'),
    ('PROPERTY_STAFF', 'workorder:assign'),
    ('PROPERTY_STAFF', 'workorder:reassign'),
    ('PROPERTY_STAFF', 'workorder:confirm'),
    ('PROPERTY_STAFF', 'workorder:evaluate'),
    ('PROPERTY_STAFF', 'workorder:cancel'),
    ('PROPERTY_STAFF', 'file:read'),
    ('PROPERTY_STAFF', 'file:upload'),
    ('PROPERTY_STAFF', 'file:download'),
    ('PROPERTY_STAFF', 'workorder_log:read'),
    ('MAINTENANCE_ENGINEER', 'workorder:read'),
    ('MAINTENANCE_ENGINEER', 'workorder:accept'),
    ('MAINTENANCE_ENGINEER', 'workorder:start'),
    ('MAINTENANCE_ENGINEER', 'workorder:wait_material'),
    ('MAINTENANCE_ENGINEER', 'workorder:finish'),
    ('MAINTENANCE_ENGINEER', 'workorder:return'),
    ('MAINTENANCE_ENGINEER', 'file:read'),
    ('MAINTENANCE_ENGINEER', 'file:upload'),
    ('MAINTENANCE_ENGINEER', 'file:download'),
    ('MAINTENANCE_ENGINEER', 'workorder_log:read'),
    ('MAINTENANCE_ENGINEER', 'workorder_log:create')
)
UPDATE rel_role_perm relation
SET is_deleted = true,
    update_time = now()
FROM sys_role role
JOIN seed_scope
  ON seed_scope.tenant_id = role.tenant_id
 AND seed_scope.park_id = role.park_id
JOIN managed_roles ON managed_roles.role_code = role.code
JOIN sys_permission permission
  ON permission.tenant_id = role.tenant_id
 AND permission.park_id = role.park_id
 AND permission.is_deleted = false
JOIN s3a_permissions ON s3a_permissions.permission_code = permission.code
WHERE relation.tenant_id = role.tenant_id
  AND relation.park_id = role.park_id
  AND relation.role_id = role.id
  AND relation.permission_id = permission.id
  AND relation.is_deleted = false
  AND NOT EXISTS (
    SELECT 1
    FROM desired_role_permissions desired
    WHERE desired.role_code = role.code
      AND desired.permission_code = permission.code
  );

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
role_permissions AS (
  SELECT role.id AS role_id, permission.id AS permission_id, role.tenant_id, role.park_id
  FROM sys_role role
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.is_deleted = false
  JOIN seed_scope
    ON seed_scope.tenant_id = role.tenant_id
   AND seed_scope.park_id = role.park_id
  WHERE role.code = 'SUPER_ADMIN'
    AND role.is_deleted = false
  UNION ALL
  SELECT role.id AS role_id, permission.id AS permission_id, role.tenant_id, role.park_id
  FROM sys_role role
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.is_deleted = false
  JOIN seed_scope
    ON seed_scope.tenant_id = role.tenant_id
   AND seed_scope.park_id = role.park_id
  WHERE role.code = 'SYSTEM_ADMIN'
    AND role.is_deleted = false
    AND permission.code <> 'system:tenant'
    AND (
      permission.code = 'system'
      OR
      permission.code LIKE 'system:%'
      OR permission.code LIKE 'asset:%'
      OR permission.code LIKE 'park:%'
      OR permission.code LIKE 'building:%'
      OR permission.code LIKE 'floor:%'
      OR permission.code LIKE 'unit:%'
      OR permission.code IN ('file:read', 'file:upload', 'file:download', 'file:delete')
    )
  UNION ALL
  SELECT role.id AS role_id, permission.id AS permission_id, role.tenant_id, role.park_id
  FROM sys_role role
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.is_deleted = false
  JOIN seed_scope
    ON seed_scope.tenant_id = role.tenant_id
   AND seed_scope.park_id = role.park_id
  WHERE role.code = 'AUDITOR'
    AND role.is_deleted = false
    AND permission.code IN ('system', 'system:audit', 'system:audit-login-log', 'system:user:me', 'audit:read', 'system:audit:login-log:list', 'system:audit:op-log:list')
  UNION ALL
  SELECT role.id AS role_id, permission.id AS permission_id, role.tenant_id, role.park_id
  FROM sys_role role
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.is_deleted = false
  JOIN seed_scope
    ON seed_scope.tenant_id = role.tenant_id
   AND seed_scope.park_id = role.park_id
  WHERE role.code = 'OPERATIONS_OWNER'
    AND role.is_deleted = false
    AND permission.code IN (
      'system:user:me',
      'system:dict-type:list',
      'system:dict-item:list',
      'file:read',
      'file:upload',
	      'file:download',
	      'file:delete',
	      'asset',
	      'asset:park',
	      'asset:building',
	      'asset:floor',
	      'asset:unit',
	      'asset:unit-status-board',
	      'asset:statistics-page',
	      'park:read',
	      'building:read',
	      'building:create',
      'building:update',
      'floor:read',
      'floor:create',
      'floor:update',
      'unit:read',
      'unit:create',
      'unit:update',
      'unit:change_status',
      'unit:force_change_status',
      'unit:status_log',
      'unit:import',
      'unit:import_template',
      'unit:export',
      'park_tenant:read',
      'park_tenant:360',
      'park_tenant:create',
      'park_tenant:update',
      'park_tenant:delete',
      'park_tenant:risk_update',
      'park_tenant:risk_log',
      'park_tenant_contact:read',
      'park_tenant_contact:create',
      'park_tenant_contact:update',
      'park_tenant_contact:delete',
      'park_tenant_qualification:read',
      'park_tenant_qualification:create',
      'park_tenant_qualification:update',
      'park_tenant_qualification:delete',
      'leasing_lead:read',
      'leasing_lead:create',
      'leasing_lead:update',
      'leasing_lead:delete',
      'leasing_lead:change_status',
      'leasing_lead:force_change_status',
      'leasing_lead:confirm_sign',
      'leasing_lead:status_log',
      'leasing_lead:convert_to_park_tenant',
      'leasing_lead_pool:read',
      'leasing_lead:assign',
      'leasing_lead:reclaim',
      'leasing_lead:move_to_pool',
      'leasing_follow:read',
      'leasing_follow:create',
      'leasing_follow:update',
      'leasing_follow:delete',
      'leasing_visit:read',
      'leasing_visit:create',
      'leasing_visit:update',
      'leasing_visit:delete',
      'leasing_quote:read',
      'leasing_quote:create',
      'leasing_quote:update',
      'leasing_quote:delete',
      'leasing_quote:submit',
      'leasing_quote:approve',
      'leasing_quote:reject',
      'leasing_quote:create_contract',
      'leasing_contract:read',
      'leasing_contract:create',
      'leasing_contract:update',
      'leasing_contract:delete',
      'leasing_contract:submit',
      'leasing_contract:approve',
      'leasing_contract:reject',
      'leasing_contract:archive',
      'leasing_contract:status_log',
      'leasing_contract:action_log',
      'leasing_contract:file_read',
      'leasing_contract_unit:read',
      'leasing_contract_unit:create',
      'leasing_contract_unit:update',
      'leasing_contract_unit:delete',
      'leasing_contract:recalculate',
      'leasing_contract:override_area',
      'leasing_contract:force_bind_unit',
      'leasing_contract:edit_after_submit',
      'leasing_contract_change:read',
      'leasing_contract_change:create',
      'leasing_contract_change:update',
      'leasing_contract_change:delete',
      'leasing_contract_change:preview',
      'leasing_contract_change:submit',
      'leasing_contract_change:approve',
      'leasing_contract_change:reject',
      'leasing_contract_change:effective',
      'leasing_checkout:read',
      'leasing_checkout:create',
      'leasing_checkout:update',
      'leasing_checkout:delete',
      'leasing_checkout:submit',
      'leasing_checkout:approve',
      'leasing_checkout:reject',
      'leasing_checkout:preview_settlement',
      'leasing_checkout:confirm_settlement',
      'leasing_checkout:effective',
      'leasing_refund:read',
      'leasing_refund:create',
      'leasing_receivable:read',
      'leasing_receivable:create',
      'leasing_receivable:update',
      'leasing_receivable:delete',
      'leasing_receivable:generate',
      'leasing_receivable:generate_batch',
      'leasing_receivable:overdue',
      'leasing_receivable:aging',
      'leasing_receivable:status_log',
      'leasing_payment:read',
      'leasing_payment:create',
      'leasing_payment:update',
      'leasing_payment:delete',
      'leasing_payment:apply',
      'leasing_waiver:read',
      'leasing_waiver:create',
      'leasing_waiver:approve',
      'leasing_waiver:reject',
      'leasing_invoice:read',
      'leasing_invoice:create',
      'leasing_invoice:update',
      'leasing_invoice:delete',
      'leasing_statistics:funnel',
      'asset:read',
      'asset:status_board',
      'asset:statistics',
      'workorder_sla:read',
      'workorder_sla:create',
      'workorder_sla:update',
      'workorder_sla:delete',
      'workorder:recalculate_overdue',
      'workorder:overdue',
      'workorder:stats',
      'workorder_log:read',
      'workorder_log:create'
    )
  UNION ALL
  SELECT role.id AS role_id, permission.id AS permission_id, role.tenant_id, role.park_id
  FROM sys_role role
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.is_deleted = false
  JOIN seed_scope
    ON seed_scope.tenant_id = role.tenant_id
   AND seed_scope.park_id = role.park_id
  WHERE role.code = 'EXECUTIVE'
    AND role.is_deleted = false
    AND permission.code IN (
	      'system:user:me',
	      'system:dict-type:list',
	      'system:dict-item:list',
	      'asset',
	      'asset:read',
	      'asset:status_board',
	      'asset:statistics',
	      'asset:unit-status-board',
	      'asset:statistics-page',
	      'unit:read',
	      'unit:status_log',
      'file:read',
      'file:download',
      'park_tenant:read',
      'park_tenant:360',
      'park_tenant:risk_log',
      'leasing_lead:read',
      'leasing_lead:status_log',
      'leasing_quote:read',
      'leasing_contract:read',
      'leasing_contract:status_log',
      'leasing_contract:action_log',
      'leasing_contract:file_read',
      'leasing_contract_unit:read',
      'leasing_contract_change:read',
      'leasing_contract_change:preview',
      'leasing_checkout:read',
      'leasing_checkout:preview_settlement',
      'leasing_refund:read',
      'leasing_refund:create',
      'leasing_receivable:read',
      'leasing_receivable:aging',
      'leasing_receivable:status_log',
      'leasing_payment:read',
      'leasing_waiver:read',
      'leasing_invoice:read',
      'leasing_statistics:funnel'
    )
  UNION ALL
  SELECT role.id AS role_id, permission.id AS permission_id, role.tenant_id, role.park_id
  FROM sys_role role
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.is_deleted = false
  JOIN seed_scope
    ON seed_scope.tenant_id = role.tenant_id
   AND seed_scope.park_id = role.park_id
  WHERE role.code = 'INVEST_MANAGER'
    AND role.is_deleted = false
    AND permission.code IN (
      'system:user:me',
      'system:dict-type:list',
      'system:dict-item:list',
      'file:read',
      'file:upload',
      'file:download',
      'unit:read',
      'unit:change_status',
      'unit:status_log',
      'park_tenant:read',
      'park_tenant:360',
      'park_tenant:create',
      'park_tenant:update',
      'park_tenant:risk_log',
      'park_tenant_contact:read',
      'park_tenant_contact:create',
      'park_tenant_contact:update',
      'park_tenant_qualification:read',
      'leasing_lead:read',
      'leasing_lead:create',
      'leasing_lead:update',
      'leasing_lead:delete',
      'leasing_lead:change_status',
      'leasing_lead:confirm_sign',
      'leasing_lead:status_log',
      'leasing_lead:convert_to_park_tenant',
      'leasing_lead_pool:read',
      'leasing_lead:assign',
      'leasing_lead:reclaim',
      'leasing_lead:move_to_pool',
      'leasing_follow:read',
      'leasing_follow:create',
      'leasing_follow:update',
      'leasing_follow:delete',
      'leasing_visit:read',
      'leasing_visit:create',
      'leasing_visit:update',
      'leasing_visit:delete',
      'leasing_quote:read',
      'leasing_quote:create',
      'leasing_quote:update',
      'leasing_quote:delete',
      'leasing_quote:submit',
      'leasing_quote:approve',
      'leasing_quote:reject',
      'leasing_quote:create_contract',
      'leasing_contract:read',
      'leasing_contract:create',
      'leasing_contract:update',
      'leasing_contract:submit',
      'leasing_contract:approve',
      'leasing_contract:reject',
      'leasing_contract:archive',
      'leasing_contract:status_log',
      'leasing_contract:action_log',
      'leasing_contract:file_read',
      'leasing_contract_unit:read',
      'leasing_contract_unit:create',
      'leasing_contract_unit:update',
      'leasing_contract_unit:delete',
      'leasing_contract:recalculate',
      'leasing_contract_change:read',
      'leasing_contract_change:create',
      'leasing_contract_change:update',
      'leasing_contract_change:delete',
      'leasing_contract_change:preview',
      'leasing_contract_change:submit',
      'leasing_contract_change:approve',
      'leasing_contract_change:reject',
      'leasing_contract_change:effective',
      'leasing_checkout:read',
      'leasing_checkout:create',
      'leasing_checkout:update',
      'leasing_checkout:delete',
      'leasing_checkout:submit',
      'leasing_checkout:approve',
      'leasing_checkout:reject',
      'leasing_checkout:preview_settlement',
      'leasing_refund:read',
      'leasing_receivable:read',
      'leasing_payment:read',
      'leasing_invoice:read',
      'leasing_statistics:funnel',
      'asset:read',
      'asset:statistics',
      'asset:status_board'
    )
  UNION ALL
  SELECT role.id AS role_id, permission.id AS permission_id, role.tenant_id, role.park_id
  FROM sys_role role
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.is_deleted = false
  JOIN seed_scope
    ON seed_scope.tenant_id = role.tenant_id
   AND seed_scope.park_id = role.park_id
  WHERE role.code = 'INVEST_SPECIALIST'
    AND role.is_deleted = false
    AND permission.code IN (
      'system:user:me',
      'system:dict-type:list',
	      'system:dict-item:list',
	      'file:read',
	      'file:download',
	      'asset',
	      'asset:status_board',
	      'asset:unit-status-board',
	      'unit:read',
      'park_tenant:read',
      'park_tenant:360',
      'park_tenant:create',
      'park_tenant:update',
      'park_tenant_contact:read',
      'park_tenant_contact:create',
      'park_tenant_contact:update',
      'park_tenant_qualification:read',
      'leasing_lead:read',
      'leasing_lead:create',
      'leasing_lead:update',
      'leasing_lead:change_status',
      'leasing_lead:status_log',
      'leasing_lead_pool:read',
      'leasing_lead:reclaim',
      'leasing_follow:read',
      'leasing_follow:create',
      'leasing_follow:update',
      'leasing_follow:delete',
      'leasing_visit:read',
      'leasing_visit:create',
      'leasing_visit:update',
      'leasing_visit:delete',
      'leasing_quote:read',
      'leasing_quote:create',
      'leasing_quote:update',
      'leasing_quote:delete',
      'leasing_quote:submit',
      'leasing_quote:create_contract',
      'leasing_contract:read',
      'leasing_contract:create',
      'leasing_contract:update',
      'leasing_contract:submit',
      'leasing_contract:status_log',
      'leasing_contract:action_log',
      'leasing_contract:file_read',
      'leasing_contract_unit:read',
      'leasing_contract_unit:create',
      'leasing_contract_unit:update',
      'leasing_contract_unit:delete',
      'leasing_contract:recalculate',
      'leasing_contract_change:read',
      'leasing_contract_change:create',
      'leasing_contract_change:update',
      'leasing_contract_change:preview',
      'leasing_contract_change:submit',
      'leasing_checkout:read',
      'leasing_checkout:create',
      'leasing_checkout:update',
      'leasing_checkout:submit',
      'leasing_checkout:preview_settlement',
      'leasing_receivable:read',
      'leasing_statistics:funnel'
    )
  UNION ALL
  SELECT role.id AS role_id, permission.id AS permission_id, role.tenant_id, role.park_id
  FROM sys_role role
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.is_deleted = false
  JOIN seed_scope
    ON seed_scope.tenant_id = role.tenant_id
   AND seed_scope.park_id = role.park_id
  WHERE role.code = 'FINANCE_MANAGER'
    AND role.is_deleted = false
    AND permission.code IN (
      'system:user:me',
      'system:dict-type:list',
      'system:dict-item:list',
      'file:read',
      'file:download',
      'park_tenant:read',
      'park_tenant:360',
      'park_tenant_contact:read',
      'park_tenant_qualification:read',
      'leasing_contract:read',
      'leasing_contract:approve',
      'leasing_contract:reject',
      'leasing_contract:status_log',
      'leasing_contract:action_log',
      'leasing_contract:file_read',
      'leasing_contract_change:read',
      'leasing_contract_change:preview',
      'leasing_contract_change:approve',
      'leasing_contract_change:reject',
      'leasing_checkout:read',
      'leasing_checkout:approve',
      'leasing_checkout:reject',
      'leasing_checkout:preview_settlement',
      'leasing_checkout:confirm_settlement',
      'leasing_checkout:effective',
      'leasing_refund:read',
      'leasing_refund:create',
      'leasing_receivable:read',
      'leasing_receivable:create',
      'leasing_receivable:update',
      'leasing_receivable:delete',
      'leasing_receivable:generate',
      'leasing_receivable:generate_batch',
      'leasing_receivable:overdue',
      'leasing_receivable:aging',
      'leasing_receivable:status_log',
      'leasing_payment:read',
      'leasing_payment:create',
      'leasing_payment:update',
      'leasing_payment:delete',
      'leasing_payment:apply',
      'leasing_waiver:read',
      'leasing_waiver:create',
      'leasing_waiver:approve',
      'leasing_waiver:reject',
      'leasing_invoice:read',
      'leasing_invoice:create',
      'leasing_invoice:update',
      'leasing_invoice:delete'
    )
  UNION ALL
  SELECT role.id AS role_id, permission.id AS permission_id, role.tenant_id, role.park_id
  FROM sys_role role
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.is_deleted = false
  JOIN seed_scope
    ON seed_scope.tenant_id = role.tenant_id
   AND seed_scope.park_id = role.park_id
  WHERE role.code = 'FINANCE_SPECIALIST'
    AND role.is_deleted = false
    AND permission.code IN (
      'system:user:me',
      'system:dict-type:list',
      'system:dict-item:list',
      'file:read',
      'file:download',
      'park_tenant:read',
      'park_tenant:360',
      'park_tenant_contact:read',
      'park_tenant_qualification:read',
      'leasing_contract:read',
      'leasing_contract:status_log',
      'leasing_contract:action_log',
      'leasing_contract:file_read',
      'leasing_contract_change:read',
      'leasing_contract_change:preview',
      'leasing_checkout:read',
      'leasing_checkout:preview_settlement',
      'leasing_refund:read',
      'leasing_receivable:read',
      'leasing_receivable:create',
      'leasing_receivable:update',
      'leasing_receivable:generate',
      'leasing_receivable:generate_batch',
      'leasing_receivable:overdue',
      'leasing_receivable:aging',
      'leasing_receivable:status_log',
      'leasing_payment:read',
      'leasing_payment:create',
      'leasing_payment:update',
      'leasing_payment:apply',
      'leasing_waiver:read',
      'leasing_waiver:create',
      'leasing_invoice:read',
      'leasing_invoice:create',
      'leasing_invoice:update'
    )
  UNION ALL
  SELECT role.id AS role_id, permission.id AS permission_id, role.tenant_id, role.park_id
  FROM sys_role role
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.is_deleted = false
  JOIN seed_scope
    ON seed_scope.tenant_id = role.tenant_id
   AND seed_scope.park_id = role.park_id
  WHERE role.code = 'SAFETY_MANAGER'
    AND role.is_deleted = false
    AND permission.code IN (
      'system:user:me',
      'system:dict-type:list',
      'system:dict-item:list',
      'file:read',
      'file:upload',
      'file:download',
      'park_tenant:read',
      'park_tenant:360',
      'park_tenant:risk_update',
      'park_tenant:risk_log',
      'park_tenant_contact:read',
      'park_tenant_qualification:read',
      'workorder:read',
      'workorder:create',
      'workorder:stats',
      'workorder_log:read'
    )
  UNION ALL
  SELECT role.id AS role_id, permission.id AS permission_id, role.tenant_id, role.park_id
  FROM sys_role role
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.is_deleted = false
  JOIN seed_scope
    ON seed_scope.tenant_id = role.tenant_id
   AND seed_scope.park_id = role.park_id
  WHERE role.code = 'PROPERTY_MANAGER'
    AND role.is_deleted = false
    AND permission.code IN (
      'system:user:me',
      'system:dict-type:list',
      'system:dict-item:list',
      'file:read',
      'file:upload',
      'file:download',
      'park_tenant:read',
      'park_tenant:360',
      'park_tenant_contact:read',
      'workorder:read',
      'workorder:create',
      'workorder:update',
      'workorder:assign',
      'workorder:reassign',
      'workorder:close',
      'workorder:cancel',
      'workorder:reject',
      'workorder_sla:read',
      'workorder_sla:create',
      'workorder_sla:update',
      'workorder_sla:delete',
      'workorder:overdue',
      'workorder:stats',
      'workorder_log:read',
      'workorder:manage_all'
    )
  UNION ALL
  SELECT role.id AS role_id, permission.id AS permission_id, role.tenant_id, role.park_id
  FROM sys_role role
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.is_deleted = false
  JOIN seed_scope
    ON seed_scope.tenant_id = role.tenant_id
   AND seed_scope.park_id = role.park_id
  WHERE role.code = 'PROPERTY_STAFF'
    AND role.is_deleted = false
    AND permission.code IN (
      'system:user:me',
      'system:dict-type:list',
      'system:dict-item:list',
      'file:read',
      'file:upload',
      'file:download',
      'workorder:read',
      'workorder:create',
      'workorder:assign',
      'workorder:reassign',
      'workorder:confirm',
      'workorder:evaluate',
      'workorder:cancel',
      'workorder_log:read'
    )
  UNION ALL
  SELECT role.id AS role_id, permission.id AS permission_id, role.tenant_id, role.park_id
  FROM sys_role role
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.is_deleted = false
  JOIN seed_scope
    ON seed_scope.tenant_id = role.tenant_id
   AND seed_scope.park_id = role.park_id
  WHERE role.code = 'MAINTENANCE_ENGINEER'
    AND role.is_deleted = false
    AND permission.code IN (
      'system:user:me',
      'system:dict-type:list',
      'system:dict-item:list',
      'file:read',
      'file:upload',
      'file:download',
      'workorder:read',
      'workorder:accept',
      'workorder:start',
      'workorder:wait_material',
      'workorder:finish',
      'workorder:return',
      'workorder_log:read',
      'workorder_log:create'
    )
)
INSERT INTO rel_role_perm (
  tenant_id,
  park_id,
  role_id,
  permission_id,
  remark
)
SELECT
  role_permissions.tenant_id,
  role_permissions.park_id,
  role_permissions.role_id,
  role_permissions.permission_id,
  'Production-safe built-in role permission seed'
FROM role_permissions
ON CONFLICT (tenant_id, park_id, role_id, permission_id) WHERE is_deleted = false DO UPDATE SET
  is_deleted = false,
  update_time = now();

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
code_rules(entity_type, rule_code, rule_name, target_module, target_entity, prefix, pattern, date_pattern, sequence_length, reset_policy, separator, example_code, sort_remark) AS (
  VALUES
    ('park', 'PARK_CODE', '园区编码规则', 'asset', 'park', 'PK-', '{PREFIX}{SEQ:3}', NULL, 3, 'none', '', 'PK-001', 'SaaS park code rule seed'),
    ('building', 'BUILDING_CODE', '楼栋编码规则', 'asset', 'building', 'BD-', '{PREFIX}{SEQ:2}', NULL, 2, 'none', '', 'BD-01', 'SaaS building code rule seed'),
    ('floor', 'FLOOR_CODE', '楼层编码规则', 'asset', 'floor', 'FL-', '{PREFIX}{SEQ:2}', NULL, 2, 'none', '', 'FL-03', 'SaaS floor code rule seed'),
    ('room', 'ROOM_CODE', '房间编码规则', 'asset', 'room', 'ROOM-', '{PREFIX}{SEQ:4}', NULL, 4, 'none', '', 'ROOM-0301', 'SaaS room code rule seed'),
    ('unit', 'UNIT_CODE', '房源编码规则', 'asset', 'unit', 'UNIT-', '{PREFIX}{SEQ:4}', NULL, 4, 'none', '', 'UNIT-0301', 'SaaS unit code rule seed'),
    ('zone', 'ZONE_CODE', '分区编码规则', 'asset', 'zone', 'ZONE-', '{PREFIX}{SEQ:3}', NULL, 3, 'none', '', 'ZONE-001', 'SaaS zone code rule seed'),
    ('asset', 'ASSET_CODE', '资产编码规则', 'asset', 'asset', 'AST-', '{PREFIX}{SEQ:6}', NULL, 6, 'none', '', 'AST-000001', 'SaaS asset code rule seed'),
    ('device', 'DEVICE_CODE', '设备编码规则', 'iot', 'device', 'EQ-', '{PREFIX}{SEQ:6}', NULL, 6, 'none', '', 'EQ-000001', 'SaaS device code rule seed'),
    ('camera', 'CAMERA_CODE', '摄像头编码规则', 'video', 'camera', 'CAM-', '{PREFIX}{SEQ:3}', NULL, 3, 'none', '', 'CAM-001', 'SaaS camera code rule seed'),
    ('iot_point', 'IOT_POINT_CODE', 'IoT 点位编码规则', 'iot', 'iot_point', 'IOT-', '{PREFIX}{SEQ:3}', NULL, 3, 'none', '', 'IOT-001', 'SaaS IoT point code rule seed'),
    ('robot', 'ROBOT_CODE', '机器人编码规则', 'robot', 'robot', 'RB-', '{PREFIX}{SEQ:6}', NULL, 6, 'none', '', 'RB-000001', 'SaaS robot code rule seed'),
    ('cleaning_robot', 'CLEANING_ROBOT_CODE', '清洁机器人编码规则', 'robot', 'cleaning_robot', 'CLN-RB-', '{PREFIX}{SEQ:3}', NULL, 3, 'none', '', 'CLN-RB-001', 'SaaS cleaning robot code rule seed'),
    ('inspection_robot', 'INSPECTION_ROBOT_CODE', '巡检机器人编码规则', 'robot', 'inspection_robot', 'INS-RB-', '{PREFIX}{SEQ:3}', NULL, 3, 'none', '', 'INS-RB-001', 'SaaS inspection robot code rule seed'),
    ('workorder', 'WORKORDER_CODE', '工单编码规则', 'workorder', 'workorder', 'WO-', '{PREFIX}{DATE:yyyyMMdd}{SEQ:6}', 'yyyyMMdd', 6, 'daily', '', 'WO-20260515000001', 'SaaS workorder code rule seed'),
    ('workorder_log', 'WORKORDER_LOG_CODE', '工单日志编码规则', 'workorder', 'workorder_log', 'WOL-', '{PREFIX}{DATE:yyyyMM}-{SEQ:6}', 'yyyyMM', 6, 'monthly', '', 'WOL-202605-000001', 'SaaS workorder log code rule seed'),
    ('safety_inspect_point', 'SAFETY_INSPECT_POINT_CODE', '安全巡检点编码规则', 'safety', 'safety_inspect_point', 'SP-', '{PREFIX}{SEQ:6}', NULL, 6, 'none', '', 'SP-000001', 'SaaS safety inspect point code rule seed'),
    ('safety_inspect_template', 'SAFETY_INSPECT_TEMPLATE_CODE', '安全巡检模板编码规则', 'safety', 'safety_inspect_template', 'STPL-', '{PREFIX}{SEQ:6}', NULL, 6, 'none', '', 'STPL-000001', 'SaaS safety inspect template code rule seed'),
    ('safety_inspect_plan', 'SAFETY_INSPECT_PLAN_CODE', '安全巡检计划编码规则', 'safety', 'safety_inspect_plan', 'SPLAN-', '{PREFIX}{SEQ:6}', NULL, 6, 'none', '', 'SPLAN-000001', 'SaaS safety inspect plan code rule seed'),
    ('safety_inspect_task', 'SAFETY_INSPECT_TASK_CODE', '安全巡检任务编码规则', 'safety', 'safety_inspect_task', 'STASK-', '{PREFIX}{DATE:yyyyMM}-{SEQ:6}', 'yyyyMM', 6, 'monthly', '', 'STASK-202605-000001', 'SaaS safety inspect task code rule seed'),
    ('safety_hazard', 'SAFETY_HAZARD_CODE', '安全隐患编码规则', 'safety', 'safety_hazard', 'HZ-', '{PREFIX}{DATE:yyyyMM}-{SEQ:6}', 'yyyyMM', 6, 'monthly', '', 'HZ-202605-000001', 'SaaS safety hazard code rule seed'),
    ('safety_hazard_log', 'SAFETY_HAZARD_LOG_CODE', '安全隐患日志编码规则', 'safety', 'safety_hazard_log', 'HZL-', '{PREFIX}{DATE:yyyyMM}-{SEQ:6}', 'yyyyMM', 6, 'monthly', '', 'HZL-202605-000001', 'SaaS safety hazard log code rule seed'),
    ('leasing_lead', 'LEASING_LEAD_CODE', '招商线索编码规则', 'leasing', 'leasing_lead', 'LEAD-', '{PREFIX}{SEQ:6}', NULL, 6, 'none', '', 'LEAD-000001', 'SaaS leasing lead code rule seed'),
    ('contract', 'CONTRACT_CODE', '合同编码规则', 'leasing', 'contract', 'CT-', '{PREFIX}{DATE:yyyyMMdd}{SEQ:6}', 'yyyyMMdd', 6, 'daily', '', 'CT-20260515000001', 'SaaS contract code rule seed'),
    ('contract_change', 'CONTRACT_CHANGE_CODE', '合同变更编码规则', 'leasing', 'contract_change', 'CHG-', '{PREFIX}{DATE:yyyy}-{SEQ:6}', 'yyyy', 6, 'yearly', '', 'CHG-2026-000001', 'SaaS leasing contract change code rule seed'),
    ('renewal_contract', 'RENEWAL_CONTRACT_CODE', '续租合同编码规则', 'leasing', 'renewal_contract', 'REN-', '{PREFIX}{DATE:yyyy}-{SEQ:6}', 'yyyy', 6, 'yearly', '', 'REN-2026-000001', 'SaaS leasing renewal contract code rule seed'),
    ('checkout', 'CHECKOUT_CODE', '退租单编码规则', 'leasing', 'checkout', 'CHK-', '{PREFIX}{DATE:yyyy}-{SEQ:6}', 'yyyy', 6, 'yearly', '', 'CHK-2026-000001', 'SaaS leasing checkout code rule seed'),
    ('refund', 'REFUND_CODE', '退款登记编码规则', 'leasing', 'refund', 'REF-', '{PREFIX}{DATE:yyyy}-{SEQ:6}', 'yyyy', 6, 'yearly', '', 'REF-2026-000001', 'SaaS leasing refund code rule seed'),
    ('bill', 'BILL_CODE', '账单编码规则', 'finance', 'bill', 'BILL-', '{PREFIX}{DATE:yyyyMMdd}{SEQ:6}', 'yyyyMMdd', 6, 'monthly', '', 'BILL-20260515000001', 'SaaS bill code rule seed'),
    ('receivable', 'RECEIVABLE_CODE', '应收账单编码规则', 'leasing', 'receivable', 'AR-', '{PREFIX}{DATE:yyyyMM}-{SEQ:6}', 'yyyyMM', 6, 'monthly', '', 'AR-202605-000001', 'SaaS leasing receivable code rule seed'),
    ('payment', 'PAYMENT_CODE', '收款登记编码规则', 'leasing', 'payment', 'PAY-', '{PREFIX}{DATE:yyyyMM}-{SEQ:6}', 'yyyyMM', 6, 'monthly', '', 'PAY-202605-000001', 'SaaS leasing payment code rule seed'),
    ('invoice', 'INVOICE_CODE', '发票登记编码规则', 'leasing', 'invoice', 'INV-', '{PREFIX}{DATE:yyyy}-{SEQ:6}', 'yyyy', 6, 'yearly', '', 'INV-2026-000001', 'SaaS leasing invoice code rule seed'),
    ('waiver', 'WAIVER_CODE', '豁免申请编码规则', 'leasing', 'waiver', 'WV-', '{PREFIX}{DATE:yyyy}-{SEQ:6}', 'yyyy', 6, 'yearly', '', 'WV-2026-000001', 'SaaS leasing waiver code rule seed'),
    (NULL, 'PARK_TENANT_CODE', '园区租户企业编码规则', 'leasing', 'park_tenant', 'PT-', '{PREFIX}{SEQ:5}', NULL, 5, 'none', '', 'PT-00001', 'SaaS park tenant code rule seed')
)
INSERT INTO sys_code_rule (
  tenant_id,
  park_id,
  entity_type,
  rule_code,
  rule_name,
  target_module,
  target_entity,
  prefix,
  pattern,
  date_pattern,
  sequence_length,
  current_seq,
  current_sequence,
  reset_policy,
  reset_strategy,
  separator,
  example_code,
  sample_code,
  status,
  remark
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  code_rules.entity_type,
  code_rules.rule_code,
  code_rules.rule_name,
  code_rules.target_module,
  code_rules.target_entity,
  code_rules.prefix,
  code_rules.pattern,
  code_rules.date_pattern,
  code_rules.sequence_length,
  0,
  0,
  code_rules.reset_policy,
  code_rules.reset_policy,
  code_rules.separator,
  code_rules.example_code,
  code_rules.example_code,
  'enabled',
  code_rules.sort_remark
FROM code_rules
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, park_id, rule_code) WHERE is_deleted = false DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  entity_type = EXCLUDED.entity_type,
  target_module = EXCLUDED.target_module,
  target_entity = EXCLUDED.target_entity,
  prefix = EXCLUDED.prefix,
  pattern = EXCLUDED.pattern,
  date_pattern = EXCLUDED.date_pattern,
  sequence_length = EXCLUDED.sequence_length,
  reset_policy = EXCLUDED.reset_policy,
  reset_strategy = EXCLUDED.reset_strategy,
  separator = EXCLUDED.separator,
  example_code = EXCLUDED.example_code,
  sample_code = EXCLUDED.sample_code,
  status = 'enabled',
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
sla_rules(wo_type, urgency, priority, dispatch_sla_min, finish_sla_min, escalate_role_code, remark) AS (
  VALUES
    ('repair', 'urgent', 'high', 5, 30, 'PROPERTY_MANAGER', 'Production-safe urgent repair SLA rule seed'),
    ('repair', 'normal', 'medium', 30, 240, 'PROPERTY_MANAGER', 'Production-safe normal repair SLA rule seed'),
    ('complaint', 'normal', 'medium', 30, 1440, 'PROPERTY_MANAGER', 'Production-safe complaint SLA rule seed'),
    ('consultation', 'normal', 'low', 30, 1440, 'PROPERTY_MANAGER', 'Production-safe consultation SLA rule seed')
)
INSERT INTO biz_work_order_sla_rule (
  tenant_id,
  park_id,
  wo_type,
  urgency,
  priority,
  dispatch_sla_min,
  finish_sla_min,
  escalate_role_code,
  status,
  remark
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  sla_rules.wo_type,
  sla_rules.urgency,
  sla_rules.priority,
  sla_rules.dispatch_sla_min,
  sla_rules.finish_sla_min,
  sla_rules.escalate_role_code,
  'enabled',
  sla_rules.remark
FROM seed_scope
CROSS JOIN sla_rules
ON CONFLICT (tenant_id, park_id, wo_type, urgency, priority) WHERE is_deleted = false DO UPDATE SET
  dispatch_sla_min = EXCLUDED.dispatch_sla_min,
  finish_sla_min = EXCLUDED.finish_sla_min,
  escalate_role_code = EXCLUDED.escalate_role_code,
  status = 'enabled',
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
modules(module_code, module_name, module_group, module_version, route_path, permission_code, icon_key, sort_no, remark) AS (
  VALUES
    ('SYSTEM_FOUNDATION', '系统基础', 'system', '1.0.0', '/system/users', 'system:read', 'shield-check', 10, 'SaaS baseline system module'),
    ('RBAC_CENTER', '权限中心', 'system', '1.0.0', '/system/roles', 'role:read', 'shield-check', 20, 'SaaS RBAC module'),
    ('CODE_RULE_CENTER', '编码规则', 'system', '1.0.0', '/system/code-rules', 'system:code-rule:read', 'binary', 30, 'SaaS code rule module'),
    ('MODULE_AUTH_CENTER', '模块授权', 'system', '1.0.0', '/system/modules', 'system:module:read', 'boxes', 40, 'SaaS module authorization module'),
    ('ASSET_FOUNDATION', '资产主数据', 'asset', '1.0.0', '/assets/parks', 'asset:read', 'building-2', 100, 'S2-A asset foundation module')
),
upsert_modules AS (
  INSERT INTO sys_module_registry (
    tenant_id,
    park_id,
    module_code,
    module_name,
    module_group,
    module_version,
    route_path,
    permission_code,
    icon_key,
    sort_no,
    is_builtin,
    status,
    remark
  )
  SELECT
    seed_scope.tenant_id,
    seed_scope.park_id,
    modules.module_code,
    modules.module_name,
    modules.module_group,
    modules.module_version,
    modules.route_path,
    modules.permission_code,
    modules.icon_key,
    modules.sort_no,
    true,
    'enabled',
    modules.remark
  FROM modules
  CROSS JOIN seed_scope
  ON CONFLICT (tenant_id, park_id, module_code) WHERE is_deleted = false DO UPDATE SET
    module_name = EXCLUDED.module_name,
    module_group = EXCLUDED.module_group,
    module_version = EXCLUDED.module_version,
    route_path = EXCLUDED.route_path,
    permission_code = EXCLUDED.permission_code,
    icon_key = EXCLUDED.icon_key,
    sort_no = EXCLUDED.sort_no,
    is_builtin = true,
    status = 'enabled',
    remark = EXCLUDED.remark,
    is_deleted = false,
    update_time = now()
  RETURNING id, tenant_id, park_id, module_code
),
upsert_plan AS (
  INSERT INTO sys_plan (
    tenant_id,
    park_id,
    plan_code,
    plan_name,
    plan_type,
    module_codes,
    max_users,
    max_parks,
    status,
    remark
  )
  SELECT
    seed_scope.tenant_id,
    seed_scope.park_id,
    'BASELINE',
    '基础版',
    'standard',
    '["SYSTEM_FOUNDATION","RBAC_CENTER","CODE_RULE_CENTER","MODULE_AUTH_CENTER","ASSET_FOUNDATION"]'::jsonb,
    0,
    0,
    'enabled',
    'SaaS baseline plan seed'
  FROM seed_scope
  ON CONFLICT (tenant_id, park_id, plan_code) WHERE is_deleted = false DO UPDATE SET
    plan_name = EXCLUDED.plan_name,
    plan_type = EXCLUDED.plan_type,
    module_codes = EXCLUDED.module_codes,
    max_users = EXCLUDED.max_users,
    max_parks = EXCLUDED.max_parks,
    status = 'enabled',
    remark = EXCLUDED.remark,
    is_deleted = false,
    update_time = now()
  RETURNING id, tenant_id, park_id
)
INSERT INTO rel_tenant_module (
  tenant_id,
  park_id,
  tenant_code,
  module_id,
  plan_id,
  feature_config,
  status,
  remark
)
SELECT
  module.tenant_id,
  module.park_id,
  'JH_DEFAULT',
  module.id,
  plan.id,
  '{}'::jsonb,
  'enabled',
  'Default tenant module authorization seed'
FROM upsert_modules module
JOIN upsert_plan plan
  ON plan.tenant_id = module.tenant_id
 AND plan.park_id = module.park_id
ON CONFLICT (tenant_id, park_id, module_id) WHERE is_deleted = false DO UPDATE SET
  plan_id = EXCLUDED.plan_id,
  tenant_code = EXCLUDED.tenant_code,
  status = 'enabled',
  feature_config = EXCLUDED.feature_config,
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

WITH saas_modules(module_code, module_name, module_group, description, route_prefix, icon, sort_no) AS (
  VALUES
    ('system', '系统管理', 'foundation', '用户、组织、角色、权限、字典、附件、审计等系统基础能力', '/system', 'shield-check', 10),
    ('asset', '资产管理', 'business', '园区、楼栋、楼层、房源、资产统计与状态看板', '/assets', 'building-2', 20),
    ('leasing', '招商租赁', 'business', '招商线索、租赁、合同与财务协同模块', '/leasing', 'gauge', 30),
    ('workorder', '工单管理', 'business', '物业服务工单、派单处理、SLA 与服务统计', '/workorders', 'wrench', 40),
    ('safety', '安全管理', 'business', '安全巡检、隐患整改与安全闭环能力', '/safety', 'shield-alert', 45),
    ('iot', 'IoT平台', 'extension', '物联网点位、设备接入与监测预留模块', '/iot', 'radio', 50),
    ('energy', '能耗管理', 'extension', '能耗采集、分析与报表预留模块', '/energy', 'zap', 60),
    ('robot', '机器人运营', 'extension', '清洁、巡检等机器人运营预留模块', '/robots', 'bot', 70),
    ('video', '视频安防', 'extension', '摄像头、视频流与安防联动预留模块', '/video', 'video', 80),
    ('bim', '数字孪生', 'extension', 'BIM、CAD/SVG 空间数字化预留模块', '/bim', 'box', 90),
    ('ai', 'AI助手', 'extension', 'AI 运维助手与智能分析预留模块', '/ai', 'sparkles', 100),
    ('cockpit', '经营驾驶舱', 'extension', '经营总览、资产经营与多模块汇总驾驶舱', '/cockpit', 'layout-dashboard', 110)
)
INSERT INTO sys_module (
  module_code,
  module_name,
  module_group,
  description,
  route_prefix,
  icon,
  status,
  sort_no,
  remark
)
SELECT
  module_code,
  module_name,
  module_group,
  description,
  route_prefix,
  icon,
  1,
  sort_no,
  'Production-safe SaaS module seed'
FROM saas_modules
ON CONFLICT (module_code) WHERE is_deleted = false DO UPDATE SET
  module_name = EXCLUDED.module_name,
  module_group = EXCLUDED.module_group,
  description = EXCLUDED.description,
  route_prefix = EXCLUDED.route_prefix,
  icon = EXCLUDED.icon,
  status = 1,
  sort_no = EXCLUDED.sort_no,
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
plans(plan_code, plan_name, description, sort_no, module_codes) AS (
  VALUES
    ('BASIC', '基础版', '基础系统、资产与工单能力', 10, ARRAY['system','asset','workorder']),
    ('PROFESSIONAL', '专业版', '专业园区运营、工程交付、IoT、能耗、机器人与视频能力', 20, ARRAY['system','asset','workorder','safety','engineering','iot','energy','robot','video']),
    ('ENTERPRISE', '企业版', '企业级园区运营、工程交付、数字孪生、AI 与经营驾驶舱能力', 30, ARRAY['system','asset','workorder','safety','engineering','iot','energy','robot','video','bim','ai','cockpit']),
    ('GROUP', '集团版', '集团多园区全模块能力', 40, ARRAY['system','asset','leasing','workorder','safety','engineering','iot','energy','robot','video','bim','ai','cockpit'])
),
upsert_plans AS (
  INSERT INTO sys_plan (
    tenant_id,
    park_id,
    plan_code,
    plan_name,
    description,
    plan_type,
    module_codes,
    max_users,
    max_parks,
    sort_no,
    status,
    remark
  )
  SELECT
    seed_scope.tenant_id,
    seed_scope.park_id,
    plans.plan_code,
    plans.plan_name,
    plans.description,
    'standard',
    to_jsonb(plans.module_codes),
    0,
    0,
    plans.sort_no,
    'enabled',
    'Production-safe SaaS plan seed'
  FROM plans
  CROSS JOIN seed_scope
  ON CONFLICT (tenant_id, park_id, plan_code) WHERE is_deleted = false DO UPDATE SET
    plan_name = EXCLUDED.plan_name,
    description = EXCLUDED.description,
    plan_type = EXCLUDED.plan_type,
    module_codes = EXCLUDED.module_codes,
    max_users = EXCLUDED.max_users,
    max_parks = EXCLUDED.max_parks,
    sort_no = EXCLUDED.sort_no,
    status = 'enabled',
    remark = EXCLUDED.remark,
    is_deleted = false,
    update_time = now()
  RETURNING id, tenant_id, park_id, plan_code
),
plan_modules AS (
  SELECT
    upsert_plans.id AS plan_id,
    module.id AS module_id
  FROM upsert_plans
  JOIN plans ON plans.plan_code = upsert_plans.plan_code
  JOIN LATERAL unnest(plans.module_codes) AS plan_module(module_code) ON true
  JOIN sys_module module
    ON module.module_code = plan_module.module_code
   AND module.is_deleted = false
)
INSERT INTO rel_plan_module (
  plan_id,
  module_id,
  status,
  remark
)
SELECT
  plan_id,
  module_id,
  1,
  'Production-safe SaaS plan-module seed'
FROM plan_modules
ON CONFLICT (plan_id, module_id) WHERE is_deleted = false DO UPDATE SET
  status = 1,
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
group_plan AS (
  SELECT plan.id
  FROM sys_plan plan
  JOIN seed_scope
    ON seed_scope.tenant_id = plan.tenant_id
   AND seed_scope.park_id = plan.park_id
  WHERE plan.plan_code = 'GROUP'
    AND plan.is_deleted = false
  LIMIT 1
)
INSERT INTO rel_tenant_module (
  tenant_id,
  park_id,
  tenant_code,
  module_id,
  plan_id,
  enabled,
  feature_config,
  status,
  remark
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  'JH_DEFAULT',
  module.id,
  group_plan.id,
  true,
  '{}'::jsonb,
  'enabled',
  'Default Jinhu tenant GROUP module authorization seed'
FROM sys_module module
CROSS JOIN seed_scope
CROSS JOIN group_plan
WHERE module.module_code IN ('system','asset','leasing','workorder','safety','engineering','iot','energy','robot','video','bim','ai','cockpit')
  AND module.is_deleted = false
ON CONFLICT (tenant_id, park_id, module_id) WHERE is_deleted = false DO UPDATE SET
  plan_id = EXCLUDED.plan_id,
  tenant_code = EXCLUDED.tenant_code,
  enabled = true,
  status = 'enabled',
  feature_config = EXCLUDED.feature_config,
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

UPDATE sys_plan
SET is_deleted = true,
    status = 'disabled',
    remark = 'Legacy baseline plan retired by production SaaS plan seed',
    update_time = now()
WHERE plan_code = 'BASELINE'
  AND is_deleted = false;

UPDATE sys_plan
SET permission_codes = CASE plan_code
    WHEN 'BASIC' THEN '["module:system","module:asset","module:workorder"]'::jsonb
    WHEN 'PROFESSIONAL' THEN '["module:system","module:asset","module:workorder","module:safety","module:engineering","module:iot","module:energy","module:robot","module:video"]'::jsonb
    WHEN 'ENTERPRISE' THEN '["module:system","module:asset","module:workorder","module:safety","module:engineering","module:iot","module:energy","module:robot","module:video","module:bim","module:ai"]'::jsonb
    WHEN 'GROUP' THEN '["module:system","module:asset","module:leasing","module:workorder","module:safety","module:engineering","module:iot","module:energy","module:robot","module:video","module:bim","module:ai"]'::jsonb
    ELSE permission_codes
  END,
  feature_config = COALESCE(feature_config, '{}'::jsonb),
  update_time = now()
WHERE plan_code IN ('BASIC', 'PROFESSIONAL', 'ENTERPRISE', 'GROUP')
  AND is_deleted = false;

INSERT INTO biz_park (
  tenant_id,
  park_id,
  park_code,
  park_name,
  status,
  remark
)
VALUES (
  '10000001',
  '20000001',
  'JH',
  '金湖科创产业园',
  1,
  'S2-01 production-safe default park seed'
)
ON CONFLICT (park_code) WHERE is_deleted = false DO UPDATE SET
  park_name = EXCLUDED.park_name,
  status = EXCLUDED.status,
  is_deleted = false,
  update_time = now();

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
dict_types(dict_code, dict_name, remark) AS (
  VALUES
    ('common_status', '通用状态', 'Production-safe common status dictionary'),
    ('org_type', '组织类型', 'Production-safe organization type dictionary'),
    ('file_storage_type', '文件存储类型', 'Production-safe file storage type dictionary'),
    ('file_biz_type', '附件业务类型', 'Production-safe attachment business type dictionary'),
    ('audit_result', '审计结果', 'Production-safe audit result dictionary'),
    ('unit_usage_type', '房源用途', 'Production-safe unit usage type dictionary'),
    ('unit_rental_status', '房源出租状态', 'Production-safe unit rental status dictionary'),
    ('unit_fitting_status', '房源装修状态', 'Production-safe unit fitting status dictionary'),
    ('park_tenant_status', '租户企业状态', 'Production-safe park tenant status dictionary'),
    ('park_tenant_type', '租户企业类型', 'Production-safe park tenant type dictionary'),
    ('park_tenant_risk_level', '租户企业风险等级', 'Production-safe park tenant risk level dictionary'),
    ('industry_code', '行业编码', 'Production-safe industry code dictionary'),
    ('park_tenant_source_type', '租户企业来源', 'Production-safe park tenant source dictionary'),
    ('park_tenant_contact_role', '租户企业联系人角色', 'Production-safe park tenant contact role dictionary'),
    ('park_tenant_qualification_type', '租户企业资质类型', 'Production-safe park tenant qualification type dictionary'),
    ('leasing_lead_status', '招商线索状态', 'Production-safe leasing lead status dictionary'),
    ('leasing_lost_reason', '招商线索流失原因', 'Production-safe leasing lost reason dictionary'),
    ('leasing_lead_lost_reason', '招商线索流失原因', 'Production-safe leasing lead lost reason dictionary'),
    ('leasing_lead_source', '招商线索来源', 'Production-safe leasing lead source dictionary'),
    ('leasing_intention_level', '招商意向等级', 'Production-safe leasing intention level dictionary'),
    ('leasing_follow_type', '招商跟进方式', 'Production-safe leasing follow type dictionary'),
    ('leasing_payment_period', '招商报价付款周期', 'Production-safe leasing quote payment period dictionary'),
    ('leasing_quote_status', '招商报价状态', 'Production-safe leasing quote status dictionary'),
    ('leasing_contract_status', '租赁合同状态', 'Production-safe leasing contract status dictionary'),
    ('leasing_contract_type', '租赁合同类型', 'Production-safe leasing contract type dictionary'),
    ('leasing_contract_source_type', '租赁合同来源', 'Production-safe leasing contract source type dictionary'),
    ('leasing_contract_change_type', '合同变更类型', 'Production-safe leasing contract change type dictionary'),
    ('leasing_contract_change_status', '合同变更状态', 'Production-safe leasing contract change status dictionary'),
    ('leasing_receivable_adjust_policy', '应收调整策略', 'Production-safe leasing receivable adjustment policy dictionary'),
    ('leasing_checkout_type', '退租类型', 'Production-safe leasing checkout type dictionary'),
    ('leasing_release_unit_status', '退租后房源状态', 'Production-safe leasing release unit status dictionary'),
    ('leasing_unit_release_status', '退租后房源状态', 'Production-safe leasing unit release status dictionary alias'),
    ('leasing_settlement_status', '退租结算状态', 'Production-safe leasing settlement status dictionary'),
    ('leasing_checkout_status', '退租申请状态', 'Production-safe leasing checkout status dictionary'),
    ('leasing_refund_method', '退租退款方式', 'Production-safe leasing refund method dictionary'),
    ('leasing_refund_status', '退租退款状态', 'Production-safe leasing refund status dictionary'),
    ('leasing_fee_type', '租赁费用类型', 'Production-safe leasing fee type dictionary'),
    ('leasing_invoice_type', '租赁发票类型', 'Production-safe leasing invoice type dictionary'),
    ('leasing_invoice_status', '租赁开票状态', 'Production-safe leasing invoice status dictionary'),
    ('leasing_receivable_status', '租赁应收状态', 'Production-safe leasing receivable status dictionary'),
    ('leasing_payment_method', '租赁收款方式', 'Production-safe leasing payment method dictionary'),
    ('leasing_payment_status', '租赁收款状态', 'Production-safe leasing payment status dictionary'),
    ('leasing_waiver_status', '租赁豁免审批状态', 'Production-safe leasing waiver status dictionary'),
    ('workorder_status', '工单状态', 'Production-safe work order status dictionary'),
    ('workorder_priority', '工单优先级', 'Production-safe work order priority dictionary'),
    ('workorder_type', '工单类型', 'Production-safe work order type dictionary'),
    ('workorder_urgency', '工单紧急程度', 'Production-safe work order urgency dictionary'),
    ('workorder_source_type', '工单来源', 'Production-safe work order source type dictionary')
),
upsert_types AS (
  INSERT INTO sys_dict_type (
    tenant_id,
    park_id,
    dict_code,
    dict_name,
    status,
    remark
  )
  SELECT
    seed_scope.tenant_id,
    seed_scope.park_id,
    dict_types.dict_code,
    dict_types.dict_name,
    'enabled',
    dict_types.remark
  FROM dict_types
  CROSS JOIN seed_scope
  ON CONFLICT (tenant_id, park_id, dict_code) WHERE is_deleted = false DO UPDATE SET
    dict_name = EXCLUDED.dict_name,
    status = 'enabled',
    remark = EXCLUDED.remark,
    is_deleted = false,
    update_time = now()
  RETURNING id, tenant_id, park_id, dict_code
),
dict_items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('common_status', '启用', 'enabled', 10, 'success'),
    ('common_status', '停用', 'disabled', 20, 'danger'),
    ('org_type', '园区', 'park', 10, 'primary'),
    ('org_type', '部门', 'department', 20, 'default'),
    ('file_storage_type', '本地存储', 'local', 10, 'default'),
    ('file_storage_type', 'MinIO', 'minio', 20, 'default'),
    ('file_storage_type', '对象存储', 'oss', 30, 'default'),
    ('file_biz_type', '合同', 'contract', 10, 'default'),
    ('file_biz_type', '工单', 'workorder', 20, 'default'),
    ('file_biz_type', '隐患整改', 'hazard', 30, 'default'),
    ('file_biz_type', '租户资质', 'tenant_qualification', 40, 'default'),
    ('file_biz_type', '租户企业资质', 'park_tenant_qualification', 45, 'primary'),
    ('file_biz_type', '招商跟进附件', 'leasing_follow', 48, 'primary'),
    ('file_biz_type', '招商看房照片', 'leasing_visit', 49, 'warning'),
    ('file_biz_type', '租赁合同附件', 'leasing_contract', 50, 'primary'),
    ('file_biz_type', '租赁发票附件', 'leasing_invoice', 52, 'success'),
    ('file_biz_type', '房源照片', 'unit_photo', 50, 'default'),
    ('file_biz_type', '楼层平面图', 'floorplan', 60, 'default'),
    ('file_biz_type', '房源平面图', 'unit_floorplan', 70, 'default'),
    ('file_biz_type', '作业许可', 'permit', 80, 'default'),
    ('file_biz_type', '应急事件', 'emergency', 90, 'default'),
    ('audit_result', '成功', 'success', 10, 'success'),
    ('audit_result', '失败', 'fail', 20, 'danger'),
    ('unit_usage_type', '办公', '10', 10, 'primary'),
    ('unit_usage_type', '厂房', '20', 20, 'default'),
    ('unit_usage_type', '仓储', '30', 30, 'default'),
    ('unit_usage_type', '商业', '40', 40, 'warning'),
    ('unit_usage_type', '展厅', '50', 50, 'primary'),
    ('unit_usage_type', '会议室', '60', 60, 'default'),
    ('unit_rental_status', '可招商', '10', 10, 'success'),
    ('unit_rental_status', '锁定', '20', 20, 'warning'),
    ('unit_rental_status', '已出租', '30', 30, 'primary'),
    ('unit_rental_status', '即将到期', '40', 40, 'warning'),
    ('unit_rental_status', '维修中', '50', 50, 'danger'),
    ('unit_rental_status', '自用', '60', 60, 'default'),
    ('unit_rental_status', '已售', '70', 70, 'default'),
    ('unit_fitting_status', '毛坯', '10', 10, 'default'),
    ('unit_fitting_status', '简装', '20', 20, 'primary'),
    ('unit_fitting_status', '精装', '30', 30, 'success'),
    ('park_tenant_status', '待入驻', '10', 10, 'warning'),
    ('park_tenant_status', '在租', '20', 20, 'success'),
    ('park_tenant_status', '已退租', '30', 30, 'default'),
    ('park_tenant_status', '暂停服务', '40', 40, 'danger'),
    ('park_tenant_status', '黑名单', '50', 50, 'danger'),
    ('park_tenant_type', '写字楼办公', '10', 10, 'primary'),
    ('park_tenant_type', '生产制造', '20', 20, 'default'),
    ('park_tenant_type', '仓储物流', '30', 30, 'default'),
    ('park_tenant_type', '展贸零售', '40', 40, 'warning'),
    ('park_tenant_type', '研发实验', '50', 50, 'primary'),
    ('park_tenant_type', '特殊行业', '60', 60, 'danger'),
    ('park_tenant_risk_level', '一般', '10', 10, 'success'),
    ('park_tenant_risk_level', '关注', '20', 20, 'warning'),
    ('park_tenant_risk_level', '重点', '30', 30, 'primary'),
    ('park_tenant_risk_level', '高风险', '40', 40, 'danger'),
    ('industry_code', '综合', 'general', 10, 'default'),
    ('industry_code', '制造业', 'manufacturing', 20, 'primary'),
    ('industry_code', '电商', 'ecommerce', 30, 'primary'),
    ('industry_code', '物流仓储', 'logistics', 40, 'warning'),
    ('industry_code', '科技研发', 'tech', 50, 'success'),
    ('industry_code', '商贸展销', 'trade', 60, 'default'),
    ('industry_code', '其他', 'other', 90, 'default'),
    ('park_tenant_source_type', '人工录入', 'manual', 10, 'default'),
    ('park_tenant_source_type', '线索转化', 'lead_convert', 20, 'primary'),
    ('park_tenant_source_type', '导入', 'import', 30, 'default'),
    ('park_tenant_source_type', '系统生成', 'system', 40, 'default'),
    ('park_tenant_contact_role', '主联系人', 'primary', 10, 'primary'),
    ('park_tenant_contact_role', '财务联系人', 'finance', 20, 'success'),
    ('park_tenant_contact_role', '安全联系人', 'safety', 30, 'warning'),
    ('park_tenant_contact_role', '物业联系人', 'property', 40, 'default'),
    ('park_tenant_contact_role', '企业管理员', 'admin', 50, 'primary'),
    ('park_tenant_contact_role', '应急联系人', 'emergency', 60, 'danger'),
    ('park_tenant_contact_role', '其他', 'other', 90, 'default'),
    ('park_tenant_qualification_type', '营业执照', 'business_license', 10, 'primary'),
    ('park_tenant_qualification_type', '法人证件', 'legal_person_id', 20, 'default'),
    ('park_tenant_qualification_type', '安全承诺书', 'safety_commitment', 30, 'warning'),
    ('park_tenant_qualification_type', '特殊行业许可', 'special_license', 40, 'danger'),
    ('park_tenant_qualification_type', '装修资料', 'decoration', 50, 'default'),
    ('park_tenant_qualification_type', '其他', 'other', 90, 'default'),
    ('leasing_lead_status', '新建线索', '10', 10, 'default'),
    ('leasing_lead_status', '初步沟通', '20', 20, 'primary'),
    ('leasing_lead_status', '已邀约看房', '30', 30, 'warning'),
    ('leasing_lead_status', '已看房', '40', 40, 'warning'),
    ('leasing_lead_status', '已报价', '50', 50, 'primary'),
    ('leasing_lead_status', '商务谈判', '60', 60, 'primary'),
    ('leasing_lead_status', '合同意向', '70', 70, 'success'),
    ('leasing_lead_status', '已签约', '75', 75, 'success'),
    ('leasing_lead_status', '已入驻', '78', 78, 'success'),
    ('leasing_lead_status', '暂搁置', '80', 80, 'default'),
    ('leasing_lead_status', '无效', '90', 90, 'danger'),
    ('leasing_lead_status', '流失', '91', 91, 'danger'),
    ('leasing_lost_reason', '价格原因', 'price', 10, 'warning'),
    ('leasing_lost_reason', '区位原因', 'location', 20, 'warning'),
    ('leasing_lost_reason', '面积不匹配', 'area', 30, 'warning'),
    ('leasing_lost_reason', '不符合行业定位', 'industry', 40, 'default'),
    ('leasing_lost_reason', '转向竞品园区', 'competitor', 50, 'primary'),
    ('leasing_lost_reason', '客户无响应', 'no_response', 60, 'default'),
    ('leasing_lost_reason', '其他', 'other', 90, 'default'),
    ('leasing_lead_lost_reason', '价格原因', 'price', 10, 'warning'),
    ('leasing_lead_lost_reason', '区位原因', 'location', 20, 'warning'),
    ('leasing_lead_lost_reason', '面积不匹配', 'area', 30, 'warning'),
    ('leasing_lead_lost_reason', '不符合行业定位', 'industry', 40, 'default'),
    ('leasing_lead_lost_reason', '转向竞品园区', 'competitor', 50, 'primary'),
    ('leasing_lead_lost_reason', '客户无响应', 'no_response', 60, 'default'),
    ('leasing_lead_lost_reason', '其他', 'other', 90, 'default'),
    ('leasing_lead_source', '人工录入', 'manual', 5, 'default'),
    ('leasing_lead_source', '渠道商', 'channel', 10, 'default'),
    ('leasing_lead_source', '主动来访', 'visit', 20, 'primary'),
    ('leasing_lead_source', '老客户介绍', 'referral', 30, 'success'),
    ('leasing_lead_source', '线上推广', 'online', 40, 'warning'),
    ('leasing_lead_source', '政府推荐', 'government', 50, 'primary'),
    ('leasing_lead_source', '其他', 'other', 90, 'default'),
    ('leasing_intention_level', 'A 高', '10', 10, 'danger'),
    ('leasing_intention_level', 'B 中', '20', 20, 'warning'),
    ('leasing_intention_level', 'C 低', '30', 30, 'default'),
    ('leasing_follow_type', '电话', 'phone', 10, 'success'),
    ('leasing_follow_type', '微信', 'wechat', 20, 'primary'),
    ('leasing_follow_type', '邮件', 'email', 30, 'default'),
    ('leasing_follow_type', '拜访', 'visit', 40, 'warning'),
    ('leasing_follow_type', '会议', 'meeting', 50, 'primary'),
    ('leasing_follow_type', '其他', 'other', 90, 'default'),
    ('leasing_payment_period', '月付', '10', 10, 'default'),
    ('leasing_payment_period', '双月付', '20', 20, 'primary'),
    ('leasing_payment_period', '季付', '30', 30, 'warning'),
    ('leasing_payment_period', '半年付', '40', 40, 'success'),
    ('leasing_payment_period', '年付', '50', 50, 'success'),
    ('leasing_quote_status', '草稿', '10', 10, 'default'),
    ('leasing_quote_status', '已提交', '20', 20, 'primary'),
    ('leasing_quote_status', '审批中', '30', 30, 'warning'),
    ('leasing_quote_status', '已通过', '40', 40, 'success'),
    ('leasing_quote_status', '已驳回', '50', 50, 'danger'),
    ('leasing_quote_status', '已作废', '90', 90, 'default'),
    ('leasing_contract_status', '草稿', '10', 10, 'default'),
    ('leasing_contract_status', '已提交', '20', 20, 'primary'),
    ('leasing_contract_status', '审批中', '30', 30, 'warning'),
    ('leasing_contract_status', '已通过', '40', 40, 'success'),
    ('leasing_contract_status', '已驳回', '50', 50, 'danger'),
    ('leasing_contract_status', '待签章', '60', 60, 'warning'),
    ('leasing_contract_status', '已签章', '70', 70, 'primary'),
    ('leasing_contract_status', '已生效', '75', 75, 'success'),
    ('leasing_contract_status', '已终止', '90', 90, 'danger'),
    ('leasing_contract_status', '已作废', '91', 91, 'default'),
    ('leasing_contract_type', '主合同', '10', 10, 'primary'),
    ('leasing_contract_type', '补充协议', '20', 20, 'info'),
    ('leasing_contract_type', '续租合同', '30', 30, 'default'),
    ('leasing_contract_type', '退租结算', '40', 40, 'warning'),
    ('leasing_contract_source_type', '手工创建', 'manual', 10, 'default'),
    ('leasing_contract_source_type', '报价转合同', 'quote', 20, 'primary'),
    ('leasing_contract_source_type', '续租', 'renewal', 30, 'info'),
    ('leasing_contract_source_type', '变更', 'change', 40, 'warning'),
    ('leasing_contract_change_type', '租期变更', 'term_change', 10, 'primary'),
    ('leasing_contract_change_type', '金额变更', 'amount_change', 20, 'warning'),
    ('leasing_contract_change_type', '房源变更', 'unit_change', 30, 'primary'),
    ('leasing_contract_change_type', '付款周期变更', 'payment_change', 40, 'default'),
    ('leasing_contract_change_type', '物业费 / 其他费用变更', 'fee_change', 50, 'warning'),
    ('leasing_contract_change_type', '综合变更', 'mixed', 60, 'danger'),
    ('leasing_contract_change_type', '其他', 'other', 90, 'default'),
    ('leasing_contract_change_status', '草稿', '10', 10, 'default'),
    ('leasing_contract_change_status', '已提交', '20', 20, 'primary'),
    ('leasing_contract_change_status', '审批中', '30', 30, 'warning'),
    ('leasing_contract_change_status', '已通过', '40', 40, 'success'),
    ('leasing_contract_change_status', '已驳回', '50', 50, 'danger'),
    ('leasing_contract_change_status', '已生效', '60', 60, 'success'),
    ('leasing_contract_change_status', '已作废', '90', 90, 'default'),
    ('leasing_contract_change_status', '已作废', '91', 91, 'default'),
    ('leasing_receivable_adjust_policy', '不处理既有应收', 'no_action', 10, 'default'),
    ('leasing_receivable_adjust_policy', '调整未收款未来应收', 'adjust_future', 20, 'warning'),
    ('leasing_receivable_adjust_policy', '人工复核', 'manual_review', 30, 'primary'),
    ('leasing_checkout_type', '到期退租', 'normal', 10, 'primary'),
    ('leasing_checkout_type', '提前退租', 'early', 20, 'warning'),
    ('leasing_checkout_type', '违约终止', 'breach', 30, 'danger'),
    ('leasing_checkout_type', '强制终止', 'force', 40, 'danger'),
    ('leasing_checkout_type', '其他', 'other', 90, 'default'),
    ('leasing_release_unit_status', '可招商', 'rentable', 10, 'success'),
    ('leasing_release_unit_status', '维修中', 'maintenance', 20, 'warning'),
    ('leasing_unit_release_status', '可招商', 'rentable', 10, 'success'),
    ('leasing_unit_release_status', '维修中', 'maintenance', 20, 'warning'),
    ('leasing_settlement_status', '未结算', '10', 10, 'warning'),
    ('leasing_settlement_status', '结算中', '20', 20, 'primary'),
    ('leasing_settlement_status', '已结算', '30', 30, 'success'),
    ('leasing_settlement_status', '已退款', '40', 40, 'default'),
    ('leasing_checkout_status', '草稿', '10', 10, 'default'),
    ('leasing_checkout_status', '已提交', '20', 20, 'primary'),
    ('leasing_checkout_status', '审批中', '30', 30, 'warning'),
    ('leasing_checkout_status', '已通过待结算', '40', 40, 'primary'),
    ('leasing_checkout_status', '已驳回', '50', 50, 'danger'),
    ('leasing_checkout_status', '已结算', '60', 60, 'warning'),
    ('leasing_checkout_status', '已生效', '70', 70, 'success'),
    ('leasing_checkout_status', '已作废', '90', 90, 'default'),
    ('leasing_checkout_status', '已作废', '91', 91, 'default'),
    ('leasing_refund_method', '银行转账', 'bank_transfer', 10, 'primary'),
    ('leasing_refund_method', '现金', 'cash', 20, 'warning'),
    ('leasing_refund_method', '微信', 'wechat', 30, 'success'),
    ('leasing_refund_method', '支付宝', 'alipay', 40, 'info'),
    ('leasing_refund_method', '其他', 'other', 90, 'default'),
    ('leasing_refund_status', '已登记', '10', 10, 'warning'),
    ('leasing_refund_status', '已完成', '20', 20, 'primary'),
    ('leasing_refund_status', '已退款', '30', 30, 'success'),
    ('leasing_refund_status', '已作废', '90', 90, 'default'),
    ('leasing_fee_type', '租金', '10', 10, 'primary'),
    ('leasing_fee_type', '押金', '20', 20, 'warning'),
    ('leasing_fee_type', '物业费', '30', 30, 'success'),
    ('leasing_fee_type', '能耗费', '40', 40, 'info'),
    ('leasing_fee_type', '滞纳金', '50', 50, 'danger'),
    ('leasing_fee_type', '其他', '90', 90, 'default'),
    ('leasing_invoice_type', '普通发票', 'normal', 10, 'primary'),
    ('leasing_invoice_type', '专用发票', 'special', 20, 'success'),
    ('leasing_invoice_type', '收据', 'receipt', 30, 'info'),
    ('leasing_invoice_type', '其他', 'other', 90, 'default'),
    ('leasing_invoice_status', '未开票', '10', 10, 'default'),
    ('leasing_invoice_status', '部分开票', '20', 20, 'warning'),
    ('leasing_invoice_status', '已开票', '30', 30, 'success'),
    ('leasing_invoice_status', '已作废', '90', 90, 'default'),
    ('leasing_receivable_status', '已生成', '20', 20, 'primary'),
    ('leasing_receivable_status', '已开票', '30', 30, 'info'),
    ('leasing_receivable_status', '部分实收', '40', 40, 'warning'),
    ('leasing_receivable_status', '已结清', '50', 50, 'success'),
    ('leasing_receivable_status', '已逾期', '60', 60, 'danger'),
    ('leasing_receivable_status', '逾期部分还', '70', 70, 'warning'),
    ('leasing_receivable_status', '已豁免', '80', 80, 'default'),
    ('leasing_receivable_status', '已退款', '90', 90, 'default'),
    ('leasing_receivable_status', '已取消', '95', 95, 'default'),
    ('leasing_payment_method', '银行转账', 'bank_transfer', 10, 'primary'),
    ('leasing_payment_method', '现金', 'cash', 20, 'warning'),
    ('leasing_payment_method', '微信', 'wechat', 30, 'success'),
    ('leasing_payment_method', '支付宝', 'alipay', 40, 'info'),
    ('leasing_payment_method', 'POS', 'pos', 50, 'success'),
    ('leasing_payment_method', '其他', 'other', 90, 'default'),
    ('leasing_payment_status', '未核销', '10', 10, 'warning'),
    ('leasing_payment_status', '部分核销', '20', 20, 'primary'),
    ('leasing_payment_status', '已核销', '30', 30, 'success'),
    ('leasing_payment_status', '已作废', '90', 90, 'default'),
    ('leasing_waiver_status', '草稿', '10', 10, 'default'),
    ('leasing_waiver_status', '审批中', '20', 20, 'warning'),
    ('leasing_waiver_status', '已通过', '30', 30, 'success'),
    ('leasing_waiver_status', '已驳回', '40', 40, 'danger'),
    ('leasing_waiver_status', '已作废', '90', 90, 'default'),
    ('workorder_status', '已提交', '10', 10, 'default'),
    ('workorder_status', '已派单', '20', 20, 'primary'),
    ('workorder_status', '已接单', '30', 30, 'primary'),
    ('workorder_status', '处理中', '40', 40, 'warning'),
    ('workorder_status', '待物料', '45', 45, 'warning'),
    ('workorder_status', '已处理', '50', 50, 'success'),
    ('workorder_status', '已确认', '60', 60, 'primary'),
    ('workorder_status', '已评价', '70', 70, 'success'),
    ('workorder_status', '已超时', '80', 80, 'danger'),
    ('workorder_status', '已取消', '90', 90, 'default'),
    ('workorder_status', '已退回', '91', 91, 'danger'),
    ('workorder_status', '已关闭', '100', 100, 'success'),
    ('workorder_priority', '高', 'high', 10, 'danger'),
    ('workorder_priority', '中', 'medium', 20, 'warning'),
    ('workorder_priority', '低', 'low', 30, 'default'),
    ('workorder_type', '维修报修', 'repair', 10, 'primary'),
    ('workorder_type', '投诉建议', 'complaint', 20, 'danger'),
    ('workorder_type', '服务申请', 'request', 30, 'success'),
    ('workorder_type', '服务申请(兼容旧值)', 'service', 35, 'success'),
    ('workorder_type', '咨询', 'consultation', 40, 'default'),
    ('workorder_type', '设备维保', 'maintenance', 50, 'primary'),
    ('workorder_type', '环境保洁', 'cleaning', 60, 'success'),
    ('workorder_type', '安防处理', 'security', 70, 'warning'),
    ('workorder_type', '消防安全', 'fire_safety', 75, 'danger'),
    ('workorder_type', '停车管理', 'parking', 80, 'primary'),
    ('workorder_type', '绿化养护', 'landscaping', 85, 'success'),
    ('workorder_type', '水电能源', 'energy', 86, 'warning'),
    ('workorder_type', '门禁通行', 'access', 87, 'primary'),
    ('workorder_type', '其他', 'other', 90, 'default'),
    ('workorder_urgency', '特急', 'critical', 5, 'danger'),
    ('workorder_urgency', '紧急', 'urgent', 10, 'danger'),
    ('workorder_urgency', '一般', 'normal', 20, 'primary'),
    ('workorder_urgency', '低', 'low', 30, 'default'),
    ('workorder_source_type', '手工创建', 'manual', 10, 'default'),
    ('workorder_source_type', '业主/租户诉求', 'tenant_request', 20, 'primary'),
    ('workorder_source_type', '巡检发现', 'inspection', 30, 'warning'),
    ('workorder_source_type', '设备告警', 'alert', 40, 'warning'),
    ('workorder_source_type', 'IoT 告警', 'iot_alert', 45, 'warning'),
    ('workorder_source_type', '应急事件', 'safety_emergency', 50, 'danger'),
    ('workorder_source_type', '作业许可', 'work_permit', 55, 'warning'),
    ('workorder_source_type', '机器人异常', 'robot', 60, 'default'),
    ('workorder_source_type', 'AI 工作计划', 'ai_work_plan', 65, 'primary'),
    ('workorder_source_type', '系统生成', 'system', 70, 'default')
),
desired_dict_items AS (
  SELECT
    upsert_types.tenant_id,
    upsert_types.park_id,
    upsert_types.id AS dict_type_id,
    dict_items.item_label,
    dict_items.item_value,
    dict_items.sort_order,
    dict_items.tag_type
  FROM dict_items
  JOIN upsert_types ON upsert_types.dict_code = dict_items.dict_code
),
retired_dict_items AS (
  UPDATE sys_dict_item existing
  SET status = 'disabled',
      is_deleted = true,
      remark = 'Retired by production-safe dictionary item seed',
      update_time = now()
  FROM upsert_types
  WHERE existing.tenant_id = upsert_types.tenant_id
    AND existing.park_id = upsert_types.park_id
    AND existing.dict_type_id = upsert_types.id
    AND existing.is_deleted = false
    AND upsert_types.dict_code IN (
      'park_tenant_status',
      'park_tenant_type',
      'park_tenant_risk_level',
      'industry_code',
      'park_tenant_contact_role',
      'park_tenant_qualification_type',
      'leasing_lead_status',
      'leasing_lost_reason',
      'leasing_lead_lost_reason',
      'leasing_lead_source',
      'leasing_intention_level',
      'leasing_follow_type',
      'leasing_payment_period',
      'leasing_quote_status',
      'leasing_contract_status',
      'leasing_contract_type',
      'leasing_contract_source_type',
      'leasing_contract_change_type',
      'leasing_contract_change_status',
      'leasing_receivable_adjust_policy',
      'leasing_checkout_type',
      'leasing_release_unit_status',
      'leasing_unit_release_status',
      'leasing_settlement_status',
      'leasing_checkout_status',
      'leasing_refund_method',
      'leasing_refund_status',
      'leasing_fee_type',
      'leasing_invoice_type',
      'leasing_invoice_status',
      'leasing_receivable_status',
      'leasing_payment_method',
      'leasing_payment_status',
      'leasing_waiver_status',
      'workorder_status',
      'workorder_priority',
      'workorder_type',
      'workorder_urgency',
      'workorder_source_type'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM desired_dict_items desired
      WHERE desired.dict_type_id = existing.dict_type_id
        AND desired.item_value = existing.item_value
    )
  RETURNING existing.id
),
updated_dict_items AS (
  UPDATE sys_dict_item existing
  SET item_label = desired_dict_items.item_label,
      sort_order = desired_dict_items.sort_order,
      status = 'enabled',
      tag_type = desired_dict_items.tag_type,
      remark = 'Production-safe dictionary item seed',
      is_deleted = false,
      update_time = now()
  FROM desired_dict_items
  WHERE existing.tenant_id = desired_dict_items.tenant_id
    AND existing.park_id = desired_dict_items.park_id
    AND existing.dict_type_id = desired_dict_items.dict_type_id
    AND existing.item_value = desired_dict_items.item_value
    AND existing.is_deleted = false
  RETURNING existing.id
)
INSERT INTO sys_dict_item (
  tenant_id,
  park_id,
  dict_type_id,
  item_label,
  item_value,
  sort_order,
  status,
  tag_type,
  remark
)
SELECT
  desired_dict_items.tenant_id,
  desired_dict_items.park_id,
  desired_dict_items.dict_type_id,
  desired_dict_items.item_label,
  desired_dict_items.item_value,
  desired_dict_items.sort_order,
  'enabled',
  desired_dict_items.tag_type,
  'Production-safe dictionary item seed'
FROM desired_dict_items
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_dict_item existing
  WHERE existing.tenant_id = desired_dict_items.tenant_id
    AND existing.park_id = desired_dict_items.park_id
    AND existing.dict_type_id = desired_dict_items.dict_type_id
    AND existing.item_value = desired_dict_items.item_value
    AND existing.is_deleted = false
);

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
)
UPDATE sys_dict_item item
SET status = 'disabled',
    remark = 'Reserved for later contract phases',
    update_time = now()
FROM sys_dict_type dict_type
JOIN seed_scope
  ON seed_scope.tenant_id = dict_type.tenant_id
 AND seed_scope.park_id = dict_type.park_id
WHERE item.tenant_id = dict_type.tenant_id
  AND item.park_id = dict_type.park_id
  AND item.dict_type_id = dict_type.id
  AND dict_type.dict_code = 'leasing_contract_type'
  AND item.item_value IN ('20', '30', '40')
  AND item.is_deleted = false;
