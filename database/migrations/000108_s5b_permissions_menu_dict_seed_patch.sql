WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no, parent_code) AS (
  VALUES
    ('safety:emergency-dashboard', '应急看板', 'safety.emergency_work_permit_statistics', 'page', 'page', 20, NULL, NULL, '/safety/emergency-dashboard', 79, 'safety'),
    ('safety:emergencies', '应急事件', 'safety.emergency_event', 'page', 'page', 20, NULL, NULL, '/safety/emergencies', 80, 'safety'),
    ('safety:emergency-plans', '应急预案', 'safety.emergency_plan', 'page', 'page', 20, NULL, NULL, '/safety/emergency-plans', 85, 'safety'),
    ('safety:emergency-contacts', '应急联系人', 'safety.emergency_contact', 'page', 'page', 20, NULL, NULL, '/safety/emergency-contacts', 90, 'safety'),
    ('safety:work-permits', '作业许可', 'safety.work_permit', 'page', 'page', 20, NULL, NULL, '/safety/work-permits', 95, 'safety'),
    ('safety_emergency_contact:read', '应急联系人读取', 'biz.safety_emergency_contact', 'read', 'api', 40, 'GET', '/api/v1/safety/emergency-contacts', '/safety/emergency-contacts', 700, 'safety:emergency-contacts'),
    ('safety_emergency_contact:create', '新增应急联系人', 'biz.safety_emergency_contact', 'create', 'api', 40, 'POST', '/api/v1/safety/emergency-contacts', NULL, 710, 'safety:emergency-contacts'),
    ('safety_emergency_contact:update', '编辑应急联系人', 'biz.safety_emergency_contact', 'update', 'api', 40, 'PUT', '/api/v1/safety/emergency-contacts/:id', NULL, 720, 'safety:emergency-contacts'),
    ('safety_emergency_contact:delete', '删除应急联系人', 'biz.safety_emergency_contact', 'delete', 'api', 40, 'DELETE', '/api/v1/safety/emergency-contacts/:id', NULL, 730, 'safety:emergency-contacts'),
    ('safety_emergency_plan:read', '应急预案读取', 'biz.safety_emergency_plan', 'read', 'api', 40, 'GET', '/api/v1/safety/emergency-plans', '/safety/emergency-plans', 740, 'safety:emergency-plans'),
    ('safety_emergency_plan:create', '新增应急预案', 'biz.safety_emergency_plan', 'create', 'api', 40, 'POST', '/api/v1/safety/emergency-plans', NULL, 750, 'safety:emergency-plans'),
    ('safety_emergency_plan:update', '编辑应急预案', 'biz.safety_emergency_plan', 'update', 'api', 40, 'PUT', '/api/v1/safety/emergency-plans/:id', NULL, 760, 'safety:emergency-plans'),
    ('safety_emergency_plan:delete', '删除应急预案', 'biz.safety_emergency_plan', 'delete', 'api', 40, 'DELETE', '/api/v1/safety/emergency-plans/:id', NULL, 770, 'safety:emergency-plans'),
    ('safety_emergency_statistics:read', '应急事件统计', 'biz.safety_emergency_statistics', 'read', 'api', 40, 'GET', '/api/v1/safety/emergency-work-permit-statistics', '/safety/emergency-dashboard', 790, 'safety:emergency-dashboard'),
    ('safety_work_permit_statistics:read', '作业许可统计', 'biz.safety_work_permit_statistics', 'read', 'api', 40, 'GET', '/api/v1/safety/emergency-work-permit-statistics', '/safety/emergency-dashboard', 791, 'safety:emergency-dashboard'),
    ('safety_emergency:read', '应急事件读取', 'biz.safety_emergency_event', 'read', 'api', 40, 'GET', '/api/v1/safety/emergencies', '/safety/emergencies', 800, 'safety:emergencies'),
    ('safety_emergency:create', '新增应急事件', 'biz.safety_emergency_event', 'create', 'api', 40, 'POST', '/api/v1/safety/emergencies', NULL, 810, 'safety:emergencies'),
    ('safety_emergency:update', '编辑应急事件', 'biz.safety_emergency_event', 'update', 'api', 40, 'PUT', '/api/v1/safety/emergencies/:id', NULL, 820, 'safety:emergencies'),
    ('safety_emergency:delete', '删除应急事件', 'biz.safety_emergency_event', 'delete', 'api', 40, 'DELETE', '/api/v1/safety/emergencies/:id', NULL, 830, 'safety:emergencies'),
    ('safety_emergency:sos', '一键上报应急事件', 'biz.safety_emergency_event', 'sos', 'api', 40, 'POST', '/api/v1/safety/emergencies/sos', NULL, 840, 'safety:emergencies'),
    ('safety_emergency:respond', '响应应急事件', 'biz.safety_emergency_event', 'respond', 'api', 40, 'POST', '/api/v1/safety/emergencies/:id/respond', NULL, 850, 'safety:emergencies'),
    ('safety_emergency:dispose', '处置应急事件', 'biz.safety_emergency_event', 'dispose', 'api', 40, 'POST', '/api/v1/safety/emergencies/:id/start-disposal', NULL, 860, 'safety:emergencies'),
    ('safety_emergency:control', '控制应急事件', 'biz.safety_emergency_event', 'control', 'api', 40, 'POST', '/api/v1/safety/emergencies/:id/control', NULL, 870, 'safety:emergencies'),
    ('safety_emergency:review', '复盘应急事件', 'biz.safety_emergency_event', 'review', 'api', 40, 'POST', '/api/v1/safety/emergencies/:id/review', NULL, 880, 'safety:emergencies'),
    ('safety_emergency:close', '关闭应急事件', 'biz.safety_emergency_event', 'close', 'api', 40, 'POST', '/api/v1/safety/emergencies/:id/close', NULL, 890, 'safety:emergencies'),
    ('safety_emergency:upgrade', '升级应急事件', 'biz.safety_emergency_event', 'upgrade', 'api', 40, 'POST', '/api/v1/safety/emergencies/:id/upgrade', NULL, 900, 'safety:emergencies'),
    ('safety_emergency:cancel', '取消应急事件', 'biz.safety_emergency_event', 'cancel', 'api', 40, 'POST', '/api/v1/safety/emergencies/:id/cancel', NULL, 910, 'safety:emergencies'),
    ('safety_emergency:create_workorder', '应急事件转工单', 'biz.safety_emergency_event', 'create_workorder', 'api', 40, 'POST', '/api/v1/safety/emergencies/:id/create-work-order', NULL, 920, 'safety:emergencies'),
    ('safety_emergency_timeline:read', '应急事件时间线读取', 'biz.safety_emergency_timeline', 'read', 'api', 40, 'GET', '/api/v1/safety/emergencies/:id/timeline', NULL, 930, 'safety:emergencies'),
    ('safety_emergency_timeline:create', '追加应急处置日志', 'biz.safety_emergency_timeline', 'create', 'api', 40, 'POST', '/api/v1/safety/emergencies/:id/timeline', NULL, 940, 'safety:emergencies'),
    ('safety_hazard:to_emergency', '隐患转应急事件', 'biz.safety_hazard', 'to_emergency', 'api', 40, 'POST', '/api/v1/safety/hazards/:id/to-emergency', NULL, 615, 'safety:hazards'),
    ('safety_work_permit:read', '作业许可读取', 'biz.safety_work_permit', 'read', 'api', 40, 'GET', '/api/v1/safety/work-permits', '/safety/work-permits', 950, 'safety:work-permits'),
    ('safety_work_permit:create', '新增作业许可', 'biz.safety_work_permit', 'create', 'api', 40, 'POST', '/api/v1/safety/work-permits', NULL, 951, 'safety:work-permits'),
    ('safety_work_permit:update', '编辑作业许可', 'biz.safety_work_permit', 'update', 'api', 40, 'PUT', '/api/v1/safety/work-permits/:id', NULL, 952, 'safety:work-permits'),
    ('safety_work_permit:delete', '删除作业许可', 'biz.safety_work_permit', 'delete', 'api', 40, 'DELETE', '/api/v1/safety/work-permits/:id', NULL, 953, 'safety:work-permits'),
    ('safety_work_permit:override_conflict', '覆盖作业许可冲突', 'biz.safety_work_permit', 'override_conflict', 'api', 40, 'POST', '/api/v1/safety/work-permits', NULL, 954, 'safety:work-permits'),
    ('safety_work_permit:submit', '提交作业许可审批', 'biz.safety_work_permit', 'submit', 'api', 40, 'POST', '/api/v1/safety/work-permits/:id/submit', NULL, 955, 'safety:work-permits'),
    ('safety_work_permit:approve_property', '物业审批作业许可', 'biz.safety_work_permit', 'approve_property', 'api', 40, 'POST', '/api/v1/safety/work-permits/:id/approve', NULL, 956, 'safety:work-permits'),
    ('safety_work_permit:approve_safety', '安全审批作业许可', 'biz.safety_work_permit', 'approve_safety', 'api', 40, 'POST', '/api/v1/safety/work-permits/:id/approve', NULL, 957, 'safety:work-permits'),
    ('safety_work_permit:approve_operation', '运营审批作业许可', 'biz.safety_work_permit', 'approve_operation', 'api', 40, 'POST', '/api/v1/safety/work-permits/:id/approve', NULL, 958, 'safety:work-permits'),
    ('safety_work_permit:reject', '驳回作业许可', 'biz.safety_work_permit', 'reject', 'api', 40, 'POST', '/api/v1/safety/work-permits/:id/reject', NULL, 959, 'safety:work-permits'),
    ('safety_work_permit:void', '作废作业许可', 'biz.safety_work_permit', 'void', 'api', 40, 'POST', '/api/v1/safety/work-permits/:id/void', NULL, 960, 'safety:work-permits'),
    ('safety_work_permit:start', '作业许可开工', 'biz.safety_work_permit', 'start', 'api', 40, 'POST', '/api/v1/safety/work-permits/:id/start', NULL, 961, 'safety:work-permits'),
    ('safety_work_permit:process_check', '作业许可过程巡查', 'biz.safety_work_permit', 'process_check', 'api', 40, 'POST', '/api/v1/safety/work-permits/:id/process-check', NULL, 962, 'safety:work-permits'),
    ('safety_work_permit:stop', '作业许可违规停工', 'biz.safety_work_permit', 'stop', 'api', 40, 'POST', '/api/v1/safety/work-permits/:id/stop', NULL, 963, 'safety:work-permits'),
    ('safety_work_permit:finish', '作业许可完工', 'biz.safety_work_permit', 'finish', 'api', 40, 'POST', '/api/v1/safety/work-permits/:id/finish', NULL, 964, 'safety:work-permits'),
    ('safety_work_permit:close', '作业许可完工收单', 'biz.safety_work_permit', 'close', 'api', 40, 'POST', '/api/v1/safety/work-permits/:id/close', NULL, 965, 'safety:work-permits'),
    ('safety_work_permit:create_hazard', '作业许可违规转隐患', 'biz.safety_work_permit_check', 'create_hazard', 'api', 40, 'POST', '/api/v1/safety/work-permits/:id/checks/:checkId/create-hazard', NULL, 966, 'safety:work-permits'),
    ('safety_work_permit:create_workorder', '作业许可违规转工单', 'biz.safety_work_permit_check', 'create_workorder', 'api', 40, 'POST', '/api/v1/safety/work-permits/:id/checks/:checkId/create-work-order', NULL, 967, 'safety:work-permits')
),
updated_permissions AS (
  UPDATE sys_permission existing
  SET park_id = seed_scope.park_id,
      name = permissions.name,
      resource = permissions.resource,
      action = permissions.action,
      permission_type = permissions.permission_type,
      perm_type = permissions.perm_type,
      api_method = permissions.api_method,
      api_path = permissions.api_path,
      frontend_route = permissions.frontend_route,
      sort_no = permissions.sort_no,
      status = 'enabled',
      visible = true,
      is_system = true,
      is_builtin = true,
      is_deleted = false,
      remark = 'S5-B permission/menu final seed patch',
      update_time = now()
  FROM permissions
  CROSS JOIN seed_scope
  WHERE existing.tenant_id = seed_scope.tenant_id
    AND existing.code = permissions.code
    AND existing.is_deleted = false
  RETURNING existing.id
),
inserted_permissions AS (
  INSERT INTO sys_permission (
    tenant_id, park_id, code, name, resource, action, permission_type, perm_type,
    api_method, api_path, frontend_route, sort_no, status, is_system, is_builtin, visible, remark
  )
  SELECT seed_scope.tenant_id, seed_scope.park_id, permissions.code, permissions.name,
         permissions.resource, permissions.action, permissions.permission_type, permissions.perm_type,
         permissions.api_method, permissions.api_path, permissions.frontend_route, permissions.sort_no,
         'enabled', true, true, true, 'S5-B permission/menu final seed patch'
  FROM permissions
  CROSS JOIN seed_scope
  WHERE NOT EXISTS (
    SELECT 1
    FROM sys_permission existing
    WHERE existing.tenant_id = seed_scope.tenant_id
      AND existing.code = permissions.code
      AND existing.is_deleted = false
  )
  RETURNING id
),
target_permissions AS (
  SELECT permission.id, permissions.parent_code
  FROM permissions
  CROSS JOIN seed_scope
  JOIN sys_permission permission
    ON permission.tenant_id = seed_scope.tenant_id
   AND permission.park_id = seed_scope.park_id
   AND permission.code = permissions.code
   AND permission.is_deleted = false
)
UPDATE sys_permission child
SET parent_id = parent.id,
    permission_path = COALESCE(parent.permission_path, parent.code) || '/' || child.code,
    permission_level = COALESCE(parent.permission_level, 1) + 1,
    update_time = now()
