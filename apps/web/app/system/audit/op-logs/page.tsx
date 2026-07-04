"use client";
import { Card } from "@jinhu/ui";

import { Eye, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../../components/permission-button";
import { apiRequest } from "../../../../lib/api-client";
import { getAccessToken, getAuthUser, hasPermission } from "../../../../lib/authz";

interface OpLogRow {
  id: string;
  username: string | null;
  realName: string | null;
  module: string;
  resource: string | null;
  action: string;
  bizType: string | null;
  bizId: string | null;
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
  clientIp: string | null;
  result: string | null;
  errorMsg: string | null;
  requestId: string | null;
  opTime: string | null;
  createTime: string;
}

const emptyPage: PaginatedResult<OpLogRow> = { items: [], page: 1, page_size: 20, total: 0 };

export default function OpLogsPage() {
  const authUser = getAuthUser();
  const [data, setData] = useState(emptyPage);
  const [detail, setDetail] = useState<OpLogRow | null>(null);
  const [filters, setFilters] = useState({ module: "", action: "", username: "", bizType: "", result: "" });
  const [message, setMessage] = useState("");

  async function load(page = 1) {
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (filters.module) params.set("module", filters.module);
    if (filters.action) params.set("action", filters.action);
    if (filters.username) params.set("username", filters.username);
    if (filters.bizType) params.set("biz_type", filters.bizType);
    if (filters.result) params.set("result", filters.result);
    const response = await apiRequest<PaginatedResult<OpLogRow>>(`/audit/op-logs?${params.toString()}`, {
      token: getAccessToken()
    });
    setData(response.data);
  }

  async function openDetail(row: OpLogRow) {
    setDetail(row);
    try {
      const response = await apiRequest<OpLogRow>(`/audit/op-logs/${row.id}`, { token: getAccessToken() });
      setDetail((current) => (current?.id === row.id ? response.data : current));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载日志详情失败");
    }
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
          <strong>操作审计</strong>
          <span>追踪新增、修改、删除、权限变更、附件下载和导出等关键操作</span>
        </div>
      </header>
      <Card >
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <div className="dashboard-grid">
            <div className="field"><label>模块</label><input value={filters.module} onChange={(event) => setFilters({ ...filters, module: event.target.value })} /></div>
            <div className="field"><label>动作</label><input value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })} /></div>
            <div className="field"><label>用户</label><input value={filters.username} onChange={(event) => setFilters({ ...filters, username: event.target.value })} /></div>
            <div className="field"><label>业务类型</label><input value={filters.bizType} onChange={(event) => setFilters({ ...filters, bizType: event.target.value })} /></div>
            <div className="field"><label>结果</label><select value={filters.result} onChange={(event) => setFilters({ ...filters, result: event.target.value })}><option value="">全部</option><option value="success">成功</option><option value="fail">失败</option></select></div>
          </div>
          <button className="primary-button" type="submit"><Search size={16} />查询</button>
        </form>
      </Card>
      <Card >
        <h2 className="panel-title">操作日志列表</h2>
        <div className="native-table-wrap">
          <table className="native-table ds-data-table">
            <thead><tr><th>模块</th><th>动作</th><th>用户</th><th>业务</th><th>IP</th><th>结果</th><th>时间</th><th>操作</th></tr></thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td data-label="模块">{item.module}</td>
                  <td data-label="动作">{item.action}</td>
                  <td data-label="用户">{item.realName ?? item.username ?? "-"}</td>
                  <td data-label="业务">{item.bizType ?? "-"} / {item.bizId ?? "-"}</td>
                  <td data-label="IP">{item.clientIp ?? "-"}</td>
                  <td data-label="结果"><span className="status-pill">{item.result === "fail" ? "失败" : "成功"}</span></td>
                  <td data-label="时间">{item.opTime ?? item.createTime}</td>
                  <td data-label="操作">
                    <span className="data-table-actions">
                      <PermissionButton permission={SYSTEM_PERMISSIONS.AUDIT_READ} type="button" title="详情" onClick={() => void openDetail(item).catch((error: Error) => setMessage(error.message))}><Eye size={16} /></PermissionButton>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="task-item"><span>共 {data.total} 条，第 {data.page} 页</span><span><button className="pagination-button" type="button" onClick={() => void load(Math.max(1, data.page - 1))}>上一页</button><button className="pagination-button" type="button" onClick={() => void load(data.page + 1)}>下一页</button></span></div>
      </Card>
      {detail ? (
        <section className="login-panel floating-panel floating-panel-wide">
          <div className="task-item"><h2 className="panel-title">操作日志详情</h2><button className="secondary-button" type="button" onClick={() => setDetail(null)}>关闭</button></div>
          <p>请求 ID：{detail.requestId ?? "-"}</p>
          <p>资源：{detail.resource ?? "-"}</p>
          <p>错误：{detail.errorMsg ?? "-"}</p>
          <h3>before_json</h3>
          <pre>{JSON.stringify(detail.beforeJson, null, 2)}</pre>
          <h3>after_json</h3>
          <pre>{JSON.stringify(detail.afterJson, null, 2)}</pre>
        </section>
      ) : null}
      {message ? <p className="status-pill">{message}</p> : null}
    </main>
  );
}
