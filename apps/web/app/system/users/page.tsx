"use client";

import { Edit3, Eye, Plus, Search } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/permission-button";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";

interface UserRow {
  id: string;
  username: string;
  displayName: string;
  mobile: string | null;
  email: string | null;
  status: string;
}

const emptyPage: PaginatedResult<UserRow> = { items: [], page: 1, page_size: 20, total: 0 };

export default function UsersPage() {
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
    const response = await apiRequest<PaginatedResult<UserRow>>(`/users?${params.toString()}`, { token });
    setData(response.data);
  }

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, []);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    await apiRequest<UserRow>("/users", {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("user"),
      body: {
        username: String(form.get("username") ?? ""),
        displayName: String(form.get("displayName") ?? ""),
        password: String(form.get("password") ?? ""),
        mobile: String(form.get("mobile") ?? ""),
        email: String(form.get("email") ?? ""),
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
          <strong>用户管理</strong>
          <span>创建用户、启停账号、分配角色，密码后端 bcrypt 存储</span>
        </div>
        <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.USER_CREATE} type="button" onClick={() => setShowCreate(true)}>
          <Plus size={16} />
          新增用户
        </PermissionButton>
      </header>

      <section className="work-panel">
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <div className="dashboard-grid">
            <div className="field">
              <label htmlFor="keyword">关键词</label>
              <input id="keyword" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="账号 / 姓名" />
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
          <button className="primary-button" type="submit"><Search size={16} />查询</button>
        </form>
      </section>

      <section className="work-panel">
        <h2 className="panel-title">用户列表</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th>账号</th><th>姓名</th><th>手机</th><th>邮箱</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id}>
                <td>{item.username}</td>
                <td>{item.displayName}</td>
                <td>{item.mobile ?? "-"}</td>
                <td>{item.email ?? "-"}</td>
                <td><span className="status-pill">{item.status === "enabled" ? "启用" : "停用"}</span></td>
                <td><PermissionButton permission={SYSTEM_PERMISSIONS.USER_DETAIL} type="button" title="详情"><Eye size={16} /></PermissionButton><PermissionButton permission={SYSTEM_PERMISSIONS.USER_UPDATE} type="button" title="编辑"><Edit3 size={16} /></PermissionButton></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="task-item">
          <span>共 {data.total} 条，第 {data.page} 页</span>
          <span><button type="button" onClick={() => void load(Math.max(1, data.page - 1))}>上一页</button><button type="button" onClick={() => void load(data.page + 1)}>下一页</button></span>
        </div>
      </section>

      {showCreate ? (
        <section className="login-panel" style={{ position: "fixed", right: 24, top: 24, zIndex: 10 }}>
          <h2 className="panel-title">新增用户</h2>
          <form className="form-stack" onSubmit={(event) => void createUser(event).catch((error: Error) => setMessage(error.message))}>
            <div className="field"><label>账号</label><input name="username" /></div>
            <div className="field"><label>姓名</label><input name="displayName" /></div>
            <div className="field"><label>初始密码</label><input name="password" type="password" /></div>
            <div className="field"><label>手机</label><input name="mobile" /></div>
            <div className="field"><label>邮箱</label><input name="email" /></div>
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