FROM target_permissions, sys_permission parent
WHERE child.id = target_permissions.id
  AND parent.tenant_id = child.tenant_id
  AND parent.park_id = child.park_id
  AND parent.code = target_permissions.parent_code
  AND parent.is_deleted = false
  AND child.is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
target_type AS (
  SELECT id, tenant_id, park_id
  FROM sys_dict_type
  WHERE tenant_id = (SELECT tenant_id FROM seed_scope)
    AND park_id = (SELECT park_id FROM seed_scope)
    AND dict_code = 'safety_work_permit_type'
    AND is_deleted = false
),
existing_high_work AS (
  SELECT 1
  FROM sys_dict_item item
  JOIN target_type ON target_type.id = item.dict_type_id
  WHERE item.tenant_id = target_type.tenant_id
    AND item.park_id = target_type.park_id
    AND item.item_value = 'high_work'
    AND item.is_deleted = false
)
UPDATE sys_dict_item item
SET item_value = 'high_work',
    item_label = '高处作业',
    sort_order = 50,
    tag_type = 'danger',
    update_time = now(),
    remark = 'S5-B normalized high work permit dictionary value'
FROM target_type
WHERE item.tenant_id = target_type.tenant_id
  AND item.park_id = target_type.park_id
  AND item.dict_type_id = target_type.id
  AND item.item_value = 'height'
  AND item.is_deleted = false
  AND NOT EXISTS (SELECT 1 FROM existing_high_work);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_types(dict_code, dict_name, remark) AS (
  VALUES
    ('safety_emergency_source_type', '应急事件来源', 'S5-B final emergency source dictionary'),
    ('safety_emergency_incident_type', '应急事件类型', 'S5-B final emergency incident type dictionary'),
    ('safety_emergency_severity', '应急严重等级', 'S5-B final emergency severity dictionary'),
    ('safety_emergency_response_level', '应急响应级别', 'S5-B final emergency response level dictionary'),
    ('safety_emergency_status', '应急事件状态', 'S5-B final emergency status dictionary'),
    ('safety_work_permit_type', '作业许可类型', 'S5-B final work permit type dictionary'),
    ('safety_work_permit_apply_type', '作业许可申请类型', 'S5-B final work permit apply type dictionary'),
    ('safety_work_permit_status', '作业许可状态', 'S5-B final work permit status dictionary'),
    ('safety_work_permit_check_type', '作业许可巡查类型', 'S5-B final work permit check type dictionary'),
    ('safety_work_permit_check_result', '作业许可巡查结果', 'S5-B final work permit check result dictionary'),
    ('safety_hazard_status', '安全隐患状态', 'S5-B final hazard status dictionary')
),
upsert_types AS (
  INSERT INTO sys_dict_type (tenant_id, park_id, dict_code, dict_name, status, remark)
  SELECT seed_scope.tenant_id, seed_scope.park_id, dict_types.dict_code, dict_types.dict_name, 'enabled', dict_types.remark
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
all_types AS (
  SELECT id, tenant_id, park_id, dict_code FROM upsert_types
  UNION
  SELECT dict_type.id, dict_type.tenant_id, dict_type.park_id, dict_type.dict_code
  FROM sys_dict_type dict_type
  JOIN seed_scope
    ON seed_scope.tenant_id = dict_type.tenant_id
   AND seed_scope.park_id = dict_type.park_id
  WHERE dict_type.dict_code IN (
    'safety_emergency_source_type',
    'safety_emergency_incident_type',
    'safety_emergency_severity',
    'safety_emergency_response_level',
    'safety_emergency_status',
    'safety_work_permit_type',
    'safety_work_permit_apply_type',
    'safety_work_permit_status',
    'safety_work_permit_check_type',
    'safety_work_permit_check_result',
    'safety_hazard_status'
  )
    AND dict_type.is_deleted = false
),
dict_items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('safety_emergency_source_type', '人工上报', 'manual', 10, 'primary'),
    ('safety_emergency_source_type', '一键 SOS', 'sos', 15, 'danger'),
    ('safety_emergency_source_type', '隐患转入', 'hazard', 20, 'danger'),
    ('safety_emergency_source_type', '工单转入', 'workorder', 30, 'warning'),
    ('safety_emergency_source_type', '系统告警', 'alert', 40, 'danger'),
    ('safety_emergency_source_type', '机器人发现', 'robot', 50, 'primary'),
    ('safety_emergency_incident_type', '火情', 'fire', 10, 'danger'),
    ('safety_emergency_incident_type', '电气', 'electrical', 20, 'warning'),
    ('safety_emergency_incident_type', '机械设备', 'mechanical', 30, 'primary'),
    ('safety_emergency_incident_type', '医疗', 'medical', 40, 'danger'),
    ('safety_emergency_incident_type', '治安', 'security', 50, 'warning'),
    ('safety_emergency_incident_type', '极端天气', 'weather', 60, 'primary'),
    ('safety_emergency_incident_type', '危化品', 'chemical', 70, 'danger'),
    ('safety_emergency_incident_type', '其他', 'other', 90, 'default'),
    ('safety_emergency_severity', '一般', '10', 10, 'success'),
    ('safety_emergency_severity', '较大', '20', 20, 'warning'),
    ('safety_emergency_severity', '重大', '30', 30, 'danger'),
    ('safety_emergency_severity', '特别重大', '40', 40, 'danger'),
    ('safety_emergency_response_level', '低', '10', 10, 'success'),
    ('safety_emergency_response_level', '中', '20', 20, 'primary'),
    ('safety_emergency_response_level', '高', '30', 30, 'warning'),
    ('safety_emergency_response_level', '紧急', '40', 40, 'danger'),
    ('safety_emergency_status', '已上报', '10', 10, 'warning'),
    ('safety_emergency_status', '响应中', '20', 20, 'primary'),
    ('safety_emergency_status', '处置中', '30', 30, 'primary'),
    ('safety_emergency_status', '已控制', '40', 40, 'success'),
    ('safety_emergency_status', '复盘中', '50', 50, 'warning'),
    ('safety_emergency_status', '已闭环', '60', 60, 'success'),
    ('safety_emergency_status', '已升级', '80', 80, 'danger'),
    ('safety_emergency_status', '已取消', '90', 90, 'default'),
    ('safety_work_permit_type', '动火作业', 'hot_work', 10, 'danger'),
    ('safety_work_permit_type', '临时用电', 'temporary_power', 20, 'warning'),
    ('safety_work_permit_type', '装修施工', 'decoration', 30, 'primary'),
    ('safety_work_permit_type', '有限空间', 'confined_space', 40, 'danger'),
    ('safety_work_permit_type', '高处作业', 'high_work', 50, 'danger'),
    ('safety_work_permit_type', '吊装作业', 'lifting', 60, 'danger'),
    ('safety_work_permit_type', '其他', 'other', 90, 'default'),
    ('safety_work_permit_apply_type', '租户申请', 'tenant', 10, 'primary'),
    ('safety_work_permit_apply_type', '承包商申请', 'contractor', 20, 'warning'),
    ('safety_work_permit_apply_type', '内部申请', 'internal', 30, 'success'),
    ('safety_work_permit_status', '草稿', '10', 10, 'default'),
    ('safety_work_permit_status', '已提交', '20', 20, 'primary'),
    ('safety_work_permit_status', '物业审批中', '30', 30, 'warning'),
    ('safety_work_permit_status', '安全审批中', '40', 40, 'warning'),
    ('safety_work_permit_status', '运营审批中', '50', 50, 'warning'),
    ('safety_work_permit_status', '已签发', '60', 60, 'success'),
    ('safety_work_permit_status', '开工中', '70', 70, 'primary'),
    ('safety_work_permit_status', '完工待收单', '80', 80, 'primary'),
    ('safety_work_permit_status', '已闭环', '90', 90, 'success'),
    ('safety_work_permit_status', '已驳回', '91', 91, 'danger'),
    ('safety_work_permit_status', '已作废', '92', 92, 'default'),
    ('safety_work_permit_status', '已停工', '93', 93, 'danger'),
    ('safety_work_permit_check_type', '开工检查', 'start_check', 10, 'primary'),
    ('safety_work_permit_check_type', '过程巡查', 'process_check', 20, 'warning'),
    ('safety_work_permit_check_type', '完工检查', 'end_check', 30, 'success'),
    ('safety_work_permit_check_type', '违规检查', 'violation_check', 40, 'danger'),
    ('safety_work_permit_check_result', '通过', 'pass', 10, 'success'),
    ('safety_work_permit_check_result', '不通过', 'fail', 20, 'warning'),
    ('safety_work_permit_check_result', '违规', 'violation', 30, 'danger'),
    ('safety_hazard_status', '已转应急', '92', 92, 'danger')
),
updated_items AS (
  UPDATE sys_dict_item existing
  SET item_label = dict_items.item_label,
      sort_order = dict_items.sort_order,
      status = 'enabled',
      tag_type = dict_items.tag_type,
      remark = 'S5-B final permission/menu/dictionary seed patch',
      update_time = now()
  FROM dict_items
  JOIN all_types ON all_types.dict_code = dict_items.dict_code
  WHERE existing.tenant_id = all_types.tenant_id
    AND existing.park_id = all_types.park_id
    AND existing.dict_type_id = all_types.id
    AND existing.item_value = dict_items.item_value
    AND existing.is_deleted = false
  RETURNING existing.id
)
INSERT INTO sys_dict_item (tenant_id, park_id, dict_type_id, item_label, item_value, sort_order, status, tag_type, remark)
SELECT all_types.tenant_id,
       all_types.park_id,
       all_types.id,
       dict_items.item_label,
       dict_items.item_value,
       dict_items.sort_order,
       'enabled',
       dict_items.tag_type,
       'S5-B final permission/menu/dictionary seed patch'
