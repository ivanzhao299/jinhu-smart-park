"use client";
import {
  DataTable,
  Drawer,
  DrawerDetailGrid,
  DrawerDetailItem,
  DrawerFooter,
  DrawerForm,
  DrawerFormGrid,
  DrawerHeader,
  Card
} from "@jinhu/ui";

import { Edit3, Eye, Plus, Save, Search, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";

interface DictTypeRow {
  id: string;
  dictCode: string;
  dictName: string;
  status: string;
  remark?: string | null;
  tenantId?: string;
  parkId?: string;
  createTime?: string;
  updateTime?: string;
}

interface DictItemRow {
  id: string;
  dictTypeId: string;
  itemLabel: string;
  itemValue: string;
  status: string;
  tagType: string | null;
  sortOrder?: number;
  remark?: string | null;
  tenantId?: string;
  parkId?: string;
  createTime?: string;
  updateTime?: string;
}

const emptyTypes: PaginatedResult<DictTypeRow> = { items: [], page: 1, page_size: 20, total: 0 };
const emptyItems: PaginatedResult<DictItemRow> = { items: [], page: 1, page_size: 20, total: 0 };

export default function DictsPage() {
  const [types, setTypes] = useState(emptyTypes);
  const [items, setItems] = useState(emptyItems);
  const [keyword, setKeyword] = useState("");
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [editingType, setEditingType] = useState<DictTypeRow | null>(null);
  const [editingItem, setEditingItem] = useState<DictItemRow | null>(null);
  const [viewingType, setViewingType] = useState<DictTypeRow | null>(null);
  const [viewingItem, setViewingItem] = useState<DictItemRow | null>(null);

  async function loadTypes(page = 1) {
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (keyword) params.set("keyword", keyword);
    const response = await apiRequest<PaginatedResult<DictTypeRow>>(`/dict-types?${params.toString()}`, { token });
    setTypes(response.data);
  }

  async function loadItems(page = 1, dictTypeId = selectedTypeId) {
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (dictTypeId) params.set("dict_type_id", dictTypeId);
    const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?${params.toString()}`, { token });
    setItems(response.data);
  }

  useEffect(() => {
    void loadTypes().catch((error: Error) => setMessage(error.message));
    void loadItems().catch((error: Error) => setMessage(error.message));
  }, []);

  async function openTypeDetail(id: string) {
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    const response = await apiRequest<DictTypeRow>(`/dict-types/${id}`, { token });
    setViewingType(response.data);
    setMessage("");
  }

  async function openTypeEdit(id: string) {
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    const response = await apiRequest<DictTypeRow>(`/dict-types/${id}`, { token });
    setEditingType(response.data);
    setShowCreate(true);
    setMessage("");
  }

  async function openItemDetail(id: string) {
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    const response = await apiRequest<DictItemRow>(`/dict-items/${id}`, { token });
    setViewingItem(response.data);
    setMessage("");
  }

  async function openItemEdit(id: string) {
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    const response = await apiRequest<DictItemRow>(`/dict-items/${id}`, { token });
    setEditingItem(response.data);
    setShowCreateItem(true);
    setMessage("");
  }

  function closeTypeForm() {
    setShowCreate(false);
    setEditingType(null);
  }

  function closeItemForm() {
    setShowCreateItem(false);
    setEditingItem(null);
  }

  function openCreateType() {
    setEditingType(null);
    setShowCreate(true);
    setMessage("");
  }

  function openCreateItem() {
    setEditingItem(null);
    setShowCreateItem(true);
    setMessage("");
  }

  async function createType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    const body = {
      dictCode: String(form.get("dictCode") ?? "").trim(),
      dictName: String(form.get("dictName") ?? "").trim(),
      status: String(form.get("status") ?? "enabled"),
      remark: String(form.get("remark") ?? "").trim() || undefined
    };
    if (editingType) {
      await apiRequest<DictTypeRow>(`/dict-types/${editingType.id}`, {
        method: "PATCH",
        token,
        idempotencyKey: createIdempotencyKey("dict-type-update"),
        body
      });
      setMessage("字典类型已更新");
    } else {
      await apiRequest<DictTypeRow>("/dict-types", {
        method: "POST",
        token,
        idempotencyKey: createIdempotencyKey("dict-type"),
        body
      });
      setMessage("字典类型已创建");
    }
    closeTypeForm();
    await loadTypes();
  }

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    const body = {
      dictTypeId: String(form.get("dictTypeId") ?? ""),
      itemLabel: String(form.get("itemLabel") ?? "").trim(),
      itemValue: String(form.get("itemValue") ?? "").trim(),
      tagType: String(form.get("tagType") ?? "").trim() || undefined,
      status: String(form.get("status") ?? "enabled"),
      sortOrder: Number.parseInt(String(form.get("sortOrder") ?? "0"), 10) || 0,
      remark: String(form.get("remark") ?? "").trim() || undefined
    };
    if (editingItem) {
      await apiRequest<DictItemRow>(`/dict-items/${editingItem.id}`, {
        method: "PATCH",
        token,
        idempotencyKey: createIdempotencyKey("dict-item-update"),
        body
      });
      setMessage("字典项已更新");
    } else {
      await apiRequest<DictItemRow>("/dict-items", {
        method: "POST",
        token,
        idempotencyKey: createIdempotencyKey("dict-item"),
        body
      });
      setMessage("字典项已创建");
    }
    closeItemForm();
    await loadItems();
  }

  return (
    <main className="page-container">
      <header className="page-header">
        <div className="header-title"><strong>字典管理</strong><span>维护系统字典类型和字典项</span></div>
        <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.DICT_TYPE_CREATE} type="button" onClick={openCreateType}><Plus size={16} />新增字典类型</PermissionButton>
      </header>
      <section className="filter-bar">
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void loadTypes(); }}>
          <div className="dashboard-grid">
            <div className="field"><label>关键词</label><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="字典名称" /></div>
            <div className="field"><label>字典类型</label><select value={selectedTypeId} onChange={(event) => { setSelectedTypeId(event.target.value); void loadItems(1, event.target.value); }}><option value="">全部</option>{types.items.map((item) => <option value={item.id} key={item.id}>{item.dictName}</option>)}</select></div>
          </div>
          <button className="primary-button" type="submit"><Search size={16} />查询</button>
        </form>
      </section>
      <Card >
        <h2 className="panel-title">字典类型</h2>
        <DataTable >
          <thead><tr><th>编码</th><th>名称</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            {types.items.map((item) => (
              <tr key={item.id}>
                <td>{item.dictCode}</td>
                <td>{item.dictName}</td>
                <td><span className="status-pill status-success">{item.status === "enabled" ? "启用" : "停用"}</span></td>
                <td>
                  <span className="data-table-actions">
                    <PermissionButton
                      className="ds-row-action ds-row-action-view"
                      permission={SYSTEM_PERMISSIONS.DICT_TYPE_DETAIL}
                      type="button"
                      title="详情"
                      onClick={() => void openTypeDetail(item.id).catch((error: Error) => setMessage(error.message))}
                    >
                      <Eye size={16} />
                      <span className="ds-row-action-label">详情</span>
                    </PermissionButton>
                    <PermissionButton
                      className="ds-row-action ds-row-action-edit"
                      permission={SYSTEM_PERMISSIONS.DICT_TYPE_UPDATE}
                      type="button"
                      title="编辑"
                      onClick={() => void openTypeEdit(item.id).catch((error: Error) => setMessage(error.message))}
                    >
                      <Edit3 size={16} />
                      <span className="ds-row-action-label">编辑</span>
                    </PermissionButton>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        <div className="task-item"><span>共 {types.total} 条，第 {types.page} 页</span><span><button className="pagination-button" type="button" onClick={() => void loadTypes(Math.max(1, types.page - 1))}>上一页</button><button className="pagination-button" type="button" onClick={() => void loadTypes(types.page + 1)}>下一页</button></span></div>
      </Card>
      <Card >
        <div className="task-item">
          <h2 className="panel-title">字典项</h2>
          <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.DICT_ITEM_CREATE} type="button" onClick={openCreateItem}><Plus size={16} />新增字典项</PermissionButton>
        </div>
        <DataTable >
          <thead><tr><th>标签</th><th>值</th><th>标签类型</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            {items.items.map((item) => (
              <tr key={item.id}>
                <td>{item.itemLabel}</td>
                <td>{item.itemValue}</td>
                <td>{item.tagType ?? "-"}</td>
                <td><span className="status-pill status-success">{item.status === "enabled" ? "启用" : "停用"}</span></td>
                <td>
                  <span className="data-table-actions">
                    <PermissionButton
                      className="ds-row-action ds-row-action-view"
                      permission={SYSTEM_PERMISSIONS.DICT_ITEM_DETAIL}
                      type="button"
                      title="详情"
                      onClick={() => void openItemDetail(item.id).catch((error: Error) => setMessage(error.message))}
                    >
                      <Eye size={16} />
                      <span className="ds-row-action-label">详情</span>
                    </PermissionButton>
                    <PermissionButton
                      className="ds-row-action ds-row-action-edit"
                      permission={SYSTEM_PERMISSIONS.DICT_ITEM_UPDATE}
                      type="button"
                      title="编辑"
                      onClick={() => void openItemEdit(item.id).catch((error: Error) => setMessage(error.message))}
                    >
                      <Edit3 size={16} />
                      <span className="ds-row-action-label">编辑</span>
                    </PermissionButton>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        <div className="task-item"><span>共 {items.total} 条，第 {items.page} 页</span><span><button className="pagination-button" type="button" onClick={() => void loadItems(Math.max(1, items.page - 1))}>上一页</button><button className="pagination-button" type="button" onClick={() => void loadItems(items.page + 1)}>下一页</button></span></div>
      </Card>
      {showCreate ? (
        <Drawer size="md" onClose={closeTypeForm}>
          <DrawerHeader
            eyebrow="系统管理"
            title={editingType ? "编辑字典类型" : "新增字典类型"}
            description="维护字典类型，用于承载业务模块的状态、分类和下拉选项。"
            onClose={closeTypeForm}
            closeIcon={<X size={18} />}
          />
          <DrawerForm key={editingType?.id ?? "new-dict-type"} onSubmit={(event) => void createType(event).catch((error: Error) => setMessage(error.message))}>
            <DrawerFormGrid>
              <div className="field"><label>编码</label><input name="dictCode" defaultValue={editingType?.dictCode ?? ""} required /></div>
              <div className="field"><label>名称</label><input name="dictName" defaultValue={editingType?.dictName ?? ""} required /></div>
              <div className="field"><label>状态</label><select name="status" defaultValue={editingType?.status ?? "enabled"}><option value="enabled">启用</option><option value="disabled">停用</option></select></div>
            </DrawerFormGrid>
            <DrawerFormGrid single>
              <div className="field"><label>备注</label><textarea name="remark" rows={4} defaultValue={editingType?.remark ?? ""} placeholder="用于说明该字典的业务范围或维护规则" /></div>
            </DrawerFormGrid>
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={closeTypeForm}>取消</button>
              <button className="primary-button" type="submit"><Save size={16} />保存</button>
            </DrawerFooter>
          </DrawerForm>
        </Drawer>
      ) : null}
      {showCreateItem ? (
        <Drawer size="md" onClose={closeItemForm}>
          <DrawerHeader
            eyebrow="系统管理"
            title={editingItem ? "编辑字典项" : "新增字典项"}
            description="维护字典项标签、值和展示标签类型，供前端下拉、状态标签和业务规则复用。"
            onClose={closeItemForm}
            closeIcon={<X size={18} />}
          />
          <DrawerForm key={editingItem?.id ?? "new-dict-item"} onSubmit={(event) => void createItem(event).catch((error: Error) => setMessage(error.message))}>
            <DrawerFormGrid>
              <div className="field"><label>字典类型</label><select name="dictTypeId" defaultValue={editingItem?.dictTypeId ?? selectedTypeId} required>{types.items.map((item) => <option value={item.id} key={item.id}>{item.dictName}</option>)}</select></div>
              <div className="field"><label>标签</label><input name="itemLabel" defaultValue={editingItem?.itemLabel ?? ""} required /></div>
              <div className="field"><label>值</label><input name="itemValue" defaultValue={editingItem?.itemValue ?? ""} required /></div>
              <div className="field"><label>标签类型</label><input name="tagType" defaultValue={editingItem?.tagType ?? ""} placeholder="success / warning / info 等" /></div>
              <div className="field"><label>状态</label><select name="status" defaultValue={editingItem?.status ?? "enabled"}><option value="enabled">启用</option><option value="disabled">停用</option></select></div>
              <div className="field"><label>排序</label><input name="sortOrder" inputMode="numeric" defaultValue={String(editingItem?.sortOrder ?? 0)} /></div>
            </DrawerFormGrid>
            <DrawerFormGrid single>
              <div className="field"><label>备注</label><textarea name="remark" rows={4} defaultValue={editingItem?.remark ?? ""} placeholder="补充说明该字典项的适用业务场景" /></div>
            </DrawerFormGrid>
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={closeItemForm}>取消</button>
              <button className="primary-button" type="submit"><Save size={16} />保存</button>
            </DrawerFooter>
          </DrawerForm>
        </Drawer>
      ) : null}
      {viewingType ? (
        <Drawer size="md" onClose={() => setViewingType(null)}>
          <DrawerHeader
            eyebrow="系统管理"
            title="字典类型详情"
            description="查看当前字典类型的编码、隔离范围和最近更新时间。"
            onClose={() => setViewingType(null)}
            closeIcon={<X size={18} />}
          />
          <DrawerDetailGrid>
            <DrawerDetailItem label="字典编码" value={viewingType.dictCode} />
            <DrawerDetailItem label="字典名称" value={viewingType.dictName} />
            <DrawerDetailItem label="状态" value={<span className={`status-pill ${viewingType.status === "enabled" ? "status-success" : "status-muted"}`}>{viewingType.status === "enabled" ? "启用" : "停用"}</span>} />
            <DrawerDetailItem label="tenant_id" value={viewingType.tenantId ?? "-"} />
            <DrawerDetailItem label="park_id" value={viewingType.parkId ?? "-"} />
            <DrawerDetailItem label="创建时间" value={formatDateTime(viewingType.createTime)} />
            <DrawerDetailItem label="更新时间" value={formatDateTime(viewingType.updateTime)} />
            <DrawerDetailItem label="备注" value={viewingType.remark ?? "-"} />
          </DrawerDetailGrid>
          <DrawerFooter>
            <button className="secondary-button" type="button" onClick={() => setViewingType(null)}>关闭</button>
          </DrawerFooter>
        </Drawer>
      ) : null}
      {viewingItem ? (
        <Drawer size="md" onClose={() => setViewingItem(null)}>
          <DrawerHeader
            eyebrow="系统管理"
            title="字典项详情"
            description="查看当前字典项的标签、值、标签类型和所属字典。"
            onClose={() => setViewingItem(null)}
            closeIcon={<X size={18} />}
          />
          <DrawerDetailGrid>
            <DrawerDetailItem label="标签" value={viewingItem.itemLabel} />
            <DrawerDetailItem label="值" value={viewingItem.itemValue} />
            <DrawerDetailItem label="字典类型 ID" value={viewingItem.dictTypeId} />
            <DrawerDetailItem label="标签类型" value={viewingItem.tagType ?? "-"} />
            <DrawerDetailItem label="状态" value={<span className={`status-pill ${viewingItem.status === "enabled" ? "status-success" : "status-muted"}`}>{viewingItem.status === "enabled" ? "启用" : "停用"}</span>} />
            <DrawerDetailItem label="排序" value={viewingItem.sortOrder ?? 0} />
            <DrawerDetailItem label="tenant_id" value={viewingItem.tenantId ?? "-"} />
            <DrawerDetailItem label="park_id" value={viewingItem.parkId ?? "-"} />
            <DrawerDetailItem label="创建时间" value={formatDateTime(viewingItem.createTime)} />
            <DrawerDetailItem label="更新时间" value={formatDateTime(viewingItem.updateTime)} />
            <DrawerDetailItem label="备注" value={viewingItem.remark ?? "-"} />
          </DrawerDetailGrid>
          <DrawerFooter>
            <button className="secondary-button" type="button" onClick={() => setViewingItem(null)}>关闭</button>
          </DrawerFooter>
        </Drawer>
      ) : null}
      {message ? <p className="status-pill">{message}</p> : null}
    </main>
  );
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}
