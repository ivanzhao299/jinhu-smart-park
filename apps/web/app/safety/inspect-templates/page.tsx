"use client";

import {
  Card,
  DataTable,
  DataTableActions,
  Drawer,
  DrawerDetailGrid,
  DrawerDetailItem,
  DrawerFooter,
  DrawerForm,
  DrawerFormGrid,
  DrawerHeader,
  StatusPill
} from "@jinhu/ui";
import { Edit3, Eye, ListChecks, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";

const SAFETY_MODULE = "safety";

interface DictTypeRow {
  id: string;
  dictCode: string;
}

interface DictItemRow {
  id: string;
  itemLabel: string;
  itemValue: string;
  status: string;
  tagType?: string | null;
}

interface InspectItemRow {
  id: string;
  itemCode: string | null;
  itemName: string;
  itemType: string;
  hazardType: string | null;
  defaultRiskLevel: string | null;
  required: boolean;
  sortNo: number;
  standardDesc: string | null;
  status: string;
  remark: string | null;
}

interface InspectTemplateRow {
  id: string;
  templateCode: string;
  templateName: string;
  templateType: string;
  description: string | null;
  status: string;
  remark: string | null;
  updateTime: string;
  items?: InspectItemRow[];
}

interface TemplateForm {
  templateCode: string;
  templateName: string;
  templateType: string;
  description: string;
  status: string;
  remark: string;
}

interface ItemForm {
  itemCode: string;
  itemName: string;
  itemType: string;
  hazardType: string;
  defaultRiskLevel: string;
  required: boolean;
  sortNo: string;
  standardDesc: string;
  status: string;
  remark: string;
}

interface Filters {
  keyword: string;
  templateType: string;
  status: string;
}

type DictMap = Record<string, DictItemRow[]>;

const emptyPage: PaginatedResult<InspectTemplateRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyFilters: Filters = { keyword: "", templateType: "", status: "" };
const emptyTemplateForm: TemplateForm = {
  templateCode: "",
  templateName: "",
  templateType: "",
  description: "",
  status: "enabled",
  remark: ""
};
const emptyItemForm: ItemForm = {
  itemCode: "",
  itemName: "",
  itemType: "",
  hazardType: "",
  defaultRiskLevel: "",
  required: true,
  sortNo: "0",
  standardDesc: "",
  status: "enabled",
  remark: ""
};

export default function SafetyInspectTemplatesPage() {
  const [pageData, setPageData] = useState<PaginatedResult<InspectTemplateRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [templateForm, setTemplateForm] = useState<TemplateForm>(emptyTemplateForm);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm);
  const [editingTemplate, setEditingTemplate] = useState<InspectTemplateRow | null>(null);
  const [viewingTemplate, setViewingTemplate] = useState<InspectTemplateRow | null>(null);
  const [managingTemplate, setManagingTemplate] = useState<InspectTemplateRow | null>(null);
  const [editingItem, setEditingItem] = useState<InspectItemRow | null>(null);
  const [items, setItems] = useState<InspectItemRow[]>([]);
  const [message, setMessage] = useState("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);
  const templateTypes = dicts.safety_inspect_template_type ?? [];
  const itemTypes = dicts.safety_inspect_item_type ?? [];
  const hazardTypes = dicts.safety_hazard_type ?? [];
  const riskLevels = dicts.safety_risk_level ?? [];
  const statusItems = dicts.safety_inspect_template_status ?? [];

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "-update_time" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.templateType) params.set("template_type", filters.templateType);
    if (filters.status) params.set("status", filters.status);
    const response = await apiRequest<PaginatedResult<InspectTemplateRow>>(`/safety/inspect-templates?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=300", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = [
      "safety_inspect_template_type",
      "safety_inspect_item_type",
      "safety_hazard_type",
      "safety_risk_level",
      "safety_inspect_template_status"
    ];
    const entries = await Promise.all(codes.map(async (code) => {
      const dictTypeId = typeMap.get(code);
      if (!dictTypeId) return [code, []] as const;
      const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, {
        token: getAccessToken()
      });
      return [code, response.data.items.filter((item) => item.status === "enabled")] as const;
    }));
    setDicts(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    void loadDicts().catch((error: Error) => setMessage(error.message));
  }, [loadDicts]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  async function loadItems(template: InspectTemplateRow) {
    const response = await apiRequest<InspectItemRow[]>(`/safety/inspect-templates/${template.id}/items`, {
      token: getAccessToken()
    });
    setItems(response.data);
  }

  function openCreateTemplate() {
    setEditingTemplate(null);
    setTemplateForm({
      ...emptyTemplateForm,
      templateType: templateTypes.find((item) => item.itemValue === "comprehensive")?.itemValue ?? templateTypes[0]?.itemValue ?? "",
      status: "enabled"
    });
  }

  function openEditTemplate(row: InspectTemplateRow) {
    setEditingTemplate(row);
    setTemplateForm({
      templateCode: row.templateCode,
      templateName: row.templateName,
      templateType: row.templateType,
      description: row.description ?? "",
      status: row.status,
      remark: row.remark ?? ""
    });
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = editingTemplate ? `/safety/inspect-templates/${editingTemplate.id}` : "/safety/inspect-templates";
    await apiRequest<InspectTemplateRow>(path, {
      method: editingTemplate ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editingTemplate ? "safety-inspect-template-update" : "safety-inspect-template-create"),
      body: buildTemplatePayload(templateForm)
    });
    setMessage(editingTemplate ? "巡检模板已更新" : "巡检模板已新增");
    setEditingTemplate(null);
    setTemplateForm(emptyTemplateForm);
    await load(editingTemplate ? pageData.page : 1);
  }

  async function removeTemplate(row: InspectTemplateRow) {
    if (!window.confirm(`确认删除巡检模板 ${row.templateName}？`)) return;
    await apiRequest<{ id: string }>(`/safety/inspect-templates/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-inspect-template-delete")
    });
    setMessage("巡检模板已删除");
    await load(pageData.page);
  }

  async function openManageItems(row: InspectTemplateRow) {
    setManagingTemplate(row);
    setEditingItem(null);
    setItemForm(emptyItemForm);
    await loadItems(row);
  }

  function openCreateItem() {
    setEditingItem(null);
    setItemForm({
      ...emptyItemForm,
      itemType: itemTypes.find((item) => item.itemValue === "normal_abnormal")?.itemValue ?? itemTypes[0]?.itemValue ?? "",
      status: "enabled",
      sortNo: String((items.at(-1)?.sortNo ?? 0) + 10)
    });
  }

  function openEditItem(row: InspectItemRow) {
    setEditingItem(row);
    setItemForm({
      itemCode: row.itemCode ?? "",
      itemName: row.itemName,
      itemType: row.itemType,
      hazardType: row.hazardType ?? "",
      defaultRiskLevel: row.defaultRiskLevel ?? "",
      required: row.required,
      sortNo: String(row.sortNo ?? 0),
      standardDesc: row.standardDesc ?? "",
      status: row.status,
      remark: row.remark ?? ""
    });
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!managingTemplate) return;
    const path = editingItem
      ? `/safety/inspect-templates/${managingTemplate.id}/items/${editingItem.id}`
      : `/safety/inspect-templates/${managingTemplate.id}/items`;
    await apiRequest<InspectItemRow>(path, {
      method: editingItem ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editingItem ? "safety-inspect-item-update" : "safety-inspect-item-create"),
      body: buildItemPayload(itemForm)
    });
    setMessage(editingItem ? "检查项已更新" : "检查项已新增");
    setEditingItem(null);
    setItemForm(emptyItemForm);
    await loadItems(managingTemplate);
  }

  async function removeItem(row: InspectItemRow) {
    if (!managingTemplate) return;
    if (!window.confirm(`确认删除检查项 ${row.itemName}？`)) return;
    await apiRequest<{ id: string }>(`/safety/inspect-templates/${managingTemplate.id}/items/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-inspect-item-delete")
    });
    setMessage("检查项已删除");
    await loadItems(managingTemplate);
  }

  return (
    <PermissionGuard permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_TEMPLATE_READ} module={SAFETY_MODULE} fallback={<ForbiddenInline />}>
      <main className="content">
        <header className="header">
          <div className="header-title">
            <strong>巡检模板</strong>
            <span>定义安全巡检模板和逐项检查标准，供后续巡检计划与任务执行使用</span>
          </div>
          <div className="page-actions">
            <button className="primary-button secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_TEMPLATE_CREATE} type="button" onClick={openCreateTemplate}>
              <Plus size={16} />
              新增模板
            </PermissionButton>
          </div>
        </header>

        <Card>
          <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(1).catch((error: Error) => setMessage(error.message)); }}>
            <div className="dashboard-grid">
              <Field label="关键词">
                <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="模板编码 / 名称 / 描述" />
              </Field>
              <SelectField label="模板类型" value={filters.templateType} items={templateTypes} allLabel="全部类型" onChange={(value) => setFilters((current) => ({ ...current, templateType: value }))} />
              <SelectField label="状态" value={filters.status} items={statusItems} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
            </div>
            <div className="filter-actions">
              <button className="primary-button" type="submit">
                <Search size={16} />
                查询
              </button>
            </div>
          </form>
        </Card>

        <Card className="table-scroll">
          <DataTable>
            <thead>
              <tr>
                <th>模板编码</th>
                <th>模板名称</th>
                <th>模板类型</th>
                <th>描述</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.templateCode}</td>
                  <td>{row.templateName}</td>
                  <td><StatusPill dictCode="safety_inspect_template_type" value={row.templateType} dicts={dicts} /></td>
                  <td>{row.description ?? "-"}</td>
                  <td><StatusPill dictCode="safety_inspect_template_status" value={row.status} dicts={dicts} /></td>
                  <td>{formatDate(row.updateTime)}</td>
                  <td>
                    <DataTableActions>
                      <button className="row-action-button" type="button" onClick={() => setViewingTemplate(row)} title="查看">
                        <Eye size={16} />
                        查看
                      </button>
                      <PermissionButton className="row-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_TEMPLATE_UPDATE} type="button" onClick={() => openEditTemplate(row)} title="编辑">
                        <Edit3 size={16} />
                        编辑
                      </PermissionButton>
                      <PermissionButton className="row-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_ITEM_READ} type="button" onClick={() => void openManageItems(row).catch((error: Error) => setMessage(error.message))} title="检查项">
                        <ListChecks size={16} />
                        检查项
                      </PermissionButton>
                      <PermissionButton className="row-action-button row-action-button-danger" permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_TEMPLATE_DELETE} type="button" onClick={() => void removeTemplate(row).catch((error: Error) => setMessage(error.message))} title="删除">
                        <Trash2 size={16} />
                        删除
                      </PermissionButton>
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? (
                <tr>
                  <td colSpan={7}><EmptyState /></td>
                </tr>
              ) : null}
            </tbody>
          </DataTable>
          <div className="pagination">
            <span>共 {pageData.total} 条，第 {pageData.page} / {totalPages} 页</span>
            <button type="button" disabled={pageData.page <= 1} onClick={() => void load(pageData.page - 1).catch((error: Error) => setMessage(error.message))}>上一页</button>
            <button type="button" disabled={pageData.page >= totalPages} onClick={() => void load(pageData.page + 1).catch((error: Error) => setMessage(error.message))}>下一页</button>
          </div>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}

        {(templateForm !== emptyTemplateForm || editingTemplate) ? (
          <Drawer size="md" onClose={() => { setEditingTemplate(null); setTemplateForm(emptyTemplateForm); }}>
            <DrawerHeader title={editingTemplate ? "编辑巡检模板" : "新增巡检模板"} description="模板定义巡检任务要执行的一组检查项。" onClose={() => { setEditingTemplate(null); setTemplateForm(emptyTemplateForm); }} />
            <DrawerForm onSubmit={(event) => void saveTemplate(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <Field label="模板编码">
                  <input value={templateForm.templateCode} onChange={(event) => setTemplateFormValue("templateCode", event.target.value)} placeholder="留空自动生成" />
                </Field>
                <Field label="模板名称">
                  <input required value={templateForm.templateName} onChange={(event) => setTemplateFormValue("templateName", event.target.value)} />
                </Field>
                <SelectField label="模板类型" value={templateForm.templateType} items={templateTypes} allLabel="请选择类型" onChange={(value) => setTemplateFormValue("templateType", value)} />
                <SelectField label="状态" value={templateForm.status} items={statusItems} allLabel="请选择状态" onChange={(value) => setTemplateFormValue("status", value)} />
                <Field label="模板描述">
                  <textarea value={templateForm.description} onChange={(event) => setTemplateFormValue("description", event.target.value)} />
                </Field>
                <Field label="备注">
                  <textarea value={templateForm.remark} onChange={(event) => setTemplateFormValue("remark", event.target.value)} />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => { setEditingTemplate(null); setTemplateForm(emptyTemplateForm); }}>取消</button>
                <button className="primary-button" type="submit">保存</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {viewingTemplate ? (
          <Drawer size="md" onClose={() => setViewingTemplate(null)}>
            <DrawerHeader eyebrow="巡检模板详情" title={viewingTemplate.templateName} description={`${viewingTemplate.templateCode} · ${viewingTemplate.description ?? "未填写描述"}`} onClose={() => setViewingTemplate(null)} />
            <DrawerDetailGrid>
              <DrawerDetailItem label="模板编码" value={viewingTemplate.templateCode} />
              <DrawerDetailItem label="模板类型" value={<StatusPill dictCode="safety_inspect_template_type" value={viewingTemplate.templateType} dicts={dicts} />} />
              <DrawerDetailItem label="状态" value={<StatusPill dictCode="safety_inspect_template_status" value={viewingTemplate.status} dicts={dicts} />} />
              <DrawerDetailItem label="更新时间" value={formatDate(viewingTemplate.updateTime)} />
              <DrawerDetailItem label="描述" value={viewingTemplate.description ?? "-"} />
              <DrawerDetailItem label="备注" value={viewingTemplate.remark ?? "-"} />
            </DrawerDetailGrid>
          </Drawer>
        ) : null}

        {managingTemplate ? (
          <Drawer size="lg" onClose={() => { setManagingTemplate(null); setEditingItem(null); setItems([]); }}>
            <DrawerHeader eyebrow="检查项管理" title={managingTemplate.templateName} description="按排序号控制巡检任务中的检查项顺序。" onClose={() => { setManagingTemplate(null); setEditingItem(null); setItems([]); }} />
            <div className="page-actions">
              <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_ITEM_CREATE} type="button" onClick={openCreateItem}>
                <Plus size={16} />
                新增检查项
              </PermissionButton>
            </div>
            <DataTable>
              <thead>
                <tr>
                  <th>排序</th>
                  <th>检查项编码</th>
                  <th>检查项名称</th>
                  <th>类型</th>
                  <th>隐患类型</th>
                  <th>默认风险</th>
                  <th>必检</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.sortNo}</td>
                    <td>{row.itemCode ?? "-"}</td>
                    <td>{row.itemName}</td>
                    <td><StatusPill dictCode="safety_inspect_item_type" value={row.itemType} dicts={dicts} /></td>
                    <td>{row.hazardType ? <StatusPill dictCode="safety_hazard_type" value={row.hazardType} dicts={dicts} /> : "-"}</td>
                    <td>{row.defaultRiskLevel ? <StatusPill dictCode="safety_risk_level" value={row.defaultRiskLevel} dicts={dicts} /> : "-"}</td>
                    <td>{row.required ? "是" : "否"}</td>
                    <td><StatusPill dictCode="safety_inspect_template_status" value={row.status} dicts={dicts} /></td>
                    <td>
                      <DataTableActions>
                        <PermissionButton className="row-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_ITEM_UPDATE} type="button" onClick={() => openEditItem(row)} title="编辑">
                          <Edit3 size={16} />
                          编辑
                        </PermissionButton>
                        <PermissionButton className="row-action-button row-action-button-danger" permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_ITEM_DELETE} type="button" onClick={() => void removeItem(row).catch((error: Error) => setMessage(error.message))} title="删除">
                          <Trash2 size={16} />
                          删除
                        </PermissionButton>
                      </DataTableActions>
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={9}><div className="empty-state">暂无检查项</div></td>
                  </tr>
                ) : null}
              </tbody>
            </DataTable>

            {(itemForm !== emptyItemForm || editingItem) ? (
              <DrawerForm onSubmit={(event) => void saveItem(event).catch((error: Error) => setMessage(error.message))}>
                <DrawerFormGrid>
                  <Field label="检查项编码">
                    <input value={itemForm.itemCode} onChange={(event) => setItemFormValue("itemCode", event.target.value)} placeholder="留空自动生成" />
                  </Field>
                  <Field label="检查项名称">
                    <input required value={itemForm.itemName} onChange={(event) => setItemFormValue("itemName", event.target.value)} />
                  </Field>
                  <SelectField label="检查项类型" value={itemForm.itemType} items={itemTypes} allLabel="请选择类型" onChange={(value) => setItemFormValue("itemType", value)} />
                  <SelectField label="隐患类型" value={itemForm.hazardType} items={hazardTypes} allLabel="不指定" onChange={(value) => setItemFormValue("hazardType", value)} />
                  <SelectField label="默认风险" value={itemForm.defaultRiskLevel} items={riskLevels} allLabel="不指定" onChange={(value) => setItemFormValue("defaultRiskLevel", value)} />
                  <Field label="排序">
                    <input type="number" min={0} value={itemForm.sortNo} onFocus={(event) => event.target.select()} onChange={(event) => setItemFormValue("sortNo", event.target.value)} />
                  </Field>
                  <SelectField label="状态" value={itemForm.status} items={statusItems} allLabel="请选择状态" onChange={(value) => setItemFormValue("status", value)} />
                  <Field label="必检项">
                    <label className="form-check-row">
                      <input type="checkbox" checked={itemForm.required} onChange={(event) => setItemFormValue("required", event.target.checked)} />
                      必检
                    </label>
                  </Field>
                  <Field label="检查标准">
                    <textarea value={itemForm.standardDesc} onChange={(event) => setItemFormValue("standardDesc", event.target.value)} />
                  </Field>
                  <Field label="备注">
                    <textarea value={itemForm.remark} onChange={(event) => setItemFormValue("remark", event.target.value)} />
                  </Field>
                </DrawerFormGrid>
                <DrawerFooter>
                  <button className="secondary-button" type="button" onClick={() => { setEditingItem(null); setItemForm(emptyItemForm); }}>取消</button>
                  <button className="primary-button" type="submit">保存检查项</button>
                </DrawerFooter>
              </DrawerForm>
            ) : null}
          </Drawer>
        ) : null}
      </main>
    </PermissionGuard>
  );

  function setTemplateFormValue<K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) {
    setTemplateForm((current) => ({ ...current, [key]: value }));
  }

  function setItemFormValue<K extends keyof ItemForm>(key: K, value: ItemForm[K]) {
    setItemForm((current) => ({ ...current, [key]: value }));
  }
}

function buildTemplatePayload(form: TemplateForm) {
  return {
    template_code: form.templateCode.trim() || undefined,
    template_name: form.templateName.trim(),
    template_type: form.templateType || undefined,
    description: form.description.trim() || undefined,
    status: form.status || "enabled",
    remark: form.remark.trim() || undefined
  };
}

function buildItemPayload(form: ItemForm) {
  return {
    item_code: form.itemCode.trim() || undefined,
    item_name: form.itemName.trim(),
    item_type: form.itemType || undefined,
    hazard_type: form.hazardType || undefined,
    default_risk_level: form.defaultRiskLevel || undefined,
    required: form.required,
    sort_no: Number(form.sortNo || 0),
    standard_desc: form.standardDesc.trim() || undefined,
    status: form.status || "enabled",
    remark: form.remark.trim() || undefined
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      <span>{label}</span>
      {children}
    </label>
  );
}

function SelectField({
  label,
  value,
  items,
  allLabel,
  onChange
}: {
  label: string;
  value: string;
  items: DictItemRow[];
  allLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {items.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
      </select>
    </Field>
  );
}

function EmptyState() {
  return <div className="empty-state">暂无巡检模板</div>;
}

function ForbiddenInline() {
  return <main className="content"><Card><div className="empty-state">403，无巡检模板访问权限或 safety 模块未授权</div></Card></main>;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
