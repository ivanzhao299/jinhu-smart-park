"use client";

import { HR_PERMISSIONS } from "@jinhu/shared";
import { useCallback, useEffect, useState } from "react";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hrApi, type HrPosition } from "../../../lib/hr-api";
import { hasPermission } from "../../../lib/permissions";
import { fetchReferenceFormOptions, type ReferenceOrgOption } from "../../../lib/reference-data";
import styles from "../hr-workbench.module.css";

export function HrOrganizationClient() {
  const user = useAuthUser();
  const canManage = hasPermission(user, HR_PERMISSIONS.HR_POSITION_MANAGE);
  const [rows, setRows] = useState<HrPosition[]>([]);
  const [orgs, setOrgs] = useState<ReferenceOrgOption[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setMessage("");
      const token = getAccessToken();
      const [positions, references] = await Promise.all([
        hrApi.positions(token),
        canManage ? fetchReferenceFormOptions() : Promise.resolve({ orgs: [] })
      ]);
      setRows(positions);
      setOrgs(references.orgs);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载岗位失败");
    }
  }, [canManage]);

  useEffect(() => { void load(); }, [load]);

  const create = async (form: FormData) => {
    try {
      setBusy(true);
      setMessage("");
      await hrApi.createPosition({
        orgId: String(form.get("orgId")),
        positionCode: String(form.get("positionCode")),
        positionName: String(form.get("positionName")),
        jobFamily: String(form.get("jobFamily") ?? "") || undefined,
        jobLevel: String(form.get("jobLevel") ?? "") || undefined,
        headcountLimit: String(form.get("headcountLimit") ?? "") ? Number(form.get("headcountLimit")) : undefined,
        remark: String(form.get("remark") ?? "") || undefined
      }, getAccessToken());
      await load();
      setMessage("岗位已创建");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建岗位失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_ORGANIZATION_PAGE} fallback={<main className="content ds-page"><section className="ds-panel"><h1>无权访问组织与岗位</h1></section></main>}>
      <main className={`content ds-page ${styles.page}`}>
        <section className="ds-hero"><div className="ds-hero-copy"><span className="ds-eyebrow">人力资源管理</span><h1>组织与岗位</h1><p>复用系统组织树，在其上维护岗位、职族、职级与编制。</p></div></section>
        {canManage ? <form className={`ds-panel ${styles.formGrid}`} action={create}>
          <label className="form-field"><span>所属组织</span><select name="orgId" required><option value="">请选择组织</option>{orgs.map((org) => <option key={org.id} value={org.id}>{org.orgName}</option>)}</select></label>
          <label className="form-field"><span>岗位编码</span><input name="positionCode" maxLength={64} required /></label>
          <label className="form-field"><span>岗位名称</span><input name="positionName" maxLength={100} required /></label>
          <label className="form-field"><span>职族</span><input name="jobFamily" maxLength={100} /></label>
          <label className="form-field"><span>职级</span><input name="jobLevel" maxLength={64} /></label>
          <label className="form-field"><span>编制人数</span><input name="headcountLimit" type="number" min="0" max="100000" step="1" /></label>
          <label className="form-field"><span>备注</span><input name="remark" maxLength={500} /></label>
          <button className="ds-button ds-button-primary" disabled={busy}>新增岗位</button>
        </form> : null}
        {message ? <p className="form-error" role="alert">{message}</p> : null}
        <section className="ds-panel"><div className="ds-mobile-record-list">{rows.length ? rows.map((row) => <article className="ds-mobile-record" key={row.id}><strong>{row.positionName}</strong><span>{row.positionCode}</span><span>{row.jobFamily || "未设置职族"} · {row.jobLevel || "未设置职级"}</span><span>编制：{row.headcountLimit ?? "未限制"}</span></article>) : <p>暂无岗位，可由人力资源负责人创建。</p>}</div></section>
      </main>
    </PermissionGuard>
  );
}
