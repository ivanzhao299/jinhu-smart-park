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
  DrawerHeader
} from "@jinhu/ui";
import { Edit3, Eye, Plus, Save, Search, X } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";

type OrgStatus = "enabled" | "disabled";

interface OrgRow {
  id: string;
  parentId: string | null;
  orgCode: string;
  orgName: string;
  orgType: string;
  leaderUserId: string | null;
  status: OrgStatus;
  sortOrder: number;
  remark: string | null;
  tenantId: string;
  parkId: string;
  createTime: string;
  updateTime: string;
}

interface OrgFormState {
  orgCode: string;
  orgName: string;
  orgType: string;
  status: OrgStatus;
  sortOrder: string;
  remark: string;
}

const emptyPage: PaginatedResult<OrgRow> = { items: [], page: 1, page_size: 20, total: 0 };

const emptyForm: OrgFormState = {
  orgCode: "",
  orgName: "",
  orgType: "department",
  status: "enabled",
  sortOrder: "0",
  remark: ""
};

const orgTypeOptions = [
  { value: "park", label: "园区" },
  { value: "group", label: "集团" },
  { value: "company", label: "公司" },
  { value: "department", label: "部门" },
  { value: "project", label: "项目组" },
  { value: "team", label: "班组" }
];

const orgTypeLabels = new Map(orgTypeOptions.map((item) => [item.value, item.label]));

function toOrgFormState(org: OrgRow): OrgFormState {
  return {
    orgCode: org.orgCode,
    orgName: org.orgName,
    orgType: org.orgType,
    status: org.status,
    sortOrder: String(org.sortOrder ?? 0),
    remark: org.remark ?? ""
  };
}