FROM dict_items
JOIN all_types ON all_types.dict_code = dict_items.dict_code
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_dict_item existing
  WHERE existing.tenant_id = all_types.tenant_id
    AND existing.park_id = all_types.park_id
    AND existing.dict_type_id = all_types.id
    AND existing.item_value = dict_items.item_value
    AND existing.is_deleted = false
);

WITH field_policies(entity, field_key, field_name, policy_type, mask_rule, remark) AS (
  VALUES
    ('emergency_contact', 'mobile', '应急联系人手机号', 'masked', 'mobile', 'S5-B emergency contact mobile policy'),
    ('emergency_contact', 'email', '应急联系人邮箱', 'masked', 'email', 'S5-B emergency contact email policy'),
    ('emergencyContact', 'mobile', '应急联系人手机号', 'masked', 'mobile', 'S5-B emergencyContact mobile policy'),
    ('emergencyContact', 'email', '应急联系人邮箱', 'masked', 'email', 'S5-B emergencyContact email policy'),
    ('biz_safety_emergency_contact', 'mobile', '应急联系人手机号', 'masked', 'mobile', 'S5-B biz emergency contact mobile policy'),
    ('biz_safety_emergency_contact', 'email', '应急联系人邮箱', 'masked', 'email', 'S5-B biz emergency contact email policy'),
    ('emergency_event', 'reporter_mobile', '上报人手机号', 'masked', 'mobile', 'S5-B emergency event reporter mobile policy'),
    ('emergency_event', 'description', '事件描述', 'visible', NULL, 'S5-B emergency event description policy'),
    ('emergency_event', 'photos_file_ids', '事件照片', 'visible', NULL, 'S5-B emergency event photos policy'),
    ('emergency_event', 'videos_file_ids', '事件视频', 'visible', NULL, 'S5-B emergency event videos policy'),
    ('emergency_event', 'gps_lng', '应急事件经度', 'masked', 'custom', 'S5-B emergency event gps lng policy'),
    ('emergency_event', 'gps_lat', '应急事件纬度', 'masked', 'custom', 'S5-B emergency event gps lat policy'),
    ('emergency_event', 'conclusion', '应急事件复盘结论', 'visible', NULL, 'S5-B emergency event conclusion policy'),
    ('emergency_event', 'review_file_id', '应急事件复盘附件', 'visible', NULL, 'S5-B emergency event review file policy'),
    ('emergencyEvent', 'reporterMobile', '上报人手机号', 'masked', 'mobile', 'S5-B emergencyEvent reporterMobile policy'),
    ('emergencyEvent', 'description', '事件描述', 'visible', NULL, 'S5-B emergencyEvent description policy'),
    ('emergencyEvent', 'photosFileIds', '事件照片', 'visible', NULL, 'S5-B emergencyEvent photos policy'),
    ('emergencyEvent', 'videosFileIds', '事件视频', 'visible', NULL, 'S5-B emergencyEvent videos policy'),
    ('emergencyEvent', 'gpsLng', '应急事件经度', 'masked', 'custom', 'S5-B emergencyEvent gps lng policy'),
    ('emergencyEvent', 'gpsLat', '应急事件纬度', 'masked', 'custom', 'S5-B emergencyEvent gps lat policy'),
    ('emergencyEvent', 'conclusion', '应急事件复盘结论', 'visible', NULL, 'S5-B emergencyEvent conclusion policy'),
    ('emergencyEvent', 'reviewFileId', '应急事件复盘附件', 'visible', NULL, 'S5-B emergencyEvent review file policy'),
    ('biz_safety_emergency_event', 'reporter_mobile', '上报人手机号', 'masked', 'mobile', 'S5-B biz emergency event reporter mobile policy'),
    ('biz_safety_emergency_event', 'description', '事件描述', 'visible', NULL, 'S5-B biz emergency event description policy'),
    ('biz_safety_emergency_event', 'photos_file_ids', '事件照片', 'visible', NULL, 'S5-B biz emergency event photos policy'),
    ('biz_safety_emergency_event', 'videos_file_ids', '事件视频', 'visible', NULL, 'S5-B biz emergency event videos policy'),
    ('biz_safety_emergency_event', 'gps_lng', '应急事件经度', 'masked', 'custom', 'S5-B biz emergency event gps lng policy'),
    ('biz_safety_emergency_event', 'gps_lat', '应急事件纬度', 'masked', 'custom', 'S5-B biz emergency event gps lat policy'),
    ('biz_safety_emergency_event', 'conclusion', '应急事件复盘结论', 'visible', NULL, 'S5-B biz emergency event conclusion policy'),
    ('biz_safety_emergency_event', 'review_file_id', '应急事件复盘附件', 'visible', NULL, 'S5-B biz emergency event review file policy'),
    ('work_permit', 'apply_mobile', '申请人手机号', 'masked', 'mobile', 'S5-B work permit applicant mobile policy'),
    ('work_permit', 'contractor_mobile', '施工联系人手机号', 'masked', 'mobile', 'S5-B work permit contractor mobile policy'),
    ('work_permit', 'protective_measures', '防护措施', 'visible', NULL, 'S5-B work permit protective measures policy'),
    ('work_permit', 'start_check_photo_file_ids', '开工检查照片', 'visible', NULL, 'S5-B work permit start photo policy'),
    ('work_permit', 'end_check_photo_file_ids', '完工检查照片', 'visible', NULL, 'S5-B work permit end photo policy'),
    ('workPermit', 'applyMobile', '申请人手机号', 'masked', 'mobile', 'S5-B workPermit applicant mobile policy'),
    ('workPermit', 'contractorMobile', '施工联系人手机号', 'masked', 'mobile', 'S5-B workPermit contractor mobile policy'),
    ('workPermit', 'protectiveMeasures', '防护措施', 'visible', NULL, 'S5-B workPermit protective measures policy'),
    ('workPermit', 'startCheckPhotoFileIds', '开工检查照片', 'visible', NULL, 'S5-B workPermit start photo policy'),
    ('workPermit', 'endCheckPhotoFileIds', '完工检查照片', 'visible', NULL, 'S5-B workPermit end photo policy'),
    ('biz_safety_work_permit', 'apply_mobile', '申请人手机号', 'masked', 'mobile', 'S5-B biz work permit applicant mobile policy'),
    ('biz_safety_work_permit', 'contractor_mobile', '施工联系人手机号', 'masked', 'mobile', 'S5-B biz work permit contractor mobile policy'),
    ('biz_safety_work_permit', 'protective_measures', '防护措施', 'visible', NULL, 'S5-B biz work permit protective measures policy'),
    ('biz_safety_work_permit', 'start_check_photo_file_ids', '开工检查照片', 'visible', NULL, 'S5-B biz work permit start photo policy'),
    ('biz_safety_work_permit', 'end_check_photo_file_ids', '完工检查照片', 'visible', NULL, 'S5-B biz work permit end photo policy'),
    ('work_permit_check', 'violation_desc', '作业许可巡查违规说明', 'visible', NULL, 'S5-B work permit check violation policy'),
    ('work_permit_check', 'photo_file_ids', '作业许可巡查照片', 'visible', NULL, 'S5-B work permit check photo policy'),
    ('workPermitCheck', 'violationDesc', '作业许可巡查违规说明', 'visible', NULL, 'S5-B workPermitCheck violation policy'),
    ('workPermitCheck', 'photoFileIds', '作业许可巡查照片', 'visible', NULL, 'S5-B workPermitCheck photo policy'),
    ('biz_safety_work_permit_check', 'violation_desc', '作业许可巡查违规说明', 'visible', NULL, 'S5-B biz work permit check violation policy'),
    ('biz_safety_work_permit_check', 'photo_file_ids', '作业许可巡查照片', 'visible', NULL, 'S5-B biz work permit check photo policy')
)
INSERT INTO sys_field_policy (
  id, tenant_id, park_id, module, entity, field_key, field_name, policy_type,
  mask_rule, status, create_time, update_time, is_deleted, version, remark
)
SELECT uuid_generate_v4(),
       '10000001',
       '20000001',
       'safety',
       field_policies.entity,
       field_policies.field_key,
       field_policies.field_name,
       field_policies.policy_type,
       field_policies.mask_rule,
       'enabled',
       now(),
       now(),
       false,
       1,
       field_policies.remark
