"use client";

import { Edit3, Eye, Plus, Search } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/permission-button";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";

interface RoleRow {
  id: string;
  code: string;
  name: string;
  status: string;
}

const emptyPage: PaginatedResult<RoleRow> = { items: [], page: 1, page_size: 20, total: 0 };

export default function RolesPage() {
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
    const response = await apiRequest<PaginatedResult<RoleRow>>(`/roles?${params.toString()}`, { token });
    setData(response.data);
  }

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, []);

  async function createRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    await apiRequest<RoleRow>("/roles", {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("role"),
      body: {
        code: String(form.get("code") ?? ""),
        name: String(form.get("name") ?? ""),
        status: String(form.get("status") ?? "enabled")
      }
    });
    setShowCreate(false);
    await load();
  }

  return (
    <main className="content">
      <header className="header">
        <div className="header-title"><strong>角色管理</strong><span>维护 RBAC 角色，并通过后端权限点独立鉴权</span></div>
        <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.ROLE_CREATE} type="button" onClick={() => setShowCreate(true)}><Plus size={16} />新增角色</PermissionButton>
      </header>
      <section className="work-panel">
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <div className="dashboard-grid">
            <div className="field"><label>关键词</label><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="角色名称" /></div>
            <div className="field"><label>状态</label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部</option><option value="enabled">启用</option><option value="disabled">停用</option></select></div>
          </div>
          <button className="primary-button" type="submit"><Search size={16} />查询</button>
        </form>
      </section>
      <section className="work-panel">
        <h2 className="panel-title">角色列表</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th>编码</th><th>名称</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id}><td>{item.code}</td><td>{item.name}</td><td><span className="status-pill">{item.status === "enabled" ? "启用" : "停用"}</span></td><td><PermissionButton permission={SYSTEM_PERMISSIONS.ROLE_DETAIL} type="button" title="详情"><Eye size={16} /></PermissionButton><PermissionButton permission={SYSTEM_PERMISSIONS.ROLE_UPDATE} type="button" title="编辑"><Edit3 size={16} /></PermissionButton></td></tr>
            ))}
          </tbody>
        </table>
        <div className="task-item"><span>共 {data.total} 条，第 {data.page} 页</span><span><button type="button" onClick={() => void load(Math.max(1, data.page - 1))}>上一页</button><button type="button" onClick={() => void load(data.page + 1)}>下一页</button></span></div>
      </section>
      {showCreate ? (
        <section className="login-panel" style={{ position: "fixed", right: 24, top: 24, zIndex: 10 }}>
          <h2 className="panel-title">新增角色</h2>
          <form className="form-stack" onSubmit={(event) => void createRole(event).catch((error: Error) => setMessage(error.message))}>
            <div className="field"><label>编码</label><input name="code" /></div>
            <div className="field"><label>名称</label><input name="name" /></div>
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
