"use client";
import { Card } from "@jinhu/ui";

import { Edit3, Eye, Plus, Search } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/permission-button";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";

interface OrgRow {
  id: string;
  orgCode: string;
  orgName: string;
  orgType: string;
  status: string;
  sortOrder: number;
}

const emptyPage: PaginatedResult<OrgRow> = { items: [], page: 1, page_size: 20, total: 0 };

export default function OrgsPage() {
  const [data, setData] = useState(emptyPage);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  async function load(page = 1) {
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (keyword) params.set("keyword", keyword);
    if (status) params.set("status", status);
    const response = await apiRequest<PaginatedResult<OrgRow>>(`/orgs?${params.toString()}`, { token });
    setData(response.data);
  }

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, []);

  async function createOrg(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    await apiRequest<OrgRow>("/orgs", {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("org"),
      body: {
        orgCode: String(form.get("orgCode") ?? ""),
        orgName: String(form.get("orgName") ?? ""),
        orgType: String(form.get("orgType") ?? "department"),
        status: String(form.get("status") ?? "enabled")
      }
    });
    setShowCreate(false);
    await load();
  }

  return (
    <main className="content">
      <header className="header">
        <div className="header-title">
          <strong>组织管理</strong>
          <span>维护园区组织架构，所有数据按 tenant_id / park_id 隔离</span>
        </div>
        <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.ORG_CREATE} type="button" onClick={() => setShowCreate(true)}>
          <Plus size={16} />
          新增组织
        </PermissionButton>
      </header>

      <Card >
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <div className="dashboard-grid">
            <div className="field">
              <label htmlFor="keyword">关键词</label>
              <input id="keyword" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="组织名称" />
            </div>
            <div className="field">
              <label htmlFor="status">状态</label>
              <select id="status" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">全部</option>
                <option value="enabled">启用</option>
                <option value="disabled">停用</option>
              </select>
            </div>
          </div>
          <button className="primary-button" type="submit">
            <Search size={16} />
            查询
          </button>
        </form>
      </Card>

      <Card >
        <h2 className="panel-title">组织列表</h2>
        <div className="native-table-wrap">
          <table className="native-table">
            <thead>
              <tr>
                <th>编码</th>
                <th>名称</th>
                <th>类型</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.orgCode}</td>
                  <td>{item.orgName}</td>
                  <td>{item.orgType}</td>
                  <td><span className="status-pill">{item.status === "enabled" ? "启用" : "停用"}</span></td>
                  <td>
                    <span className="data-table-actions">
                      <PermissionButton permission={SYSTEM_PERMISSIONS.ORG_DETAIL} type="button" title="详情"><Eye size={16} /></PermissionButton>
                      <PermissionButton permission={SYSTEM_PERMISSIONS.ORG_UPDATE} type="button" title="编辑"><Edit3 size={16} /></PermissionButton>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="task-item">
          <span>共 {data.total} 条，第 {data.page} 页</span>
          <span>
            <button type="button" onClick={() => void load(Math.max(1, data.page - 1))}>上一页</button>
            <button type="button" onClick={() => void load(data.page + 1)}>下一页</button>
          </span>
        </div>
      </Card>

      {showCreate ? (
        <section className="login-panel floating-panel">
          <h2 className="panel-title">新增组织</h2>
          <form className="form-stack" onSubmit={(event) => void createOrg(event).catch((error: Error) => setMessage(error.message))}>
            <div className="field"><label>编码</label><input name="orgCode" /></div>
            <div className="field"><label>名称</label><input name="orgName" /></div>
            <div className="field"><label>类型</label><input name="orgType" defaultValue="department" /></div>
            <div className="field"><label>状态</label><select name="status"><option value="enabled">启用</option><option value="disabled">停用</option></select></div>
            <button className="primary-button" type="submit">保存</button>
            <button type="button" onClick={() => setShowCreate(false)}>取消</button>
          </form>
        </section>
      ) : null}
      {message ? <p className="status-pill">{message}</p> : null}
    </main>
  );
}
