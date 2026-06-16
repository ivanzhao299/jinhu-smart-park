"use client";
import { Card } from "@jinhu/ui";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { PaginatedResult } from "@jinhu/shared";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { apiRequest } from "../../../../lib/api-client";
import { getAccessToken, getAuthUser, hasPermission } from "../../../../lib/authz";

interface LoginLogRow {
  id: string;
  username: string;
  loginIp: string | null;
  loginUa: string | null;
  loginMethod: string | null;
  result: string | null;
  failReason: string | null;
  requestId: string | null;
  loginTime: string | null;
  createTime: string;
}

const emptyPage: PaginatedResult<LoginLogRow> = { items: [], page: 1, page_size: 20, total: 0 };

export default function LoginLogsPage() {
  const authUser = getAuthUser();
  const [data, setData] = useState(emptyPage);
  const [filters, setFilters] = useState({ username: "", result: "" });
  const [message, setMessage] = useState("");

  async function load(page = 1) {
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (filters.username) params.set("username", filters.username);
    if (filters.result) params.set("result", filters.result);
    const response = await apiRequest<PaginatedResult<LoginLogRow>>(`/audit/login-logs?${params.toString()}`, {
      token: getAccessToken()
    });
    setData(response.data);
  }

  useEffect(() => {
    if (hasPermission(authUser, SYSTEM_PERMISSIONS.AUDIT_READ)) {
      void load().catch((error: Error) => setMessage(error.message));
    }
  }, []);

  if (!hasPermission(authUser, SYSTEM_PERMISSIONS.AUDIT_READ)) {
    return (
      <main className="content">
        <Card >
          <span className="status-pill">无 audit:read 权限</span>
        </Card>
      </main>
    );
  }

  return (
    <main className="content">
      <header className="header">
        <div className="header-title">
          <strong>登录日志</strong>
          <span>记录登录成功、登录失败和登录来源信息</span>
        </div>
      </header>
      <Card >
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <div className="dashboard-grid">
            <div className="field"><label>用户名</label><input value={filters.username} onChange={(event) => setFilters({ ...filters, username: event.target.value })} /></div>
            <div className="field"><label>结果</label><select value={filters.result} onChange={(event) => setFilters({ ...filters, result: event.target.value })}><option value="">全部</option><option value="success">成功</option><option value="fail">失败</option></select></div>
          </div>
          <button className="primary-button" type="submit"><Search size={16} />查询</button>
        </form>
      </Card>
      <Card >
        <h2 className="panel-title">登录日志列表</h2>
        <div className="native-table-wrap">
          <table className="native-table ds-data-table">
            <thead><tr><th>用户</th><th>IP</th><th>登录方式</th><th>结果</th><th>失败原因</th><th>请求 ID</th><th>时间</th></tr></thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td data-label="用户">{item.username}</td>
                  <td data-label="IP">{item.loginIp ?? "-"}</td>
                  <td data-label="登录方式">{item.loginMethod ?? "-"}</td>
                  <td data-label="结果"><span className="status-pill">{item.result === "fail" ? "失败" : "成功"}</span></td>
                  <td data-label="失败原因">{item.failReason ?? "-"}</td>
                  <td data-label="请求 ID">{item.requestId ?? "-"}</td>
                  <td data-label="时间">{item.loginTime ?? item.createTime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="task-item"><span>共 {data.total} 条，第 {data.page} 页</span><span><button type="button" onClick={() => void load(Math.max(1, data.page - 1))}>上一页</button><button type="button" onClick={() => void load(data.page + 1)}>下一页</button></span></div>
      </Card>
      {message ? <p className="status-pill">{message}</p> : null}
    </main>
  );
}
