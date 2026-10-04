import {
  SYSTEM_PERMISSIONS, HR_PERMISSIONS, YUZHOU_INCREMENTAL_DOMAINS, YUZHOU_INCREMENTAL_FIELDS,
  YUZHOU_INCREMENTAL_MAX_ITEMS, YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES, YUZHOU_INITIAL_CANONICALIZATION,
  type UserContext, type YuzhouIncrementalDomain, type YuzhouIncrementalPackage
} from "@jinhu/shared";
import { hasAnyPermission, hasModule, hasPermission } from "../../lib/permissions";
import { parseLocalJson, validateLocalJsonFile } from "../../components/files/local-json-file";

export const IMPORT_FILE_POLICY = { maxBytes: YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES };
export const DOMAIN_LABELS: Record<YuzhouIncrementalDomain, string> = { organization: "组织", position: "岗位", employee: "员工", profile: "个人资料", contract: "劳动合同", family: "家庭成员" };
export const DOMAIN_MANAGE = {
  organization: SYSTEM_PERMISSIONS.ORG_UPDATE,
  position: HR_PERMISSIONS.HR_POSITION_MANAGE,
  employee: HR_PERMISSIONS.HR_EMPLOYEE_MANAGE,
  profile: HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE,
  family: HR_PERMISSIONS.HR_EMPLOYEE_RECORD_MANAGE,
  contract: HR_PERMISSIONS.HR_CONTRACT_MANAGE
};
export const IMPORT_ENTRY_PERMISSIONS = [
  ...Object.values(DOMAIN_MANAGE), SYSTEM_PERMISSIONS.ORG_CREATE, SYSTEM_PERMISSIONS.ORG_LIST, HR_PERMISSIONS.HR_POSITION_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ,
  HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_READ, HR_PERMISSIONS.HR_EMPLOYEE_FAMILY_READ, HR_PERMISSIONS.HR_CONTRACT_READ
];
export function canEnterImport(user: UserContext | null): boolean {
  return hasModule(user, "hr") && hasAnyPermission(user, IMPORT_ENTRY_PERMISSIONS);
}
export function importContextKey(user: UserContext | null): string {
  return JSON.stringify(user && [user.id, user.tenant_id, user.park_id, user.org_id, user.data_scope,
    user.is_super, user.permissions, user.enabled_modules, user.roles, user.data_scopes, user.field_permissions, user.field_policies]);
}