export default function OrgsPage() {
  const [data, setData] = useState(emptyPage);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingOrg, setEditingOrg] = useState<OrgRow | null>(null);
  const [viewingOrg, setViewingOrg] = useState<OrgRow | null>(null);
  const [form, setForm] = useState<OrgFormState>(emptyForm);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (keyword.trim()) params.set("keyword", keyword.trim());
    if (status) params.set("status", status);
    const response = await apiRequest<PaginatedResult<OrgRow>>(`/orgs?${params.toString()}`, { token: getAccessToken() });
    setData(response.data);
  }, [keyword, status]);

  useEffect(() => {
    void load().catch(showError);
  }, [load]);

  function openCreate() {
    setEditingOrg(null);
    setForm(emptyForm);
    setShowForm(true);
    setMessage("");
  }

  async function openView(row: OrgRow) {
    setViewingOrg(row);
    setMessage("");
    try {
      const response = await apiRequest<OrgRow>(`/orgs/${row.id}`, { token: getAccessToken() });
      setViewingOrg((current) => (current?.id === row.id ? response.data : current));
    } catch (error) {
      showError(error);
    }
  }

  async function openEdit(row: OrgRow) {
    setEditingOrg(row);
    setForm(toOrgFormState(row));
    setShowForm(true);
    setMessage("");
    try {
      const response = await apiRequest<OrgRow>(`/orgs/${row.id}`, { token: getAccessToken() });
      const detail = response.data;
      setEditingOrg((current) => (current?.id === row.id ? detail : current));
      setForm(toOrgFormState(detail));
    } catch (error) {
      showError(error);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      orgCode: form.orgCode.trim(),
      orgName: form.orgName.trim(),
      orgType: form.orgType,
      status: form.status,
      sortOrder: Number.parseInt(form.sortOrder || "0", 10) || 0,
      remark: form.remark.trim() || undefined
    };

    if (editingOrg) {
      await apiRequest<OrgRow>(`/orgs/${editingOrg.id}`, {
        method: "PATCH",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("org-update"),
        body
      });
      setMessage("组织已更新");
    } else {
      await apiRequest<OrgRow>("/orgs", {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("org"),
        body
      });
      setMessage("组织已创建");
    }

    setShowForm(false);
    setEditingOrg(null);
    await load(editingOrg ? data.page : 1);
  }

  function closeForm() {
    setShowForm(false);
    setEditingOrg(null);
  }

  function showError(error: unknown) {
    setMessage(error instanceof Error ? error.message : "操作失败");
  }

  return (
    <main className="page-container">
      <header className="page-header">
        <div className="header-title">
          <strong>组织管理</strong>
          <span>维护园区组织架构、层级关系和启停状态，数据范围按当前租户与园区隔离。</span>
        </div>
        <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.ORG_CREATE} type="button" onClick={openCreate}>
          <Plus size={16} />
          新增组织
        </PermissionButton>
      </header>

      <section className="filter-bar">
        <form className="system-grid" onSubmit={(event) => { event.preventDefault(); void load(1).catch(showError); }}>
          <div className="field">
            <label htmlFor="orgKeyword">关键词</label>
            <input
              id="orgKeyword"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="组织名称 / 组织编码"
            />
          </div>
          <div className="field">
            <label htmlFor="orgStatus">状态</label>
            <select id="orgStatus" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">全部</option>
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
            </select>
          </div>
          <div className="filter-actions">
            <button className="primary-button" type="submit">
              <Search size={16} />
              查询
            </button>
          </div>
        </form>
      </section>

      <Card>
        <div className="system-toolbar">
          <h2 className="panel-title">组织列表</h2>
          <span className="muted-text">共 {data.total} 个组织</span>
        </div>
        <div className="table-scroll">
          <DataTable>
            <thead>
              <tr>
                <th>编码</th>
                <th>名称</th>
                <th>类型</th>
                <th>状态</th>
                <th>排序</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.orgCode}</td>
                  <td>
                    <strong>{item.orgName}</strong>
                  </td>
                  <td>{orgTypeLabels.get(item.orgType) ?? item.orgType}</td>
                  <td><StatusBadge status={item.status} /></td>
                  <td>{item.sortOrder}</td>
                  <td>
                    <DataTableActions>
                      <PermissionButton
                        aria-label="查看组织"
                        className="ds-row-action ds-row-action-view"
                        permission={SYSTEM_PERMISSIONS.ORG_DETAIL}
                        title="查看"
                        type="button"
                        onClick={() => void openView(item).catch(showError)}
                      >
                        <Eye size={16} />
                      </PermissionButton>
                      <PermissionButton
                        aria-label="编辑组织"
                        className="ds-row-action ds-row-action-edit"
                        permission={SYSTEM_PERMISSIONS.ORG_UPDATE}
                        title="编辑"
                        type="button"
                        onClick={() => void openEdit(item).catch(showError)}
                      >
                        <Edit3 size={16} />
                      </PermissionButton>
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={6}>暂无组织数据</td>
                </tr>
              ) : null}
            </tbody>
          </DataTable>
        </div>
        <div className="task-item">
          <span>
            共 {data.total} 条，第 {data.page} / {Math.max(1, Math.ceil(data.total / data.page_size))} 页
          </span>
          <span className="pagination-actions">
            <button
              className="pagination-button"
              type="button"
              disabled={data.page <= 1}
              onClick={() => void load(Math.max(1, data.page - 1)).catch(showError)}
            >
              上一页
            </button>
            <button
              className="pagination-button"
              type="button"
              disabled={data.page >= Math.max(1, Math.ceil(data.total / data.page_size))}
              onClick={() => void load(data.page + 1).catch(showError)}
            >
              下一页
            </button>
          </span>
        </div>
      </Card>

      {showForm ? (
        <Drawer size="md" onClose={closeForm}>
          <DrawerHeader
            eyebrow="系统管理"
            title={editingOrg ? "编辑组织" : "新增组织"}
            description="维护组织编码、名称、类型、状态和排序，支持园区内部组织结构管理。"
            onClose={closeForm}
            closeIcon={<X size={18} />}
          />
          <DrawerForm key={editingOrg?.id ?? "new-org"} onSubmit={(event) => void submit(event).catch(showError)}>
            <DrawerFormGrid>
              <div className="field">
                <label htmlFor="orgCode">组织编码</label>
                <input
                  id="orgCode"
                  required
                  value={form.orgCode}
                  onChange={(event) => setForm((current) => ({ ...current, orgCode: event.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="orgName">组织名称</label>
                <input
                  id="orgName"
                  required
                  value={form.orgName}
                  onChange={(event) => setForm((current) => ({ ...current, orgName: event.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="orgType">组织类型</label>
                <select
                  id="orgType"
                  value={form.orgType}
                  onChange={(event) => setForm((current) => ({ ...current, orgType: event.target.value }))}
                >
                  {orgTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="orgStatusForm">状态</label>
                <select
                  id="orgStatusForm"
                  value={form.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as OrgStatus }))}
                >
                  <option value="enabled">启用</option>
                  <option value="disabled">停用</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="sortOrder">排序</label>
                <input
                  id="sortOrder"
                  inputMode="numeric"
                  value={form.sortOrder}
                  onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))}
                />
              </div>
            </DrawerFormGrid>
            <DrawerFormGrid single>
              <div className="field">
                <label htmlFor="orgRemark">备注</label>
                <textarea
                  id="orgRemark"
                  rows={4}
                  value={form.remark}
                  onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))}
                  placeholder="可记录组织职责、适用范围或补充说明"
                />
              </div>
            </DrawerFormGrid>
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={closeForm}>取消</button>
              <button className="primary-button" type="submit">
                <Save size={16} />
                保存
              </button>
            </DrawerFooter>
          </DrawerForm>
        </Drawer>
      ) : null}

      {viewingOrg ? (
        <Drawer size="md" onClose={() => setViewingOrg(null)}>
          <DrawerHeader
            eyebrow="系统管理"
            title="组织详情"
            description="查看当前组织的基础档案、隔离范围和最近更新时间。"
            onClose={() => setViewingOrg(null)}
            closeIcon={<X size={18} />}
          />
          <DrawerDetailGrid>
            <DrawerDetailItem label="组织编码" value={viewingOrg.orgCode} />
            <DrawerDetailItem label="组织名称" value={viewingOrg.orgName} />
            <DrawerDetailItem label="组织类型" value={orgTypeLabels.get(viewingOrg.orgType) ?? viewingOrg.orgType} />
            <DrawerDetailItem label="状态" value={<StatusBadge status={viewingOrg.status} />} />
            <DrawerDetailItem label="排序" value={viewingOrg.sortOrder} />
            <DrawerDetailItem label="数据租户" value={viewingOrg.tenantId} />
            <DrawerDetailItem label="园区范围" value={viewingOrg.parkId} />
            <DrawerDetailItem label="创建时间" value={formatDateTime(viewingOrg.createTime)} />
            <DrawerDetailItem label="更新时间" value={formatDateTime(viewingOrg.updateTime)} />
            <DrawerDetailItem label="备注" value={viewingOrg.remark ?? "-"} />
          </DrawerDetailGrid>
          <DrawerFooter>
            <button className="secondary-button" type="button" onClick={() => setViewingOrg(null)}>关闭</button>
          </DrawerFooter>
        </Drawer>
      ) : null}

      {message ? <p className="status-pill">{message}</p> : null}
    </main>
  );
}

function StatusBadge({ status }: { status: OrgStatus }) {
  return (
    <span className={`status-pill ${status === "enabled" ? "status-success" : "status-muted"}`}>
      {status === "enabled" ? "启用" : "停用"}
    </span>
  );
}

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}
