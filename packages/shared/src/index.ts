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

export interface UserContext {
  id: string;
  username: string;
  real_name: string;
  mobile: string | null;
  email: string | null;
  tenant_id: string;
  park_id: string;
  park_name?: string | null;
  org_id: string | null;
  org_name: string | null;
  roles: RoleContext[];
  permissions: string[];
  data_scope: string;
  is_super: boolean;
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
  PERMISSION_LIST: "system:permission:list",
  PERMISSION_TREE: "system:permission:tree",
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
  AUDIT_EXPORT: "audit:export"
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
  { code: SYSTEM_PERMISSIONS.PERMISSION_LIST, name: "权限列表", resource: "system.permission", action: "list" },
  { code: SYSTEM_PERMISSIONS.PERMISSION_TREE, name: "权限树", resource: "system.permission", action: "tree" },
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
  { code: SYSTEM_PERMISSIONS.AUDIT_EXPORT, name: "审计导出", resource: "system.audit", action: "export" }
];

export interface MenuItem {
  label: string;
  href: string;
  permission: SystemPermissionCode;
}

export const SYSTEM_MENU_ITEMS: MenuItem[] = [
  { label: "组织管理", href: "/system/orgs", permission: SYSTEM_PERMISSIONS.ORG_LIST },
  { label: "用户管理", href: "/system/users", permission: SYSTEM_PERMISSIONS.USER_LIST },
  { label: "角色管理", href: "/system/roles", permission: SYSTEM_PERMISSIONS.ROLE_LIST },
  { label: "权限点", href: "/system/permissions", permission: SYSTEM_PERMISSIONS.PERMISSION_LIST },
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