const fieldLabels: Record<string, string> = {
  orgCode:"组织编号",orgName:"组织名称",orgType:"组织类型",parentSourceKey:"上级组织",orgSourceKey:"所属组织",positionSourceKey:"任职岗位",parentPositionSourceKey:"上级岗位",positionCode:"岗位编号",positionName:"岗位名称",jobFamily:"岗位类别",jobLevel:"岗位等级",headcountLimit:"岗位编制",plannedHeadcount:"组织编制",status:"启用状态",sortOrder:"排序",contactPhone:"联系电话",legacySourceId:"来源编号",legacyHierarchyLevel:"来源层级",hierarchyLevel:"岗位层级",legacyManagerReference:"来源负责人信息",legacyDepartmentReference:"来源部门信息",legacyParentReference:"来源上级岗位信息",legacyUptoCode:"来源岗位分类",authority:"岗位权限",qualification:"任职资格",responsibilities:"岗位职责",positionManual:"岗位说明",remark:"备注",
  relationship:"关系",contact:"联系方式",birthDate:"出生日期",workUnit:"工作单位",jobTitle:"职务",politicalStatus:"政治面貌",
  employeeCode: "员工编号", fullName: "姓名", employmentStatus: "任职状态", employmentType: "用工类型", hireDate: "入职日期",
  workLocation: "工作地点", workMobile: "工作手机", workEmail: "工作邮箱", employeeSourceKey: "员工来源关联", employeeSourceTable: "员工来源表关联",
  englishName: "英文姓名", gender: "性别", dateOfBirth: "出生日期", personalMobile: "个人手机", personalEmail: "个人邮箱", address: "联系地址", idNumber: "证件号",
  contractTypeId: "合同类型", contractStatus: "合同状态", contractNo: "合同编号", startDate: "开始日期", endDate: "结束日期",
  probationEndDate: "试用期结束日期", workType: "工作类型", positionTitle: "岗位名称"
};
export interface PackageSummary {
  fileName: string;
  itemCount: number;
  domains: { domain: YuzhouIncrementalDomain; count: number; fields: string[] }[];
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const boundedString = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
export function parseImportPackage(text: string, fileName: string): { pkg: YuzhouIncrementalPackage; summary: PackageSummary } {
  const value = parseLocalJson(text, IMPORT_FILE_POLICY);
  if (!object(value) || value.version !== 1 || value.sourceSystem !== "yuzhou-v10" || !boundedString(value.manifestId, 128)
    || typeof value.extractedAt !== "string" || !Number.isFinite(Date.parse(value.extractedAt)) || !Array.isArray(value.items)
    || !value.items.length || value.items.length > YUZHOU_INCREMENTAL_MAX_ITEMS) {
    throw new Error(`数据包格式无效，每包需包含 1 至 ${YUZHOU_INCREMENTAL_MAX_ITEMS} 条记录。`);
  }
  const domains = new Map<YuzhouIncrementalDomain, { count: number; fields: Set<string> }>();
  const seen = new Set<string>();
  for (const item of value.items) {
    if (!object(item) || !YUZHOU_INCREMENTAL_DOMAINS.includes(item.domain as YuzhouIncrementalDomain)) {
      throw new Error("数据包包含尚未支持的模块，目前支持组织、岗位、员工、个人资料和劳动合同。");
    }
    const domain = item.domain as YuzhouIncrementalDomain;
    const witness = item.initialBaselineWitness;
    if (witness !== undefined && (!object(witness) || witness.version !== 1 || typeof witness.operationId !== "string"
      || !/^yzprod-import-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/.test(witness.operationId)
      || !["T0", "T2"].includes(String(witness.phase)) || witness.canonicalizationVersion !== YUZHOU_INITIAL_CANONICALIZATION
      || typeof witness.targetId !== "string" || !isOperationId(witness.targetId) || !object(witness.projection))) {
      throw new Error("数据包的来源基线证明格式无效，请检查后重新选择。");
    }
    if (!boundedString(item.sourceTable, 128) || typeof item.sourceKey !== "string" || !/^sha256:[a-f0-9]{64}$/.test(item.sourceKey)
      || typeof item.rowDigest !== "string" || !/^[a-f0-9]{64}$/.test(item.rowDigest) || !object(item.fields)
      || (item.sourceUpdatedAt !== undefined && (typeof item.sourceUpdatedAt !== "string" || !Number.isFinite(Date.parse(item.sourceUpdatedAt))))) {
      throw new Error("记录结构无效，请检查源数据包。");
    }
    const identity = JSON.stringify([domain, item.sourceTable, item.sourceKey]);
    if (seen.has(identity)) throw new Error("数据包包含重复来源记录，请检查后重新选择。");
    seen.add(identity);
    const keys = Object.keys(item.fields);
    if (keys.some(key => !YUZHOU_INCREMENTAL_FIELDS[domain].includes(key)
      || (item.fields as Record<string, unknown>)[key] !== null && typeof (item.fields as Record<string, unknown>)[key] !== "string" && !( ["sortOrder","plannedHeadcount","legacySourceId","legacyHierarchyLevel","headcountLimit","hierarchyLevel"].includes(key) && Number.isSafeInteger((item.fields as Record<string, unknown>)[key])))) {
      throw new Error("数据包包含不支持的字段或字段类型，请检查源数据包。");
    }
    const group = domains.get(domain) ?? { count: 0, fields: new Set<string>() };
    group.count++;
    keys.forEach(key => group.fields.add(fieldLabels[key]!));
    domains.set(domain, group);
  }
  // Server validates digests, witnesses, field values and authenticated source/target ownership.
  return { pkg: value as unknown as YuzhouIncrementalPackage, summary: {
    fileName, itemCount: value.items.length,
    domains: YUZHOU_INCREMENTAL_DOMAINS.filter(domain => domains.has(domain)).map(domain => ({
      domain, count: domains.get(domain)!.count, fields: [...domains.get(domain)!.fields].sort()
    }))
  } };
}
export function missingImportPermissions(user: UserContext | null, summary: PackageSummary): string[] {
  return summary.domains.filter(row => (row.domain === "organization" ? !hasAnyPermission(user,[SYSTEM_PERMISSIONS.ORG_CREATE,SYSTEM_PERMISSIONS.ORG_UPDATE]) : !hasPermission(user, DOMAIN_MANAGE[row.domain]))).map(row => DOMAIN_LABELS[row.domain]);
}

export type OperationStatus = "previewed" | "committed" | "conflicted";
export interface ImportOperation {
  id: string;
  status: OperationStatus;
  itemCount: number;
  actions: Record<"create" | "update" | "unchanged" | "conflict", number> | null;
  results: { applied: number; unchanged: number; conflicts: number } | null;
}
export const isOperationId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
/** Admit aggregates only; private plan source identities never enter rendered state. */
export function normalizeImportOperation(value: unknown): ImportOperation {
  if (!object(value) || typeof value.id !== "string" || !isOperationId(value.id)
    || typeof value.status !== "string" || !["previewed", "committed", "conflicted"].includes(value.status)
    || !count(value.itemCount) || value.itemCount < 1 || value.itemCount > YUZHOU_INCREMENTAL_MAX_ITEMS) {
    throw new Error("导入响应格式异常，请通过操作编号查询状态。");
  }
  let actions: ImportOperation["actions"] = null;
  if (value.plan !== undefined) {
    if (!Array.isArray(value.plan) || value.plan.length !== value.itemCount) throw new Error("导入预览响应不完整。");
    actions = { create: 0, update: 0, unchanged: 0, conflict: 0 };
    for (const row of value.plan) {
      if (!object(row) || typeof row.action !== "string" || !Object.prototype.hasOwnProperty.call(actions, row.action)) throw new Error("导入预览响应无效。");
      actions[row.action as keyof typeof actions]++;
    }
  }
  const terminal = value.status !== "previewed";
  if (terminal && (!count(value.appliedCount) || !count(value.unchangedCount) || !count(value.conflictCount)
    || value.appliedCount + value.unchangedCount + value.conflictCount !== value.itemCount)) throw new Error("导入结果响应不完整。");
  return { id: value.id, status: value.status as OperationStatus, itemCount: value.itemCount, actions,
    results: terminal ? { applied: value.appliedCount as number, unchanged: value.unchangedCount as number, conflicts: value.conflictCount as number } : null };
}

export interface ImportWorkbenchState {
  busy: "reading" | "preview" | "commit" | "status" | null;
  summary: PackageSummary | null;
  operation: ImportOperation | null;
  uncertain: boolean;
  canCommit: boolean;
  previewRetryAvailable: boolean;
  error: string;
}
interface ImportTransport {
  preview: (pkg: YuzhouIncrementalPackage, key: string) => Promise<unknown>;
  commit: (id: string, key: string) => Promise<unknown>;
  status: (id: string) => Promise<unknown>;
  key: (action: string) => string;
}
export function createImportWorkbench(options: { user: UserContext | null; isCurrent: () => boolean; transport: ImportTransport }) {
  let state: ImportWorkbenchState = { busy: null, summary: null, operation: null, uncertain: false, canCommit: false, previewRetryAvailable: false, error: "" };
  let pkg: YuzhouIncrementalPackage | null = null;
  let generation = 0;
  let previewKey = "", commitKey = "", boundId = "";
  const terminalOperations = new Map<string, ImportOperation>();
  const admitOperation = (operation: ImportOperation): ImportOperation => {
    const terminal = terminalOperations.get(operation.id);
    if (terminal) return terminal;
    if (operation.status !== "previewed") terminalOperations.set(operation.id, operation);
    return operation;
  };
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<ImportWorkbenchState>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  const current = (epoch: number) => epoch === generation && options.isCurrent();
  const reset = () => {
    generation++; pkg = null; previewKey = ""; commitKey = ""; boundId = "";
    publish({ busy: null, summary: null, operation: null, uncertain: false, canCommit: false, previewRetryAvailable: false, error: "" });
  };
  const canManage = () => !!state.summary && hasModule(options.user, "hr") && missingImportPermissions(options.user, state.summary).length === 0;
  const settle = (epoch: number) => { if (current(epoch)) publish({ busy: null }); };
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => state,
    cancel: () => { generation++; pkg = null; boundId = ""; terminalOperations.clear(); },
    async select(file: (Pick<File, "name" | "type" | "size"> & { text(): Promise<string> }) | null) {
      if (!options.isCurrent() || state.busy === "commit" || state.uncertain) return;
      reset();
      if (!file) return;
      const epoch = generation;
      publish({ busy: "reading" });
      try {
        validateLocalJsonFile(file, IMPORT_FILE_POLICY);
        const parsed = parseImportPackage(await file.text(), file.name);
        if (!current(epoch)) return;
        pkg = parsed.pkg;
        const missing = missingImportPermissions(options.user, parsed.summary);
        publish({ summary: parsed.summary, error: missing.length ? `缺少${missing.join("、")}管理权限，无法预览或提交此包。` : "" });
      } catch (error) {
        if (current(epoch)) publish({ error: error instanceof Error && error.message.startsWith("数据包") ? error.message
          : `文件读取或格式校验失败，请选择有效的 JSON 数据包（最大 ${IMPORT_FILE_POLICY.maxBytes / 1024 / 1024} MiB）。` });
      } finally { settle(epoch); }
    },
    async preview(retry = false) {
      if (!options.isCurrent() || state.busy || !pkg || !canManage() || state.uncertain) return;
      if (retry && (!state.previewRetryAvailable || !previewKey)) return;
      // A fresh preview must reach the service's current package state, rather than
      // replaying the interceptor's cached pre-commit response. Only the same
      // interrupted transport attempt retains its key.
      if (!retry) previewKey = options.transport.key("hr-import-preview");
      const epoch = generation;
      publish({ busy: "preview", error: "", canCommit: false, previewRetryAvailable: false });
      try {
        const result = normalizeImportOperation(await options.transport.preview(pkg, previewKey));
        if (!current(epoch)) return;
        if (result.itemCount !== state.summary!.itemCount) throw new Error("Response count mismatch");
        boundId = result.id;
        commitKey = options.transport.key("hr-import-commit");
        const operation = admitOperation(result);
        publish({ operation, canCommit: operation.status === "previewed", uncertain: false });
      } catch {
        if (current(epoch)) publish({ previewRetryAvailable: true, error: "预览未完成。请检查当前园区、模块权限及源数据包后重试；服务端会校验来源和字段。" });
      } finally { settle(epoch); }
    },
    async commit() {
      if (!options.isCurrent() || state.busy || !state.canCommit || state.uncertain || !boundId || !canManage()) return;
      const epoch = generation;
      publish({ busy: "commit", canCommit: false, error: "" });
      try {
        const result = normalizeImportOperation(await options.transport.commit(boundId, commitKey));
        if (!current(epoch)) return;
        if (result.id !== boundId || result.itemCount !== state.summary!.itemCount || result.status === "previewed") throw new Error("Commit response mismatch");
        publish({ operation: admitOperation(result), uncertain: false });
      } catch {
        if (current(epoch)) publish({ uncertain: true, error: "提交结果尚未确认。请保留操作编号，先查询状态再决定是否重新提交。" });
      } finally { settle(epoch); }
    },
    async query(id: string) {
      if (!options.isCurrent() || state.busy || !canEnterImport(options.user)) return;
      if (!isOperationId(id)) { publish({ error: "请输入有效的操作编号。" }); return; }
      if (state.uncertain && id !== state.operation?.id) { publish({ error: "请先查询当前未确认提交的操作编号。" }); return; }
      if (id !== state.operation?.id) reset();
      const epoch = generation;
      publish({ busy: "status", error: "", canCommit: false });
      try {
        const result = normalizeImportOperation(await options.transport.status(id));
        if (!current(epoch)) return;
        if (result.id !== id || (boundId === id && result.itemCount !== state.summary?.itemCount)) throw new Error("Status response mismatch");
        const operation = admitOperation(result);
        publish({ operation, uncertain: false, previewRetryAvailable: false, canCommit: operation.status === "previewed" && boundId === id && canManage() });
      } catch {
        if (current(epoch)) publish({ error: "状态查询失败。请确认操作编号、当前园区和各模块读取权限后重试。" });
      } finally { settle(epoch); }
    }
  };
}
