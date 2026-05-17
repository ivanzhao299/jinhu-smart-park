export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  request_id: string;
  server_time: number;
}

export interface TenantParkScope {
  tenantId: string;
  parkId: string;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface AuthUser {
  id: string;
  username: string;
  realName?: string;
  real_name?: string;
  mobile?: string | null;
  email?: string | null;
  tenantId: string;
  parkId: string;
  tenant_id?: string;
  park_id?: string;
  org_id?: string | null;
  org_name?: string | null;
  roles: string[];
  permissions: string[];
  data_scope?: string;
  is_super?: boolean;
}

export interface RoleContext {
  role_code: string;
  role_name: string;
}

export interface FieldPermissionContext {
  resource: string;
  field_key: string;
  access_mode: "none" | "read" | "write" | "mask";
}

export interface FieldPolicyContext {
  module: string;
  entity: string;
  field_key: string;
  field_name: string;
  policy_type: "visible" | "masked" | "hidden" | "readonly" | "editable";
  mask_rule?: string | null;
}

export interface UserParkContext {
  tenant_id?: string;
  park_id: string;
  park_code?: string | null;
  park_name: string;
  is_default: boolean;
  status: string;
}

export interface UserDataScopeContext {
  rule_code?: string;
  rule_name?: string;
  dimension: string;
  scope_type: string;
  scope_config?: Record<string, unknown>;
}

export interface EnabledModuleContext {
  module_code: string;
  module_name: string;
  module_group: string;
  route_prefix?: string | null;
  icon?: string | null;
  enabled: boolean;
  expire_time?: string | null;
}

export interface UserContext {
  id: string;
  username: string;
  real_name: string;
  mobile: string | null;
  email: string | null;
  tenant_id: string;
  park_id: string;
  park_name?: string | null;
  accessible_parks?: UserParkContext[];
  current_park?: UserParkContext | null;
  org_id: string | null;
  org_name: string | null;
  roles: RoleContext[];
  permissions: string[];
  data_scope: string;
  data_scopes?: UserDataScopeContext[];
  field_permissions?: FieldPermissionContext[];
  field_policies?: FieldPolicyContext[];
  enabled_modules?: EnabledModuleContext[];
  menu_tree?: UserMenuTreeNode[];
  menus?: UserMenuTreeNode[];
  is_super: boolean;
}

export interface UserMenuTreeNode {
  label: string;
  href?: string;
  permission?: string;
  module?: string;
  icon?: string;
  children?: UserMenuTreeNode[];
}

export enum RoleDataScope {
  Self = "self",
  Org = "org",
  Park = "park",
  Tenant = "tenant",
  Custom = "custom",
  All = "all"
}

export enum SystemStatus {
  Enabled = "enabled",
  Disabled = "disabled"
}

export const SYSTEM_PERMISSIONS = {
  ORG_LIST: "system:org:list",
  ORG_CREATE: "system:org:create",
  ORG_DETAIL: "system:org:detail",
  ORG_UPDATE: "system:org:update",
  ORG_DELETE: "system:org:delete",
  USER_LIST: "system:user:list",
  USER_CREATE: "system:user:create",
  USER_DETAIL: "system:user:detail",
  USER_UPDATE: "system:user:update",
  USER_DELETE: "system:user:delete",
  USER_RESET_PASSWORD: "system:user:reset-password",
  USER_ASSIGN_ROLES: "system:user:assign-roles",
  USER_ME: "system:user:me",
  ROLE_LIST: "system:role:list",
  ROLE_CREATE: "system:role:create",
  ROLE_DETAIL: "system:role:detail",
  ROLE_UPDATE: "system:role:update",
  ROLE_DELETE: "system:role:delete",
  ROLE_ASSIGN_PERMISSIONS: "system:role:assign-permissions",
  ROLE_READ: "role:read",
  ROLE_OPEN_CREATE: "role:create",
  ROLE_OPEN_UPDATE: "role:update",
  ROLE_COPY: "role:copy",
  ROLE_DISABLE: "role:disable",
  ROLE_OPEN_DELETE: "role:delete",
  TENANT_READ: "tenant:read",
  TENANT_MANAGE: "tenant:manage",
  PARK_TENANT_READ: "park_tenant:read",
  PARK_TENANT_360: "park_tenant:360",
  PARK_TENANT_CREATE: "park_tenant:create",
  PARK_TENANT_UPDATE: "park_tenant:update",
  PARK_TENANT_DELETE: "park_tenant:delete",
  PARK_TENANT_RISK_UPDATE: "park_tenant:risk_update",
  PARK_TENANT_RISK_LOG: "park_tenant:risk_log",
  PARK_TENANT_CONTACT_READ: "park_tenant_contact:read",
  PARK_TENANT_CONTACT_CREATE: "park_tenant_contact:create",
  PARK_TENANT_CONTACT_UPDATE: "park_tenant_contact:update",
  PARK_TENANT_CONTACT_DELETE: "park_tenant_contact:delete",
  PARK_TENANT_QUALIFICATION_READ: "park_tenant_qualification:read",
  PARK_TENANT_QUALIFICATION_CREATE: "park_tenant_qualification:create",
  PARK_TENANT_QUALIFICATION_UPDATE: "park_tenant_qualification:update",
  PARK_TENANT_QUALIFICATION_DELETE: "park_tenant_qualification:delete",
  LEASING_LEAD_READ: "leasing_lead:read",
  LEASING_LEAD_CREATE: "leasing_lead:create",
  LEASING_LEAD_UPDATE: "leasing_lead:update",
  LEASING_LEAD_DELETE: "leasing_lead:delete",
  LEASING_LEAD_CHANGE_STATUS: "leasing_lead:change_status",
  LEASING_LEAD_FORCE_CHANGE_STATUS: "leasing_lead:force_change_status",
  LEASING_LEAD_CONFIRM_SIGN: "leasing_lead:confirm_sign",
  LEASING_LEAD_STATUS_LOG: "leasing_lead:status_log",
  LEASING_LEAD_CONVERT_TO_PARK_TENANT: "leasing_lead:convert_to_park_tenant",
  LEASING_LEAD_POOL_READ: "leasing_lead_pool:read",
  LEASING_LEAD_ASSIGN: "leasing_lead:assign",
  LEASING_LEAD_RECLAIM: "leasing_lead:reclaim",
  LEASING_LEAD_MOVE_TO_POOL: "leasing_lead:move_to_pool",
  LEASING_FOLLOW_READ: "leasing_follow:read",
  LEASING_FOLLOW_CREATE: "leasing_follow:create",
  LEASING_FOLLOW_UPDATE: "leasing_follow:update",
  LEASING_FOLLOW_DELETE: "leasing_follow:delete",
  LEASING_VISIT_READ: "leasing_visit:read",
  LEASING_VISIT_CREATE: "leasing_visit:create",
  LEASING_VISIT_UPDATE: "leasing_visit:update",
  LEASING_VISIT_DELETE: "leasing_visit:delete",
  LEASING_QUOTE_READ: "leasing_quote:read",
  LEASING_QUOTE_CREATE: "leasing_quote:create",
  LEASING_QUOTE_UPDATE: "leasing_quote:update",
  LEASING_QUOTE_DELETE: "leasing_quote:delete",
  LEASING_QUOTE_SUBMIT: "leasing_quote:submit",
  LEASING_QUOTE_APPROVE: "leasing_quote:approve",
  LEASING_QUOTE_REJECT: "leasing_quote:reject",
  LEASING_QUOTE_CREATE_CONTRACT: "leasing_quote:create_contract",
  LEASING_CONTRACT_READ: "leasing_contract:read",
  LEASING_CONTRACT_CREATE: "leasing_contract:create",
  LEASING_CONTRACT_UPDATE: "leasing_contract:update",
  LEASING_CONTRACT_DELETE: "leasing_contract:delete",
  LEASING_CONTRACT_SUBMIT: "leasing_contract:submit",
  LEASING_CONTRACT_APPROVE: "leasing_contract:approve",
  LEASING_CONTRACT_REJECT: "leasing_contract:reject",
  LEASING_CONTRACT_VOID: "leasing_contract:void",
  LEASING_CONTRACT_ARCHIVE: "leasing_contract:archive",
  LEASING_CONTRACT_EFFECTIVE: "leasing_contract:effective",
  LEASING_CONTRACT_STATUS_LOG: "leasing_contract:status_log",
  LEASING_CONTRACT_FILE_READ: "leasing_contract:file_read",
  LEASING_CONTRACT_UNIT_READ: "leasing_contract_unit:read",
  LEASING_CONTRACT_UNIT_CREATE: "leasing_contract_unit:create",
  LEASING_CONTRACT_UNIT_UPDATE: "leasing_contract_unit:update",
  LEASING_CONTRACT_UNIT_DELETE: "leasing_contract_unit:delete",
  LEASING_CONTRACT_RECALCULATE: "leasing_contract:recalculate",
  LEASING_CONTRACT_OVERRIDE_AREA: "leasing_contract:override_area",
  LEASING_CONTRACT_FORCE_BIND_UNIT: "leasing_contract:force_bind_unit",
  LEASING_CONTRACT_EDIT_AFTER_SUBMIT: "leasing_contract:edit_after_submit",
  LEASING_STATISTICS_FUNNEL: "leasing_statistics:funnel",
  PERMISSION_LIST: "system:permission:list",
  PERMISSION_TREE: "system:permission:tree",
  PERMISSION_CREATE: "system:permission:create",
  PERMISSION_UPDATE: "system:permission:update",
  PERMISSION_DELETE: "system:permission:delete",
  PERMISSION_READ: "permission:read",
  PERMISSION_OPEN_CREATE: "permission:create",
  PERMISSION_OPEN_UPDATE: "permission:update",
  PERMISSION_OPEN_DELETE: "permission:delete",
  DATA_SCOPE_READ: "system:data-scope:read",
  DATA_SCOPE_CREATE: "system:data-scope:create",
  DATA_SCOPE_UPDATE: "system:data-scope:update",
  DATA_SCOPE_DELETE: "system:data-scope:delete",
  DATA_SCOPE_ASSIGN: "system:data-scope:assign",
  DATA_SCOPE_OPEN_READ: "data_scope:read",
  DATA_SCOPE_OPEN_CREATE: "data_scope:create",
  DATA_SCOPE_OPEN_UPDATE: "data_scope:update",
  DATA_SCOPE_OPEN_DELETE: "data_scope:delete",
  ROLE_ASSIGN_DATA_SCOPE: "role:assign_data_scope",
  FIELD_POLICY_READ: "system:field-policy:read",
  FIELD_POLICY_CREATE: "system:field-policy:create",
  FIELD_POLICY_UPDATE: "system:field-policy:update",
  FIELD_POLICY_DELETE: "system:field-policy:delete",
  FIELD_POLICY_ASSIGN: "system:field-policy:assign",
  FIELD_POLICY_OPEN_READ: "field_policy:read",
  FIELD_POLICY_OPEN_CREATE: "field_policy:create",
  FIELD_POLICY_OPEN_UPDATE: "field_policy:update",
  FIELD_POLICY_OPEN_DELETE: "field_policy:delete",
  ROLE_ASSIGN_FIELD_POLICY: "role:assign_field_policy",
  DICT_TYPE_LIST: "system:dict-type:list",
  DICT_TYPE_CREATE: "system:dict-type:create",
  DICT_TYPE_DETAIL: "system:dict-type:detail",
  DICT_TYPE_UPDATE: "system:dict-type:update",
  DICT_TYPE_DELETE: "system:dict-type:delete",
  DICT_ITEM_LIST: "system:dict-item:list",
  DICT_ITEM_CREATE: "system:dict-item:create",
  DICT_ITEM_DETAIL: "system:dict-item:detail",
  DICT_ITEM_UPDATE: "system:dict-item:update",
  DICT_ITEM_DELETE: "system:dict-item:delete",
  ATTACHMENT_LIST: "system:attachment:list",
  ATTACHMENT_CREATE: "system:attachment:create",
  ATTACHMENT_DETAIL: "system:attachment:detail",
  ATTACHMENT_DELETE: "system:attachment:delete",
  FILE_READ: "file:read",
  FILE_UPLOAD: "file:upload",
  FILE_DOWNLOAD: "file:download",
  FILE_DELETE: "file:delete",
  AUDIT_LOGIN_LOG_LIST: "system:audit:login-log:list",
  AUDIT_OP_LOG_LIST: "system:audit:op-log:list",
  AUDIT_READ: "audit:read",
  AUDIT_EXPORT: "audit:export",
  PARK_READ: "park:read",
  PARK_CREATE: "park:create",
  PARK_UPDATE: "park:update",
  PARK_DELETE: "park:delete",
  BUILDING_READ: "building:read",
  BUILDING_CREATE: "building:create",
  BUILDING_UPDATE: "building:update",
  BUILDING_DELETE: "building:delete",
  FLOOR_READ: "floor:read",
  FLOOR_CREATE: "floor:create",
  FLOOR_UPDATE: "floor:update",
  FLOOR_DELETE: "floor:delete",
  FLOOR_UPLOAD_LAYOUT: "floor:upload_layout",
  UNIT_READ: "unit:read",
  UNIT_CREATE: "unit:create",
  UNIT_UPDATE: "unit:update",
  UNIT_DELETE: "unit:delete",
  UNIT_TRANSITION_STATUS: "unit:transition_status",
  UNIT_CHANGE_STATUS: "unit:change_status",
  UNIT_FORCE_CHANGE_STATUS: "unit:force_change_status",
  UNIT_STATUS_LOG: "unit:status_log",
  UNIT_IMPORT: "unit:import",
  UNIT_IMPORT_TEMPLATE: "unit:import_template",
  UNIT_EXPORT: "unit:export",
  ASSET_READ: "asset:read",
  ASSET_STATUS_BOARD: "asset:status_board",
  ASSET_STATISTICS: "asset:statistics",
  ASSET_STATISTICS_READ: "asset:statistics:read",
  ASSET_PARK_LIST: "asset:park:list",
  ASSET_PARK_CREATE: "asset:park:create",
  ASSET_PARK_DETAIL: "asset:park:detail",
  ASSET_PARK_UPDATE: "asset:park:update",
  ASSET_PARK_DELETE: "asset:park:delete",
  ASSET_BUILDING_LIST: "asset:building:list",
  ASSET_BUILDING_CREATE: "asset:building:create",
  ASSET_BUILDING_DETAIL: "asset:building:detail",
  ASSET_BUILDING_UPDATE: "asset:building:update",
  ASSET_BUILDING_DELETE: "asset:building:delete",
  ASSET_FLOOR_LIST: "asset:floor:list",
  ASSET_FLOOR_CREATE: "asset:floor:create",
  ASSET_FLOOR_DETAIL: "asset:floor:detail",
  ASSET_FLOOR_UPDATE: "asset:floor:update",
  ASSET_FLOOR_DELETE: "asset:floor:delete",
  ASSET_UNIT_LIST: "asset:unit:list",
  ASSET_UNIT_CREATE: "asset:unit:create",
  ASSET_UNIT_DETAIL: "asset:unit:detail",
  ASSET_UNIT_UPDATE: "asset:unit:update",
  ASSET_UNIT_DELETE: "asset:unit:delete",
  CODE_RULE_READ: "system:code-rule:read",
  CODE_RULE_CREATE: "system:code-rule:create",
  CODE_RULE_UPDATE: "system:code-rule:update",
  CODE_RULE_DELETE: "system:code-rule:delete",
  CODE_RULE_GENERATE: "system:code-rule:generate",
  CODE_RULE_OPEN_READ: "code_rule:read",
  CODE_RULE_OPEN_CREATE: "code_rule:create",
  CODE_RULE_OPEN_UPDATE: "code_rule:update",
  CODE_RULE_OPEN_GENERATE: "code_rule:generate",
  MODULE_READ: "system:module:read",
  MODULE_CREATE: "system:module:create",
  MODULE_UPDATE: "system:module:update",
  MODULE_OPEN_READ: "module:read",
  MODULE_MANAGE: "module:manage",
  PLAN_READ: "system:plan:read",
  PLAN_CREATE: "system:plan:create",
  PLAN_UPDATE: "system:plan:update",
  PLAN_OPEN_READ: "plan:read",
  PLAN_MANAGE: "plan:manage",
  TENANT_MODULE_READ: "system:tenant-module:read",
  TENANT_MODULE_ASSIGN: "system:tenant-module:assign",
  TENANT_MODULE_OPEN_READ: "tenant_module:read",
  TENANT_MODULE_MANAGE: "tenant_module:manage"
} as const;

export type SystemPermissionCode = (typeof SYSTEM_PERMISSIONS)[keyof typeof SYSTEM_PERMISSIONS];

export interface PermissionSeed {
  code: SystemPermissionCode;
  name: string;
  resource: string;
  action: string;
}

export const SYSTEM_PERMISSION_SEEDS: PermissionSeed[] = [
  { code: SYSTEM_PERMISSIONS.ORG_LIST, name: "组织列表", resource: "system.org", action: "list" },
  { code: SYSTEM_PERMISSIONS.ORG_CREATE, name: "新增组织", resource: "system.org", action: "create" },
  { code: SYSTEM_PERMISSIONS.ORG_DETAIL, name: "组织详情", resource: "system.org", action: "detail" },
  { code: SYSTEM_PERMISSIONS.ORG_UPDATE, name: "编辑组织", resource: "system.org", action: "update" },
  { code: SYSTEM_PERMISSIONS.ORG_DELETE, name: "删除组织", resource: "system.org", action: "delete" },
  { code: SYSTEM_PERMISSIONS.USER_LIST, name: "用户列表", resource: "system.user", action: "list" },
  { code: SYSTEM_PERMISSIONS.USER_CREATE, name: "新增用户", resource: "system.user", action: "create" },
  { code: SYSTEM_PERMISSIONS.USER_DETAIL, name: "用户详情", resource: "system.user", action: "detail" },
  { code: SYSTEM_PERMISSIONS.USER_UPDATE, name: "编辑用户", resource: "system.user", action: "update" },
  { code: SYSTEM_PERMISSIONS.USER_DELETE, name: "删除用户", resource: "system.user", action: "delete" },
  { code: SYSTEM_PERMISSIONS.USER_RESET_PASSWORD, name: "重置密码", resource: "system.user", action: "reset-password" },
  { code: SYSTEM_PERMISSIONS.USER_ASSIGN_ROLES, name: "分配角色", resource: "system.user", action: "assign-roles" },
  { code: SYSTEM_PERMISSIONS.USER_ME, name: "当前用户", resource: "system.user", action: "me" },
  { code: SYSTEM_PERMISSIONS.ROLE_LIST, name: "角色列表", resource: "system.role", action: "list" },
  { code: SYSTEM_PERMISSIONS.ROLE_CREATE, name: "新增角色", resource: "system.role", action: "create" },
  { code: SYSTEM_PERMISSIONS.ROLE_DETAIL, name: "角色详情", resource: "system.role", action: "detail" },
  { code: SYSTEM_PERMISSIONS.ROLE_UPDATE, name: "编辑角色", resource: "system.role", action: "update" },
  { code: SYSTEM_PERMISSIONS.ROLE_DELETE, name: "删除角色", resource: "system.role", action: "delete" },
  { code: SYSTEM_PERMISSIONS.ROLE_ASSIGN_PERMISSIONS, name: "角色授权", resource: "system.role", action: "assign-permissions" },
  { code: SYSTEM_PERMISSIONS.ROLE_READ, name: "角色读取", resource: "system.role", action: "read" },
  { code: SYSTEM_PERMISSIONS.ROLE_OPEN_CREATE, name: "新建开放角色", resource: "system.role", action: "create" },
  { code: SYSTEM_PERMISSIONS.ROLE_OPEN_UPDATE, name: "编辑开放角色", resource: "system.role", action: "update" },
  { code: SYSTEM_PERMISSIONS.ROLE_COPY, name: "复制模板角色", resource: "system.role", action: "copy" },
  { code: SYSTEM_PERMISSIONS.ROLE_DISABLE, name: "停用启用角色", resource: "system.role", action: "disable" },
  { code: SYSTEM_PERMISSIONS.ROLE_OPEN_DELETE, name: "删除开放角色", resource: "system.role", action: "delete" },
  { code: SYSTEM_PERMISSIONS.TENANT_READ, name: "租户读取", resource: "system.tenant", action: "read" },
  { code: SYSTEM_PERMISSIONS.TENANT_MANAGE, name: "租户管理", resource: "system.tenant", action: "manage" },
  { code: SYSTEM_PERMISSIONS.PARK_TENANT_READ, name: "租户企业读取", resource: "biz.park_tenant", action: "read" },
  { code: SYSTEM_PERMISSIONS.PARK_TENANT_360, name: "租户企业 360 视图", resource: "biz.park_tenant", action: "360" },
  { code: SYSTEM_PERMISSIONS.PARK_TENANT_CREATE, name: "新增租户企业", resource: "biz.park_tenant", action: "create" },
  { code: SYSTEM_PERMISSIONS.PARK_TENANT_UPDATE, name: "编辑租户企业", resource: "biz.park_tenant", action: "update" },
  { code: SYSTEM_PERMISSIONS.PARK_TENANT_DELETE, name: "删除租户企业", resource: "biz.park_tenant", action: "delete" },
  { code: SYSTEM_PERMISSIONS.PARK_TENANT_RISK_UPDATE, name: "租户企业风险调整", resource: "biz.park_tenant", action: "risk_update" },
  { code: SYSTEM_PERMISSIONS.PARK_TENANT_RISK_LOG, name: "租户企业风险日志", resource: "biz.park_tenant_risk_log", action: "risk_log" },
  { code: SYSTEM_PERMISSIONS.PARK_TENANT_CONTACT_READ, name: "租户企业联系人读取", resource: "biz.park_tenant_contact", action: "read" },
  { code: SYSTEM_PERMISSIONS.PARK_TENANT_CONTACT_CREATE, name: "新增租户企业联系人", resource: "biz.park_tenant_contact", action: "create" },
  { code: SYSTEM_PERMISSIONS.PARK_TENANT_CONTACT_UPDATE, name: "编辑租户企业联系人", resource: "biz.park_tenant_contact", action: "update" },
  { code: SYSTEM_PERMISSIONS.PARK_TENANT_CONTACT_DELETE, name: "删除租户企业联系人", resource: "biz.park_tenant_contact", action: "delete" },
  { code: SYSTEM_PERMISSIONS.PARK_TENANT_QUALIFICATION_READ, name: "租户企业资质读取", resource: "biz.park_tenant_qualification", action: "read" },
  { code: SYSTEM_PERMISSIONS.PARK_TENANT_QUALIFICATION_CREATE, name: "新增租户企业资质", resource: "biz.park_tenant_qualification", action: "create" },
  { code: SYSTEM_PERMISSIONS.PARK_TENANT_QUALIFICATION_UPDATE, name: "编辑租户企业资质", resource: "biz.park_tenant_qualification", action: "update" },
  { code: SYSTEM_PERMISSIONS.PARK_TENANT_QUALIFICATION_DELETE, name: "删除租户企业资质", resource: "biz.park_tenant_qualification", action: "delete" },
  { code: SYSTEM_PERMISSIONS.LEASING_LEAD_READ, name: "招商线索读取", resource: "biz.leasing_lead", action: "read" },
  { code: SYSTEM_PERMISSIONS.LEASING_LEAD_CREATE, name: "新增招商线索", resource: "biz.leasing_lead", action: "create" },
  { code: SYSTEM_PERMISSIONS.LEASING_LEAD_UPDATE, name: "编辑招商线索", resource: "biz.leasing_lead", action: "update" },
  { code: SYSTEM_PERMISSIONS.LEASING_LEAD_DELETE, name: "删除招商线索", resource: "biz.leasing_lead", action: "delete" },
  { code: SYSTEM_PERMISSIONS.LEASING_LEAD_CHANGE_STATUS, name: "招商线索状态流转", resource: "biz.leasing_lead", action: "change_status" },
  { code: SYSTEM_PERMISSIONS.LEASING_LEAD_FORCE_CHANGE_STATUS, name: "招商线索强制状态流转", resource: "biz.leasing_lead", action: "force_change_status" },
  { code: SYSTEM_PERMISSIONS.LEASING_LEAD_CONFIRM_SIGN, name: "确认招商线索签约入驻", resource: "biz.leasing_lead", action: "confirm_sign" },
  { code: SYSTEM_PERMISSIONS.LEASING_LEAD_STATUS_LOG, name: "招商线索状态日志", resource: "biz.leasing_lead_status_log", action: "status_log" },
  { code: SYSTEM_PERMISSIONS.LEASING_LEAD_CONVERT_TO_PARK_TENANT, name: "招商线索转租户企业", resource: "biz.leasing_lead", action: "convert_to_park_tenant" },
  { code: SYSTEM_PERMISSIONS.LEASING_LEAD_POOL_READ, name: "招商公海池读取", resource: "biz.leasing_lead_pool", action: "read" },
  { code: SYSTEM_PERMISSIONS.LEASING_LEAD_ASSIGN, name: "招商线索分配", resource: "biz.leasing_lead", action: "assign" },
  { code: SYSTEM_PERMISSIONS.LEASING_LEAD_RECLAIM, name: "招商线索领取", resource: "biz.leasing_lead", action: "reclaim" },
  { code: SYSTEM_PERMISSIONS.LEASING_LEAD_MOVE_TO_POOL, name: "招商线索移入公海池", resource: "biz.leasing_lead", action: "move_to_pool" },
  { code: SYSTEM_PERMISSIONS.LEASING_FOLLOW_READ, name: "招商跟进记录读取", resource: "biz.leasing_follow", action: "read" },
  { code: SYSTEM_PERMISSIONS.LEASING_FOLLOW_CREATE, name: "新增招商跟进记录", resource: "biz.leasing_follow", action: "create" },
  { code: SYSTEM_PERMISSIONS.LEASING_FOLLOW_UPDATE, name: "编辑招商跟进记录", resource: "biz.leasing_follow", action: "update" },
  { code: SYSTEM_PERMISSIONS.LEASING_FOLLOW_DELETE, name: "删除招商跟进记录", resource: "biz.leasing_follow", action: "delete" },
  { code: SYSTEM_PERMISSIONS.LEASING_VISIT_READ, name: "招商看房记录读取", resource: "biz.leasing_visit", action: "read" },
  { code: SYSTEM_PERMISSIONS.LEASING_VISIT_CREATE, name: "新增招商看房记录", resource: "biz.leasing_visit", action: "create" },
  { code: SYSTEM_PERMISSIONS.LEASING_VISIT_UPDATE, name: "编辑招商看房记录", resource: "biz.leasing_visit", action: "update" },
  { code: SYSTEM_PERMISSIONS.LEASING_VISIT_DELETE, name: "删除招商看房记录", resource: "biz.leasing_visit", action: "delete" },
  { code: SYSTEM_PERMISSIONS.LEASING_QUOTE_READ, name: "招商报价读取", resource: "biz.leasing_quote", action: "read" },
  { code: SYSTEM_PERMISSIONS.LEASING_QUOTE_CREATE, name: "新增招商报价", resource: "biz.leasing_quote", action: "create" },
  { code: SYSTEM_PERMISSIONS.LEASING_QUOTE_UPDATE, name: "编辑招商报价", resource: "biz.leasing_quote", action: "update" },
  { code: SYSTEM_PERMISSIONS.LEASING_QUOTE_DELETE, name: "删除招商报价", resource: "biz.leasing_quote", action: "delete" },
  { code: SYSTEM_PERMISSIONS.LEASING_QUOTE_SUBMIT, name: "提交招商报价审批", resource: "biz.leasing_quote", action: "submit" },
  { code: SYSTEM_PERMISSIONS.LEASING_QUOTE_APPROVE, name: "招商报价审批通过", resource: "biz.leasing_quote", action: "approve" },
  { code: SYSTEM_PERMISSIONS.LEASING_QUOTE_REJECT, name: "招商报价审批驳回", resource: "biz.leasing_quote", action: "reject" },
  { code: SYSTEM_PERMISSIONS.LEASING_QUOTE_CREATE_CONTRACT, name: "报价生成合同草稿", resource: "biz.leasing_quote", action: "create_contract" },
  { code: SYSTEM_PERMISSIONS.LEASING_CONTRACT_READ, name: "合同读取", resource: "biz.leasing_contract", action: "read" },
  { code: SYSTEM_PERMISSIONS.LEASING_CONTRACT_CREATE, name: "新增合同", resource: "biz.leasing_contract", action: "create" },
  { code: SYSTEM_PERMISSIONS.LEASING_CONTRACT_UPDATE, name: "编辑合同", resource: "biz.leasing_contract", action: "update" },
  { code: SYSTEM_PERMISSIONS.LEASING_CONTRACT_DELETE, name: "删除合同", resource: "biz.leasing_contract", action: "delete" },
  { code: SYSTEM_PERMISSIONS.LEASING_CONTRACT_SUBMIT, name: "提交合同审批", resource: "biz.leasing_contract", action: "submit" },
  { code: SYSTEM_PERMISSIONS.LEASING_CONTRACT_APPROVE, name: "合同审批通过", resource: "biz.leasing_contract", action: "approve" },
  { code: SYSTEM_PERMISSIONS.LEASING_CONTRACT_REJECT, name: "合同审批驳回", resource: "biz.leasing_contract", action: "reject" },
  { code: SYSTEM_PERMISSIONS.LEASING_CONTRACT_VOID, name: "合同作废", resource: "biz.leasing_contract", action: "void" },
  { code: SYSTEM_PERMISSIONS.LEASING_CONTRACT_ARCHIVE, name: "合同签章归档", resource: "biz.leasing_contract", action: "archive" },
  { code: SYSTEM_PERMISSIONS.LEASING_CONTRACT_EFFECTIVE, name: "合同生效", resource: "biz.leasing_contract", action: "effective" },
  { code: SYSTEM_PERMISSIONS.LEASING_CONTRACT_STATUS_LOG, name: "合同状态日志", resource: "biz.leasing_contract_status_log", action: "status_log" },
  { code: SYSTEM_PERMISSIONS.LEASING_CONTRACT_FILE_READ, name: "合同附件读取", resource: "biz.leasing_contract", action: "file_read" },
  { code: SYSTEM_PERMISSIONS.LEASING_CONTRACT_UNIT_READ, name: "合同房源读取", resource: "rel.leasing_contract_unit", action: "read" },
  { code: SYSTEM_PERMISSIONS.LEASING_CONTRACT_UNIT_CREATE, name: "新增合同房源", resource: "rel.leasing_contract_unit", action: "create" },
  { code: SYSTEM_PERMISSIONS.LEASING_CONTRACT_UNIT_UPDATE, name: "编辑合同房源", resource: "rel.leasing_contract_unit", action: "update" },
  { code: SYSTEM_PERMISSIONS.LEASING_CONTRACT_UNIT_DELETE, name: "删除合同房源", resource: "rel.leasing_contract_unit", action: "delete" },
  { code: SYSTEM_PERMISSIONS.LEASING_CONTRACT_RECALCULATE, name: "合同金额重算", resource: "biz.leasing_contract", action: "recalculate" },
  { code: SYSTEM_PERMISSIONS.LEASING_CONTRACT_OVERRIDE_AREA, name: "合同房源面积超额覆盖", resource: "rel.leasing_contract_unit", action: "override_area" },
  { code: SYSTEM_PERMISSIONS.LEASING_CONTRACT_FORCE_BIND_UNIT, name: "合同强制绑定房源", resource: "rel.leasing_contract_unit", action: "force_bind_unit" },
  { code: SYSTEM_PERMISSIONS.LEASING_CONTRACT_EDIT_AFTER_SUBMIT, name: "提交后编辑合同房源", resource: "rel.leasing_contract_unit", action: "edit_after_submit" },
  { code: SYSTEM_PERMISSIONS.LEASING_STATISTICS_FUNNEL, name: "招商漏斗统计", resource: "biz.leasing_statistics", action: "funnel" },
  { code: SYSTEM_PERMISSIONS.PERMISSION_LIST, name: "权限列表", resource: "system.permission", action: "list" },
  { code: SYSTEM_PERMISSIONS.PERMISSION_TREE, name: "权限树", resource: "system.permission", action: "tree" },
  { code: SYSTEM_PERMISSIONS.PERMISSION_CREATE, name: "新增权限", resource: "system.permission", action: "create" },
  { code: SYSTEM_PERMISSIONS.PERMISSION_UPDATE, name: "编辑权限", resource: "system.permission", action: "update" },
  { code: SYSTEM_PERMISSIONS.PERMISSION_DELETE, name: "删除权限", resource: "system.permission", action: "delete" },
  { code: SYSTEM_PERMISSIONS.PERMISSION_READ, name: "权限读取", resource: "system.permission", action: "read" },
  { code: SYSTEM_PERMISSIONS.PERMISSION_OPEN_CREATE, name: "新增开放权限", resource: "system.permission", action: "create" },
  { code: SYSTEM_PERMISSIONS.PERMISSION_OPEN_UPDATE, name: "编辑开放权限", resource: "system.permission", action: "update" },
  { code: SYSTEM_PERMISSIONS.PERMISSION_OPEN_DELETE, name: "删除开放权限", resource: "system.permission", action: "delete" },
  { code: SYSTEM_PERMISSIONS.DATA_SCOPE_READ, name: "数据权限读取", resource: "system.data-scope", action: "read" },
  { code: SYSTEM_PERMISSIONS.DATA_SCOPE_CREATE, name: "新增数据权限", resource: "system.data-scope", action: "create" },
  { code: SYSTEM_PERMISSIONS.DATA_SCOPE_UPDATE, name: "编辑数据权限", resource: "system.data-scope", action: "update" },
  { code: SYSTEM_PERMISSIONS.DATA_SCOPE_DELETE, name: "删除数据权限", resource: "system.data-scope", action: "delete" },
  { code: SYSTEM_PERMISSIONS.DATA_SCOPE_ASSIGN, name: "角色数据权限绑定", resource: "system.data-scope", action: "assign" },
  { code: SYSTEM_PERMISSIONS.DATA_SCOPE_OPEN_READ, name: "开放数据权限读取", resource: "system.data-scope", action: "read" },
  { code: SYSTEM_PERMISSIONS.DATA_SCOPE_OPEN_CREATE, name: "新增开放数据权限", resource: "system.data-scope", action: "create" },
  { code: SYSTEM_PERMISSIONS.DATA_SCOPE_OPEN_UPDATE, name: "编辑开放数据权限", resource: "system.data-scope", action: "update" },
  { code: SYSTEM_PERMISSIONS.DATA_SCOPE_OPEN_DELETE, name: "删除开放数据权限", resource: "system.data-scope", action: "delete" },
  { code: SYSTEM_PERMISSIONS.ROLE_ASSIGN_DATA_SCOPE, name: "角色绑定数据权限", resource: "system.role", action: "assign-data-scope" },
  { code: SYSTEM_PERMISSIONS.FIELD_POLICY_READ, name: "字段策略读取", resource: "system.field-policy", action: "read" },
  { code: SYSTEM_PERMISSIONS.FIELD_POLICY_CREATE, name: "新增字段策略", resource: "system.field-policy", action: "create" },
  { code: SYSTEM_PERMISSIONS.FIELD_POLICY_UPDATE, name: "编辑字段策略", resource: "system.field-policy", action: "update" },
  { code: SYSTEM_PERMISSIONS.FIELD_POLICY_DELETE, name: "删除字段策略", resource: "system.field-policy", action: "delete" },
  { code: SYSTEM_PERMISSIONS.FIELD_POLICY_ASSIGN, name: "角色字段策略绑定", resource: "system.field-policy", action: "assign" },
  { code: SYSTEM_PERMISSIONS.FIELD_POLICY_OPEN_READ, name: "开放字段策略读取", resource: "system.field-policy", action: "read" },
  { code: SYSTEM_PERMISSIONS.FIELD_POLICY_OPEN_CREATE, name: "新增开放字段策略", resource: "system.field-policy", action: "create" },
  { code: SYSTEM_PERMISSIONS.FIELD_POLICY_OPEN_UPDATE, name: "编辑开放字段策略", resource: "system.field-policy", action: "update" },
  { code: SYSTEM_PERMISSIONS.FIELD_POLICY_OPEN_DELETE, name: "删除开放字段策略", resource: "system.field-policy", action: "delete" },
  { code: SYSTEM_PERMISSIONS.ROLE_ASSIGN_FIELD_POLICY, name: "角色绑定字段策略", resource: "system.role", action: "assign-field-policy" },
  { code: SYSTEM_PERMISSIONS.DICT_TYPE_LIST, name: "字典类型列表", resource: "system.dict-type", action: "list" },
  { code: SYSTEM_PERMISSIONS.DICT_TYPE_CREATE, name: "新增字典类型", resource: "system.dict-type", action: "create" },
  { code: SYSTEM_PERMISSIONS.DICT_TYPE_DETAIL, name: "字典类型详情", resource: "system.dict-type", action: "detail" },
  { code: SYSTEM_PERMISSIONS.DICT_TYPE_UPDATE, name: "编辑字典类型", resource: "system.dict-type", action: "update" },
  { code: SYSTEM_PERMISSIONS.DICT_TYPE_DELETE, name: "删除字典类型", resource: "system.dict-type", action: "delete" },
  { code: SYSTEM_PERMISSIONS.DICT_ITEM_LIST, name: "字典项列表", resource: "system.dict-item", action: "list" },
  { code: SYSTEM_PERMISSIONS.DICT_ITEM_CREATE, name: "新增字典项", resource: "system.dict-item", action: "create" },
  { code: SYSTEM_PERMISSIONS.DICT_ITEM_DETAIL, name: "字典项详情", resource: "system.dict-item", action: "detail" },
  { code: SYSTEM_PERMISSIONS.DICT_ITEM_UPDATE, name: "编辑字典项", resource: "system.dict-item", action: "update" },
  { code: SYSTEM_PERMISSIONS.DICT_ITEM_DELETE, name: "删除字典项", resource: "system.dict-item", action: "delete" },
  { code: SYSTEM_PERMISSIONS.ATTACHMENT_LIST, name: "附件列表", resource: "system.attachment", action: "list" },
  { code: SYSTEM_PERMISSIONS.ATTACHMENT_CREATE, name: "新增附件", resource: "system.attachment", action: "create" },
  { code: SYSTEM_PERMISSIONS.ATTACHMENT_DETAIL, name: "附件详情", resource: "system.attachment", action: "detail" },
  { code: SYSTEM_PERMISSIONS.ATTACHMENT_DELETE, name: "删除附件", resource: "system.attachment", action: "delete" },
  { code: SYSTEM_PERMISSIONS.FILE_READ, name: "文件读取", resource: "system.file", action: "read" },
  { code: SYSTEM_PERMISSIONS.FILE_UPLOAD, name: "文件上传", resource: "system.file", action: "upload" },
  { code: SYSTEM_PERMISSIONS.FILE_DOWNLOAD, name: "文件下载", resource: "system.file", action: "download" },
  { code: SYSTEM_PERMISSIONS.FILE_DELETE, name: "文件删除", resource: "system.file", action: "delete" },
  { code: SYSTEM_PERMISSIONS.AUDIT_LOGIN_LOG_LIST, name: "登录日志列表", resource: "system.audit", action: "login-log:list" },
  { code: SYSTEM_PERMISSIONS.AUDIT_OP_LOG_LIST, name: "操作日志列表", resource: "system.audit", action: "op-log:list" },
  { code: SYSTEM_PERMISSIONS.AUDIT_READ, name: "审计读取", resource: "system.audit", action: "read" },
  { code: SYSTEM_PERMISSIONS.AUDIT_EXPORT, name: "审计导出", resource: "system.audit", action: "export" },
  { code: SYSTEM_PERMISSIONS.PARK_READ, name: "园区读取", resource: "biz.park", action: "read" },
  { code: SYSTEM_PERMISSIONS.PARK_CREATE, name: "新增园区", resource: "biz.park", action: "create" },
  { code: SYSTEM_PERMISSIONS.PARK_UPDATE, name: "编辑园区", resource: "biz.park", action: "update" },
  { code: SYSTEM_PERMISSIONS.PARK_DELETE, name: "删除园区", resource: "biz.park", action: "delete" },
  { code: SYSTEM_PERMISSIONS.BUILDING_READ, name: "楼栋读取", resource: "biz.building", action: "read" },
  { code: SYSTEM_PERMISSIONS.BUILDING_CREATE, name: "新增楼栋", resource: "biz.building", action: "create" },
  { code: SYSTEM_PERMISSIONS.BUILDING_UPDATE, name: "编辑楼栋", resource: "biz.building", action: "update" },
  { code: SYSTEM_PERMISSIONS.BUILDING_DELETE, name: "删除楼栋", resource: "biz.building", action: "delete" },
  { code: SYSTEM_PERMISSIONS.FLOOR_READ, name: "楼层读取", resource: "biz.floor", action: "read" },
  { code: SYSTEM_PERMISSIONS.FLOOR_CREATE, name: "新增楼层", resource: "biz.floor", action: "create" },
  { code: SYSTEM_PERMISSIONS.FLOOR_UPDATE, name: "编辑楼层", resource: "biz.floor", action: "update" },
  { code: SYSTEM_PERMISSIONS.FLOOR_DELETE, name: "删除楼层", resource: "biz.floor", action: "delete" },
  { code: SYSTEM_PERMISSIONS.FLOOR_UPLOAD_LAYOUT, name: "上传楼层平面图", resource: "biz.floor", action: "upload_layout" },
  { code: SYSTEM_PERMISSIONS.UNIT_READ, name: "房源读取", resource: "biz.unit", action: "read" },
  { code: SYSTEM_PERMISSIONS.UNIT_CREATE, name: "新增房源", resource: "biz.unit", action: "create" },
  { code: SYSTEM_PERMISSIONS.UNIT_UPDATE, name: "编辑房源", resource: "biz.unit", action: "update" },
  { code: SYSTEM_PERMISSIONS.UNIT_DELETE, name: "删除房源", resource: "biz.unit", action: "delete" },
  { code: SYSTEM_PERMISSIONS.UNIT_TRANSITION_STATUS, name: "房源状态流转", resource: "biz.unit", action: "transition_status" },
  { code: SYSTEM_PERMISSIONS.UNIT_CHANGE_STATUS, name: "房源状态变更", resource: "biz.unit", action: "change_status" },
  { code: SYSTEM_PERMISSIONS.UNIT_FORCE_CHANGE_STATUS, name: "强制调整房源状态", resource: "biz.unit", action: "force_change_status" },
  { code: SYSTEM_PERMISSIONS.UNIT_STATUS_LOG, name: "房源状态日志", resource: "biz.unit", action: "status_log" },
  { code: SYSTEM_PERMISSIONS.UNIT_IMPORT, name: "房源导入", resource: "biz.unit", action: "import" },
  { code: SYSTEM_PERMISSIONS.UNIT_IMPORT_TEMPLATE, name: "房源导入模板", resource: "biz.unit", action: "import_template" },
  { code: SYSTEM_PERMISSIONS.UNIT_EXPORT, name: "房源导出", resource: "biz.unit", action: "export" },
  { code: SYSTEM_PERMISSIONS.ASSET_READ, name: "资产读取", resource: "biz.asset", action: "read" },
  { code: SYSTEM_PERMISSIONS.ASSET_STATUS_BOARD, name: "房源状态看板", resource: "biz.asset", action: "status_board" },
  { code: SYSTEM_PERMISSIONS.ASSET_STATISTICS, name: "资产统计", resource: "biz.asset", action: "statistics" },
  { code: SYSTEM_PERMISSIONS.ASSET_STATISTICS_READ, name: "资产统计读取", resource: "biz.asset", action: "statistics:read" },
  { code: SYSTEM_PERMISSIONS.ASSET_PARK_LIST, name: "园区列表", resource: "asset.park", action: "list" },
  { code: SYSTEM_PERMISSIONS.ASSET_PARK_CREATE, name: "新增园区", resource: "asset.park", action: "create" },
  { code: SYSTEM_PERMISSIONS.ASSET_PARK_DETAIL, name: "园区详情", resource: "asset.park", action: "detail" },
  { code: SYSTEM_PERMISSIONS.ASSET_PARK_UPDATE, name: "编辑园区", resource: "asset.park", action: "update" },
  { code: SYSTEM_PERMISSIONS.ASSET_PARK_DELETE, name: "删除园区", resource: "asset.park", action: "delete" },
  { code: SYSTEM_PERMISSIONS.ASSET_BUILDING_LIST, name: "楼栋列表", resource: "asset.building", action: "list" },
  { code: SYSTEM_PERMISSIONS.ASSET_BUILDING_CREATE, name: "新增楼栋", resource: "asset.building", action: "create" },
  { code: SYSTEM_PERMISSIONS.ASSET_BUILDING_DETAIL, name: "楼栋详情", resource: "asset.building", action: "detail" },
  { code: SYSTEM_PERMISSIONS.ASSET_BUILDING_UPDATE, name: "编辑楼栋", resource: "asset.building", action: "update" },
  { code: SYSTEM_PERMISSIONS.ASSET_BUILDING_DELETE, name: "删除楼栋", resource: "asset.building", action: "delete" },
  { code: SYSTEM_PERMISSIONS.ASSET_FLOOR_LIST, name: "楼层列表", resource: "asset.floor", action: "list" },
  { code: SYSTEM_PERMISSIONS.ASSET_FLOOR_CREATE, name: "新增楼层", resource: "asset.floor", action: "create" },
  { code: SYSTEM_PERMISSIONS.ASSET_FLOOR_DETAIL, name: "楼层详情", resource: "asset.floor", action: "detail" },
  { code: SYSTEM_PERMISSIONS.ASSET_FLOOR_UPDATE, name: "编辑楼层", resource: "asset.floor", action: "update" },
  { code: SYSTEM_PERMISSIONS.ASSET_FLOOR_DELETE, name: "删除楼层", resource: "asset.floor", action: "delete" },
  { code: SYSTEM_PERMISSIONS.ASSET_UNIT_LIST, name: "房源列表", resource: "asset.unit", action: "list" },
  { code: SYSTEM_PERMISSIONS.ASSET_UNIT_CREATE, name: "新增房源", resource: "asset.unit", action: "create" },
  { code: SYSTEM_PERMISSIONS.ASSET_UNIT_DETAIL, name: "房源详情", resource: "asset.unit", action: "detail" },
  { code: SYSTEM_PERMISSIONS.ASSET_UNIT_UPDATE, name: "编辑房源", resource: "asset.unit", action: "update" },
  { code: SYSTEM_PERMISSIONS.ASSET_UNIT_DELETE, name: "删除房源", resource: "asset.unit", action: "delete" },
  { code: SYSTEM_PERMISSIONS.CODE_RULE_READ, name: "编码规则读取", resource: "system.code-rule", action: "read" },
  { code: SYSTEM_PERMISSIONS.CODE_RULE_CREATE, name: "新增编码规则", resource: "system.code-rule", action: "create" },
  { code: SYSTEM_PERMISSIONS.CODE_RULE_UPDATE, name: "编辑编码规则", resource: "system.code-rule", action: "update" },
  { code: SYSTEM_PERMISSIONS.CODE_RULE_DELETE, name: "删除编码规则", resource: "system.code-rule", action: "delete" },
  { code: SYSTEM_PERMISSIONS.CODE_RULE_GENERATE, name: "生成业务编码", resource: "system.code-rule", action: "generate" },
  { code: SYSTEM_PERMISSIONS.CODE_RULE_OPEN_READ, name: "开放编码规则读取", resource: "system.code-rule", action: "read" },
  { code: SYSTEM_PERMISSIONS.CODE_RULE_OPEN_CREATE, name: "新增开放编码规则", resource: "system.code-rule", action: "create" },
  { code: SYSTEM_PERMISSIONS.CODE_RULE_OPEN_UPDATE, name: "编辑开放编码规则", resource: "system.code-rule", action: "update" },
  { code: SYSTEM_PERMISSIONS.CODE_RULE_OPEN_GENERATE, name: "开放编码生成", resource: "system.code-rule", action: "generate" },
  { code: SYSTEM_PERMISSIONS.MODULE_READ, name: "模块读取", resource: "system.module", action: "read" },
  { code: SYSTEM_PERMISSIONS.MODULE_CREATE, name: "新增模块", resource: "system.module", action: "create" },
  { code: SYSTEM_PERMISSIONS.MODULE_UPDATE, name: "编辑模块", resource: "system.module", action: "update" },
  { code: SYSTEM_PERMISSIONS.MODULE_OPEN_READ, name: "开放模块读取", resource: "system.module", action: "read" },
  { code: SYSTEM_PERMISSIONS.MODULE_MANAGE, name: "开放模块管理", resource: "system.module", action: "manage" },
  { code: SYSTEM_PERMISSIONS.PLAN_READ, name: "套餐读取", resource: "system.plan", action: "read" },
  { code: SYSTEM_PERMISSIONS.PLAN_CREATE, name: "新增套餐", resource: "system.plan", action: "create" },
  { code: SYSTEM_PERMISSIONS.PLAN_UPDATE, name: "编辑套餐", resource: "system.plan", action: "update" },
  { code: SYSTEM_PERMISSIONS.PLAN_OPEN_READ, name: "开放套餐读取", resource: "system.plan", action: "read" },
  { code: SYSTEM_PERMISSIONS.PLAN_MANAGE, name: "开放套餐管理", resource: "system.plan", action: "manage" },
  { code: SYSTEM_PERMISSIONS.TENANT_MODULE_READ, name: "租户模块授权读取", resource: "system.tenant-module", action: "read" },
  { code: SYSTEM_PERMISSIONS.TENANT_MODULE_ASSIGN, name: "租户模块授权", resource: "system.tenant-module", action: "assign" },
  { code: SYSTEM_PERMISSIONS.TENANT_MODULE_OPEN_READ, name: "开放租户模块读取", resource: "system.tenant-module", action: "read" },
  { code: SYSTEM_PERMISSIONS.TENANT_MODULE_MANAGE, name: "开放租户模块管理", resource: "system.tenant-module", action: "manage" }
];

export interface MenuItem {
  label: string;
  href: string;
  permission: SystemPermissionCode;
}

export const SYSTEM_MENU_ITEMS: MenuItem[] = [
  { label: "组织管理", href: "/system/orgs", permission: SYSTEM_PERMISSIONS.ORG_LIST },
  { label: "用户管理", href: "/system/users", permission: SYSTEM_PERMISSIONS.USER_LIST },
  { label: "角色管理", href: "/system/roles", permission: SYSTEM_PERMISSIONS.ROLE_READ },
  { label: "权限点", href: "/system/permissions", permission: SYSTEM_PERMISSIONS.PERMISSION_READ },
  { label: "字典管理", href: "/system/dicts", permission: SYSTEM_PERMISSIONS.DICT_TYPE_LIST },
  { label: "附件中心", href: "/system/files", permission: SYSTEM_PERMISSIONS.FILE_READ },
  { label: "审计日志", href: "/system/audit/op-logs", permission: SYSTEM_PERMISSIONS.AUDIT_READ }
];

export interface FileRecord {
  id: string;
  tenantId: string;
  parkId: string;
  fileCode: string;
  originalName: string;
  storedName: string;
  fileUrl: string;
  fileSize: string;
  mimeType: string;
  md5: string;
  bizType: string;
  bizId: string | null;
  storageType: "local" | "minio" | "oss";
  storageBucket: string | null;
  storagePath: string;
  isEncrypted: boolean;
  status: number;
  remark: string | null;
  createTime: string;
  updateTime: string;
}