FROM field_policies
ON CONFLICT (tenant_id, module, entity, field_key) WHERE is_deleted = false DO UPDATE SET
  field_name = EXCLUDED.field_name,
  policy_type = EXCLUDED.policy_type,
  mask_rule = EXCLUDED.mask_rule,
  status = EXCLUDED.status,
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
plans(plan_code, plan_name, incident_type, severity_level, response_level, commander_role, response_team_role_codes, steps_json, remark) AS (
  VALUES
    (
      'EP-FIRE-DEFAULT',
      '火情应急预案',
      'fire',
      '30',
      '30',
      'SAFETY_MANAGER',
      jsonb_build_array('SAFETY_MANAGER', 'PROPERTY_MANAGER', 'SECURITY_GUARD'),
      jsonb_build_array(
        jsonb_build_object('sort_no', 1, 'title', '初步上报', 'content', '确认起火位置、火势范围、人员风险并完成事件上报。'),
        jsonb_build_object('sort_no', 2, 'title', '现场警戒', 'content', '划定警戒区域，禁止无关人员进入。'),
        jsonb_build_object('sort_no', 3, 'title', '通知安全主管', 'content', '通知安全主管、物业负责人和现场应急联系人。'),
        jsonb_build_object('sort_no', 4, 'title', '断电 / 疏散', 'content', '视现场情况断电并组织人员疏散。'),
        jsonb_build_object('sort_no', 5, 'title', '灭火处置', 'content', '在安全前提下使用消防器材处置初起火情。'),
        jsonb_build_object('sort_no', 6, 'title', '复盘整改', 'content', '事件控制后完成复盘、隐患整改和闭环记录。')
      ),
      'S5-B default fire emergency plan'
    ),
    (
      'EP-ELECTRICAL-DEFAULT',
      '电气事故应急预案',
      'electrical',
      '20',
      '20',
      'SAFETY_MANAGER',
      jsonb_build_array('SAFETY_MANAGER', 'PROPERTY_MANAGER', 'MAINTENANCE_ENGINEER'),
      jsonb_build_array(
        jsonb_build_object('sort_no', 1, 'title', '切断电源', 'content', '确认安全后优先切断相关电源。'),
        jsonb_build_object('sort_no', 2, 'title', '设置警戒', 'content', '隔离故障区域，避免人员触电或二次伤害。'),
        jsonb_build_object('sort_no', 3, 'title', '通知电工和安全主管', 'content', '通知电工、安全主管和物业负责人到场。'),
        jsonb_build_object('sort_no', 4, 'title', '排查故障点', 'content', '排查配电箱、线路、设备负荷和短路风险。'),
        jsonb_build_object('sort_no', 5, 'title', '恢复供电', 'content', '故障排除并确认安全后恢复供电。'),
        jsonb_build_object('sort_no', 6, 'title', '复盘整改', 'content', '记录事故原因、整改措施和复盘结论。')
      ),
      'S5-B default electrical emergency plan'
    )
)
INSERT INTO biz_safety_emergency_plan (
  tenant_id,
  park_id,
  code,
  plan_code,
  plan_name,
  incident_type,
  severity_level,
  response_level,
  commander_role,
  response_team_role_codes,
  steps_json,
  attachment_file_ids,
  status,
  create_time,
  update_time,
  is_deleted,
  version,
  remark
)
SELECT seed_scope.tenant_id,
       seed_scope.park_id,
       plans.plan_code,
       plans.plan_code,
       plans.plan_name,
       plans.incident_type,
       plans.severity_level,
       plans.response_level,
       plans.commander_role,
       plans.response_team_role_codes,
       plans.steps_json,
       '[]'::jsonb,
       'enabled',
       now(),
       now(),
       false,
       1,
       plans.remark
