"use client";
import { DataTable, Drawer, DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader, Card } from "@jinhu/ui";

import { Edit3, Eye, Plus, Search, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/permission-button";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";

interface DictTypeRow {
  id: string;
  dictCode: string;
  dictName: string;
  status: string;
}

interface DictItemRow {
  id: string;
  itemLabel: string;
  itemValue: string;
  status: string;
  tagType: string | null;
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

  async function createType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    await apiRequest<DictTypeRow>("/dict-types", {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("dict-type"),
      body: {
        dictCode: String(form.get("dictCode") ?? ""),
        dictName: String(form.get("dictName") ?? ""),
        status: String(form.get("status") ?? "enabled")
      }
    });
    setShowCreate(false);
    await loadTypes();
  }

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    await apiRequest<DictItemRow>("/dict-items", {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("dict-item"),
      body: {
        dictTypeId: String(form.get("dictTypeId") ?? ""),
        itemLabel: String(form.get("itemLabel") ?? ""),
        itemValue: String(form.get("itemValue") ?? ""),
        tagType: String(form.get("tagType") ?? ""),
        status: String(form.get("status") ?? "enabled")
      }
    });
    setShowCreateItem(false);
    await loadItems();
  }

  return (
    <main className="page-container">
      <header className="page-header">
        <div className="header-title"><strong>字典管理</strong><span>维护系统字典类型和字典项</span></div>
        <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.DICT_TYPE_CREATE} type="button" onClick={() => setShowCreate(true)}><Plus size={16} />新增字典类型</PermissionButton>
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
                    <PermissionButton className="ds-row-action ds-row-action-view" permission={SYSTEM_PERMISSIONS.DICT_TYPE_DETAIL} type="button" title="详情">
                      <Eye size={16} />
                      <span className="ds-row-action-label">详情</span>
                    </PermissionButton>
                    <PermissionButton className="ds-row-action ds-row-action-edit" permission={SYSTEM_PERMISSIONS.DICT_TYPE_UPDATE} type="button" title="编辑">
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
          <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.DICT_ITEM_CREATE} type="button" onClick={() => setShowCreateItem(true)}><Plus size={16} />新增字典项</PermissionButton>
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
                    <PermissionButton className="ds-row-action ds-row-action-view" permission={SYSTEM_PERMISSIONS.DICT_ITEM_DETAIL} type="button" title="详情">
                      <Eye size={16} />
                      <span className="ds-row-action-label">详情</span>
                    </PermissionButton>
                    <PermissionButton className="ds-row-action ds-row-action-edit" permission={SYSTEM_PERMISSIONS.DICT_ITEM_UPDATE} type="button" title="编辑">
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
        <Drawer size="md" onClose={() => setShowCreate(false)}>
          <DrawerHeader
            eyebrow="系统管理"
            title="新增字典类型"
            description="创建一个新的字典类型用于归集字典项。"
            onClose={() => setShowCreate(false)}
            closeIcon={<X size={18} />}
          />
          <DrawerForm onSubmit={(event) => void createType(event).catch((error: Error) => setMessage(error.message))}>
            <DrawerFormGrid>
              <div className="field"><label>编码</label><input name="dictCode" /></div>
              <div className="field"><label>名称</label><input name="dictName" /></div>
              <div className="field"><label>状态</label><select name="status"><option value="enabled">启用</option><option value="disabled">停用</option></select></div>
            </DrawerFormGrid>
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={() => setShowCreate(false)}>取消</button>
              <button className="primary-button" type="submit">保存</button>
            </DrawerFooter>
          </DrawerForm>
        </Drawer>
      ) : null}
      {showCreateItem ? (
        <Drawer size="md" onClose={() => setShowCreateItem(false)}>
          <DrawerHeader
            eyebrow="系统管理"
            title="新增字典项"
            description="在所选字典类型下新增可选的字典项。"
            onClose={() => setShowCreateItem(false)}
            closeIcon={<X size={18} />}
          />
          <DrawerForm onSubmit={(event) => void createItem(event).catch((error: Error) => setMessage(error.message))}>
            <DrawerFormGrid>
              <div className="field"><label>字典类型</label><select name="dictTypeId" defaultValue={selectedTypeId}>{types.items.map((item) => <option value={item.id} key={item.id}>{item.dictName}</option>)}</select></div>
              <div className="field"><label>标签</label><input name="itemLabel" /></div>
              <div className="field"><label>值</label><input name="itemValue" /></div>
              <div className="field"><label>标签类型</label><input name="tagType" /></div>
              <div className="field"><label>状态</label><select name="status"><option value="enabled">启用</option><option value="disabled">停用</option></select></div>
            </DrawerFormGrid>
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={() => setShowCreateItem(false)}>取消</button>
              <button className="primary-button" type="submit">保存</button>
            </DrawerFooter>
          </DrawerForm>
        </Drawer>
      ) : null}
      {message ? <p className="status-pill">{message}</p> : null}
    </main>
  );
}