FROM plans
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, park_id, plan_code) WHERE is_deleted = false DO UPDATE SET
  code = EXCLUDED.code,
  plan_name = EXCLUDED.plan_name,
  incident_type = EXCLUDED.incident_type,
  severity_level = EXCLUDED.severity_level,
  response_level = EXCLUDED.response_level,
  commander_role = EXCLUDED.commander_role,
  response_team_role_codes = EXCLUDED.response_team_role_codes,
  steps_json = EXCLUDED.steps_json,
  status = 'enabled',
  update_time = now(),
  remark = EXCLUDED.remark;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
s5b_permissions(permission_code) AS (
  VALUES
    ('safety:emergency-dashboard'),
    ('safety:emergencies'),
    ('safety:emergency-plans'),
    ('safety:emergency-contacts'),
    ('safety:work-permits'),
    ('safety_emergency_contact:read'),
    ('safety_emergency_contact:create'),
    ('safety_emergency_contact:update'),
    ('safety_emergency_contact:delete'),
    ('safety_emergency_plan:read'),
    ('safety_emergency_plan:create'),
    ('safety_emergency_plan:update'),
    ('safety_emergency_plan:delete'),
    ('safety_emergency:read'),
    ('safety_emergency:create'),
    ('safety_emergency:update'),
    ('safety_emergency:delete'),
    ('safety_emergency:sos'),
    ('safety_emergency:respond'),
    ('safety_emergency:dispose'),
    ('safety_emergency:control'),
    ('safety_emergency:review'),
    ('safety_emergency:close'),
    ('safety_emergency:upgrade'),
    ('safety_emergency:cancel'),
    ('safety_emergency:create_workorder'),
    ('safety_emergency_timeline:read'),
    ('safety_emergency_timeline:create'),
    ('safety_hazard:to_emergency'),
    ('safety_work_permit:read'),
    ('safety_work_permit:create'),
    ('safety_work_permit:update'),
    ('safety_work_permit:delete'),
    ('safety_work_permit:submit'),
    ('safety_work_permit:approve_property'),
    ('safety_work_permit:approve_safety'),
    ('safety_work_permit:approve_operation'),
    ('safety_work_permit:reject'),
    ('safety_work_permit:void'),
    ('safety_work_permit:start'),
    ('safety_work_permit:process_check'),
    ('safety_work_permit:stop'),
    ('safety_work_permit:finish'),
    ('safety_work_permit:close'),
    ('safety_work_permit:create_hazard'),
    ('safety_work_permit:create_workorder'),
    ('safety_work_permit:override_conflict'),
    ('safety_emergency_statistics:read'),
    ('safety_work_permit_statistics:read')
),
full_roles(role_code) AS (
  VALUES ('SUPER_ADMIN'), ('OPERATIONS_OWNER'), ('SAFETY_MANAGER')
),
role_permissions(role_code, permission_code) AS (
  SELECT full_roles.role_code, s5b_permissions.permission_code
  FROM full_roles
  CROSS JOIN s5b_permissions
  UNION ALL
  SELECT *
  FROM (VALUES
    ('EXECUTIVE', 'safety:emergency-dashboard'),
    ('EXECUTIVE', 'safety:emergencies'),
    ('EXECUTIVE', 'safety:work-permits'),
    ('EXECUTIVE', 'safety_emergency:read'),
    ('EXECUTIVE', 'safety_emergency_timeline:read'),
    ('EXECUTIVE', 'safety_work_permit:read'),
    ('EXECUTIVE', 'safety_emergency_statistics:read'),
    ('EXECUTIVE', 'safety_work_permit_statistics:read'),
    ('SAFETY_OFFICER', 'safety:emergencies'),
    ('SAFETY_OFFICER', 'safety:work-permits'),
    ('SAFETY_OFFICER', 'safety_emergency:read'),
    ('SAFETY_OFFICER', 'safety_emergency:create'),
    ('SAFETY_OFFICER', 'safety_emergency:sos'),
    ('SAFETY_OFFICER', 'safety_emergency:respond'),
    ('SAFETY_OFFICER', 'safety_emergency:dispose'),
    ('SAFETY_OFFICER', 'safety_emergency:control'),
    ('SAFETY_OFFICER', 'safety_emergency_timeline:read'),
    ('SAFETY_OFFICER', 'safety_emergency_timeline:create'),
    ('SAFETY_OFFICER', 'safety_work_permit:read'),
    ('SAFETY_OFFICER', 'safety_work_permit:process_check'),
    ('SAFETY_OFFICER', 'safety_work_permit:stop'),
    ('SAFETY_OFFICER', 'safety_work_permit:create_hazard'),
    ('SECURITY_GUARD', 'safety:emergencies'),
    ('SECURITY_GUARD', 'safety:work-permits'),
    ('SECURITY_GUARD', 'safety_emergency:read'),
    ('SECURITY_GUARD', 'safety_emergency:create'),
    ('SECURITY_GUARD', 'safety_emergency:sos'),
    ('SECURITY_GUARD', 'safety_emergency:respond'),
    ('SECURITY_GUARD', 'safety_emergency:dispose'),
    ('SECURITY_GUARD', 'safety_emergency:control'),
    ('SECURITY_GUARD', 'safety_emergency_timeline:read'),
    ('SECURITY_GUARD', 'safety_emergency_timeline:create'),
    ('SECURITY_GUARD', 'safety_work_permit:read'),
    ('SECURITY_GUARD', 'safety_work_permit:process_check'),
    ('SECURITY_GUARD', 'safety_work_permit:stop'),
    ('SECURITY_GUARD', 'safety_work_permit:create_hazard'),
    ('PROPERTY_MANAGER', 'safety:emergency-dashboard'),
    ('PROPERTY_MANAGER', 'safety:emergencies'),
    ('PROPERTY_MANAGER', 'safety:work-permits'),
    ('PROPERTY_MANAGER', 'safety_emergency:read'),
    ('PROPERTY_MANAGER', 'safety_emergency:respond'),
    ('PROPERTY_MANAGER', 'safety_emergency:dispose'),
    ('PROPERTY_MANAGER', 'safety_emergency_timeline:read'),
    ('PROPERTY_MANAGER', 'safety_emergency_timeline:create'),
    ('PROPERTY_MANAGER', 'safety_work_permit:read'),
    ('PROPERTY_MANAGER', 'safety_work_permit:create'),
    ('PROPERTY_MANAGER', 'safety_work_permit:approve_property'),
    ('PROPERTY_MANAGER', 'safety_work_permit:reject'),
    ('PROPERTY_MANAGER', 'safety_work_permit:start'),
    ('PROPERTY_MANAGER', 'safety_work_permit:finish'),
    ('PROPERTY_MANAGER', 'safety_work_permit:close'),
    ('PROPERTY_MANAGER', 'safety_work_permit_statistics:read'),
    ('MAINTENANCE_ENGINEER', 'safety:emergencies'),
    ('MAINTENANCE_ENGINEER', 'safety:work-permits'),
    ('MAINTENANCE_ENGINEER', 'safety_emergency:read'),
    ('MAINTENANCE_ENGINEER', 'safety_work_permit:read')
  ) AS extra(role_code, permission_code)
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted, version, remark)
SELECT seed_scope.tenant_id,
       seed_scope.park_id,
       role.id,
       permission.id,
       now(),
       now(),
       false,
       1,
       'S5-B final role permission seed patch'
FROM seed_scope
JOIN role_permissions ON true
JOIN sys_role role
  ON role.tenant_id = seed_scope.tenant_id
 AND role.park_id = seed_scope.park_id
 AND role.code = role_permissions.role_code
 AND role.is_deleted = false
JOIN sys_permission permission
  ON permission.tenant_id = seed_scope.tenant_id
 AND permission.park_id = seed_scope.park_id
 AND permission.code = role_permissions.permission_code
 AND permission.is_deleted = false
WHERE NOT EXISTS (
  SELECT 1
  FROM rel_role_perm existing
  WHERE existing.tenant_id = seed_scope.tenant_id
    AND existing.park_id = seed_scope.park_id
    AND existing.role_id = role.id
    AND existing.permission_id = permission.id
    AND existing.is_deleted = false
);
