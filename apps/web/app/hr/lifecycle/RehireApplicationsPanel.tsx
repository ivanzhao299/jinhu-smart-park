"use client";

import Link from "next/link";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hrApi, type HrOnboardingApplication, type HrRehireEmployeeOption, type HrRehireOptions, type HrRehireSaveRequest } from "../../../lib/hr-api";
import { hasAllPermissions, hasPermission } from "../../../lib/permissions";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "../hr-workbench.module.css";

const statusLabels: Record<string, string> = { draft: "草稿", submitted: "待复核", returned: "已退回", approved: "已批准", cancelled: "已取消", confirmed: "已确认回聘" };
const emptyOptions = (): HrRehireOptions => ({ items: [], total: 0, page: 1, page_size: 20, orgs: [], positions: [] });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const nameOf = (employee: HrRehireEmployeeOption) => `${employee.employeeName} · ${employee.employeeCode}`;

export function RehireApplicationsPanel({ employeeId }: { employeeId?: string }) {
  const user = useAuthUser();
  return <RehireApplicationsView key={`${JSON.stringify(user)}:${employeeId ?? "all"}`} employeeId={employeeId} />;
}

function RehireApplicationsView({ employeeId }: { employeeId?: string }) {
  const user = useAuthUser();
  const canRead = hasPermission(user, HR_PERMISSIONS.HR_ONBOARDING_READ);
  const employmentAuthority = hasAllPermissions(user, [HR_PERMISSIONS.HR_EMPLOYEE_MANAGE, HR_PERMISSIONS.HR_EMPLOYMENT_TRANSITION]);
  const canManage = employmentAuthority && hasPermission(user, HR_PERMISSIONS.HR_ONBOARDING_MANAGE);
  const canReview = hasPermission(user, HR_PERMISSIONS.HR_APPROVAL_PARK_REVIEW);
  const [rows, setRows] = useState<HrOnboardingApplication[]>([]), [page, setPage] = useState(1), [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [options, setOptions] = useState(emptyOptions), [managers, setManagers] = useState(emptyOptions);
  const [optionLoading, setOptionLoading] = useState(false), [managerLoading, setManagerLoading] = useState(false);
  const [employeeKeyword, setEmployeeKeyword] = useState(""), [managerKeyword, setManagerKeyword] = useState("");
  const [selected, setSelected] = useState<HrRehireEmployeeOption | null>(null), [editing, setEditing] = useState<HrOnboardingApplication | null>(null);
  const [orgId, setOrgId] = useState(""), [positionId, setPositionId] = useState(""), [managerId, setManagerId] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({});
  const listAbort = useRef<AbortController | null>(null), optionAbort = useRef<AbortController | null>(null), managerAbort = useRef<AbortController | null>(null);
  const busyRef = useRef(false), formRef = useRef<HTMLFormElement | null>(null);

  const load = useCallback(async (requestedPage = 1) => {
    if (!canRead) { setLoading(false); return; }
    const controller = new AbortController(); listAbort.current?.abort(); listAbort.current = controller;
    setLoading(true); setRows([]);
    try {
      const result = await hrApi.onboardingApplications(getAccessToken(), requestedPage, 20, undefined, controller.signal, { entryType: "rehire", employeeId });
      if (result.items.some(row => row.entryType !== "rehire" || (employeeId && row.employeeId !== employeeId))) throw new Error("回聘申请响应与当前员工范围不一致，请重新加载。");
      if (!controller.signal.aborted) { setRows(result.items); setTotal(result.total); setPage(requestedPage); }
    } catch (e) { if (!controller.signal.aborted) setError(hrLoadErrorMessage(e, "加载回聘申请失败")); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [canRead, employeeId]);

  const loadOptions = useCallback(async (requestedPage = 1, keyword = "", exactEmployeeId?: string) => {
    if (!canManage || !canRead) return;
    const controller = new AbortController(); optionAbort.current?.abort(); optionAbort.current = controller; setOptionLoading(true);
    try {
      const result = await hrApi.rehireOptions(getAccessToken(), requestedPage, "employee", keyword, controller.signal, exactEmployeeId);
      if (!controller.signal.aborted) {
        setOptions(result);
        if (exactEmployeeId) {
          const employee = result.items.find(item => item.id === exactEmployeeId);
          setSelected(employee ?? null);
          if (!employee) setError("该员工当前不是可回聘的离职人员，请核对档案状态。");
        }
      }
    } catch (e) { if (!controller.signal.aborted) setError(hrLoadErrorMessage(e, "加载可回聘员工失败")); }
    finally { if (!controller.signal.aborted) setOptionLoading(false); }
  }, [canManage, canRead]);

  const loadManagers = useCallback(async (requestedPage = 1, keyword = "") => {
    if (!canManage || !canRead) return;
    const controller = new AbortController(); managerAbort.current?.abort(); managerAbort.current = controller; setManagerLoading(true);
    try {
      const result = await hrApi.rehireOptions(getAccessToken(), requestedPage, "manager", keyword, controller.signal);
      if (!controller.signal.aborted) setManagers(result);
    } catch (e) { if (!controller.signal.aborted) setError(hrLoadErrorMessage(e, "加载直属上级候选失败")); }
    finally { if (!controller.signal.aborted) setManagerLoading(false); }
  }, [canManage, canRead]);

  useEffect(() => { void load(); void loadOptions(1, "", employeeId); void loadManagers(); return () => { listAbort.current?.abort(); optionAbort.current?.abort(); managerAbort.current?.abort(); }; }, [load, loadOptions, loadManagers, employeeId]);
  if (!canRead) return null;

  const begin = () => { if (busyRef.current) return false; busyRef.current = true; setBusy(true); setError(""); setNotice(""); return true; };
  const finish = () => { busyRef.current = false; setBusy(false); };
  const reset = () => { setEditing(null); setSelected(null); setOrgId(""); setPositionId(""); setManagerId(""); formRef.current?.reset(); };
  const chooseEmployee = (id: string) => {
    const employee = options.items.find(item => item.id === id) ?? null; setSelected(employee);
    const organization = employee?.orgId && options.orgs.some(org => org.id === employee.orgId) ? employee.orgId : "";
    setOrgId(organization); setPositionId(employee?.positionId && options.positions.some(position => position.id === employee.positionId && position.orgId === organization) ? employee.positionId : "");
    setManagerId("");
  };
  const edit = (row: HrOnboardingApplication) => {
    setEditing(row); setSelected(null); setOrgId(row.targetOrgId ?? ""); setPositionId(row.targetPositionId ?? ""); setManagerId(row.targetManagerEmployeeId ?? ""); setError("");
    void loadOptions(1, "", row.employeeId);
  };
  const save = async (form: FormData) => {
    if (!selected || !begin()) return;
    const body: HrRehireSaveRequest = { entryType: "rehire", employeeId: selected.id, expectedEmployeeVersion: selected.version, targetOrgId: orgId, targetPositionId: positionId, targetManagerEmployeeId: managerId || null,
      applicationName: String(form.get("applicationName")).trim(), applicationDate: String(form.get("applicationDate")), plannedHireDate: String(form.get("plannedHireDate")), probationMonths: Number(form.get("probationMonths")), attendanceCardNo: String(form.get("attendanceCardNo")).trim(), remark: String(form.get("remark")).trim() || undefined };
    try {
      if (editing) await hrApi.updateOnboardingApplication(editing.id, body, getAccessToken()); else await hrApi.createOnboardingApplication(body, getAccessToken());
      reset(); setNotice("回聘草稿已保存，提交并经独立复核后才能确认生效。"); await load(page);
    } catch (e) { setError(hrLoadErrorMessage(e, "保存回聘申请失败")); }
    finally { finish(); }
  };
  const act = async (row: HrOnboardingApplication, action: "submit" | "resubmit" | "cancel" | "approve" | "return" | "confirm") => {
    const comment = comments[row.id]?.trim() ?? "";
    if (action === "return" && !comment) { setError("退回回聘申请时，请填写复核意见。"); return; }
    if (!begin()) return;
    try {
      if (action === "approve" || action === "return") await hrApi.reviewOnboardingApplication(row.id, action, comment, getAccessToken());
      else if (action === "confirm") await hrApi.confirmOnboardingApplication(row.id, getAccessToken());
      else await hrApi.onboardingApplicationAction(row.id, action, getAccessToken());
      setNotice(action === "confirm" ? "回聘已生效，沿用原员工档案。请按正常流程办理本次合同及后续入职事项。" : "回聘申请已更新。"); await load(page);
    } catch (e) { setError(hrLoadErrorMessage(e, "办理回聘申请失败")); }
    finally { finish(); }
  };

  return <section id="employee-rehire" className="ds-panel" aria-labelledby="rehire-heading">
    <div className={styles.sectionHeading}><div><span className="ds-eyebrow">人员回聘</span><h2 id="rehire-heading">离职员工回聘</h2></div><button type="button" className="ds-button" disabled={loading || busy} onClick={() => { setError(""); void load(page); }}>刷新回聘申请</button></div>
    <p className="muted-text">沿用员工原档案和任职历史，按本次部门、岗位和入职日期重新办理。</p>
    {employeeId ? <p className="muted-text">已按当前员工筛选。<Link className="ds-button" href="/hr/lifecycle#employee-rehire">查看全部回聘申请</Link></p> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
    {canManage ? <form ref={formRef} key={editing?.id ?? "new"} aria-label={editing ? "修改回聘申请" : "新建回聘申请"} onSubmit={event => { event.preventDefault(); void save(new FormData(event.currentTarget)); }}>
      <fieldset disabled={busy} className={`${styles.formGrid} ${styles.rehireForm}`}>
        <legend>{editing ? "修改回聘草稿 · 保存时重新核对当前档案" : "新建回聘申请"}</legend>
        <label className="form-field"><span>搜索离职员工</span><input value={employeeKeyword} maxLength={100} onChange={event => setEmployeeKeyword(event.target.value)} placeholder="姓名或员工编号" /></label>
        <div className={`${styles.actionRow} ${styles.fullWidth}`}><button type="button" className="ds-button" disabled={optionLoading || Boolean(editing)} onClick={() => void loadOptions(1, employeeKeyword)}>搜索员工</button><button type="button" className="ds-button" disabled={optionLoading || Boolean(editing) || options.page <= 1} onClick={() => void loadOptions(options.page - 1, employeeKeyword)}>员工上一页</button><button type="button" className="ds-button" disabled={optionLoading || Boolean(editing) || options.page * options.page_size >= options.total} onClick={() => void loadOptions(options.page + 1, employeeKeyword)}>员工下一页</button><span>第 {options.page} 页 · 共 {options.total} 人</span></div>
        <label className="form-field"><span>回聘员工</span><select required value={selected?.id ?? ""} disabled={optionLoading || Boolean(editing)} onChange={event => chooseEmployee(event.target.value)}><option value="">请选择离职员工</option>{selected && !options.items.some(item => item.id === selected.id) ? <option value={selected.id}>{nameOf(selected)}</option> : null}{options.items.map(item => <option key={item.id} value={item.id}>{nameOf(item)}</option>)}</select></label>
        {selected ? <p className={`muted-text ${styles.fullWidth}`}>{nameOf(selected)} · 原入职日期 {selected.hireDate ?? "未登记"} · 原离职日期 {selected.departureDate ?? "未登记"}</p> : null}
        <label className="form-field"><span>申请名称</span><input name="applicationName" required maxLength={64} defaultValue={editing?.applicationName ?? "员工回聘申请"} /></label>
        <label className="form-field"><span>本次部门</span><select required value={orgId} onChange={event => { setOrgId(event.target.value); setPositionId(""); }}><option value="">请选择部门</option>{orgId && !options.orgs.some(item => item.id === orgId) ? <option value={orgId} disabled>原选择已不可用，请重新选择</option> : null}{options.orgs.map(item => <option key={item.id} value={item.id}>{item.orgName}</option>)}</select></label>
        <label className="form-field"><span>本次岗位</span><select required value={positionId} onChange={event => setPositionId(event.target.value)}><option value="">请选择该部门岗位</option>{positionId && !options.positions.some(item => item.id === positionId && item.orgId === orgId) ? <option value={positionId} disabled>原选择已不可用，请重新选择</option> : null}{options.positions.filter(item => item.orgId === orgId).map(item => <option key={item.id} value={item.id}>{item.positionName}</option>)}</select></label>
        <label className="form-field"><span>搜索直属上级</span><input value={managerKeyword} maxLength={100} onChange={event => setManagerKeyword(event.target.value)} placeholder="上级姓名或员工编号" /></label>
        <div className={`${styles.actionRow} ${styles.fullWidth}`}><button type="button" className="ds-button" disabled={managerLoading} onClick={() => void loadManagers(1, managerKeyword)}>搜索上级</button><button type="button" className="ds-button" disabled={managerLoading || managers.page <= 1} onClick={() => void loadManagers(managers.page - 1, managerKeyword)}>上级上一页</button><button type="button" className="ds-button" disabled={managerLoading || managers.page * managers.page_size >= managers.total} onClick={() => void loadManagers(managers.page + 1, managerKeyword)}>上级下一页</button><span>第 {managers.page} 页 · 共 {managers.total} 人</span></div>
        <label className="form-field"><span>本次直属上级</span><select value={managerId} disabled={managerLoading} onChange={event => setManagerId(event.target.value)}><option value="">暂不指定直属上级</option>{managerId && !managers.items.some(item => item.id === managerId) ? <option value={managerId}>{editing?.targetManagerName ?? "已选择上级，请核对"}</option> : null}{managers.items.filter(item => item.id !== selected?.id).map(item => <option key={item.id} value={item.id}>{nameOf(item)}</option>)}</select></label>
        <label className="form-field"><span>申请日期</span><input name="applicationDate" type="date" required defaultValue={editing?.applicationDate ?? today()} /></label>
        <label className="form-field"><span>本次入职日期</span><input name="plannedHireDate" type="date" required defaultValue={editing?.plannedHireDate ?? today()} /></label>
        <label className="form-field"><span>试用期限（月）</span><input name="probationMonths" type="number" min={0} max={12} step={1} required defaultValue={editing?.probationMonths ?? 0} onFocus={event => event.currentTarget.select()} /></label>
        <label className="form-field"><span>本次考勤卡号</span><input name="attendanceCardNo" inputMode="numeric" pattern="[0-9]{1,20}" maxLength={20} required defaultValue={editing?.attendanceCardNo ?? ""} /></label>
        <label className={`form-field ${styles.fullWidth}`}><span>回聘说明</span><textarea name="remark" maxLength={250} defaultValue={editing?.remark ?? ""} /></label>
        <div className={`${styles.actionRow} ${styles.fullWidth}`}><button className="ds-button ds-button-primary" disabled={!selected || optionLoading || managerLoading}>{editing ? "保存回聘修改" : "保存回聘草稿"}</button>{editing ? <button type="button" className="ds-button" onClick={reset}>退出修改</button> : null}</div>
      </fieldset>
    </form> : null}
    <div className={`ds-scene-grid ${styles.rehireRecords}`}>{rows.map(row => <article key={row.id} className={`ds-scene-card ${styles.rehireRecord}`} aria-label={`${row.employeeName ?? "员工"}回聘申请`}>
      <h3>{row.employeeName ?? "员工"} · {statusLabels[row.status] ?? row.status}</h3>
      <p>{row.applicationName} · {row.applicationNo}</p><p>申请 {row.applicationDate} · 本次入职 {row.plannedHireDate} · 试用 {row.probationMonths} 个月</p>
      <p>部门 {row.targetOrgName ?? "待核对"} · 岗位 {row.targetPositionName ?? "待核对"} · 上级 {row.targetManagerName ?? (row.targetManagerEmployeeId ? "待核对" : "暂不指定")}</p>
      <p>原入职 {row.previousEmployment?.hire_date ?? "未登记"} · 原离职 {row.previousEmployment?.departure_date ?? "未登记"}</p>
      {row.reviewComment ? <p>复核意见：{row.reviewComment}</p> : null}
      {canReview && row.status === "submitted" && row.applicantUserId !== user?.id ? <label className="form-field"><span>复核意见（退回时必填）</span><textarea maxLength={1000} disabled={busy} value={comments[row.id] ?? ""} onChange={event => setComments(current => ({ ...current, [row.id]: event.target.value }))} /></label> : null}
      {canReview && row.status === "submitted" && row.applicantUserId === user?.id ? <p className="muted-text">本人提交的申请须由其他有权限人员复核。</p> : null}
      <div className={styles.actionRow}>
        {canManage && ["draft", "returned"].includes(row.status) ? <button type="button" className="ds-button" disabled={busy} onClick={() => edit(row)}>修改回聘申请</button> : null}
        {canManage && row.status === "draft" ? <button type="button" className="ds-button ds-button-primary" disabled={busy} onClick={() => void act(row, "submit")}>提交回聘审批</button> : null}
        {canManage && row.status === "returned" ? <button type="button" className="ds-button ds-button-primary" disabled={busy} onClick={() => void act(row, "resubmit")}>重新提交回聘</button> : null}
        {canManage && ["draft", "submitted", "returned", "approved"].includes(row.status) ? <button type="button" className="ds-button" disabled={busy} onClick={() => void act(row, "cancel")}>取消回聘申请</button> : null}
        {canReview && row.status === "submitted" && row.applicantUserId !== user?.id ? <><button type="button" className="ds-button ds-button-primary" disabled={busy} onClick={() => void act(row, "approve")}>批准回聘</button><button type="button" className="ds-button" disabled={busy} onClick={() => void act(row, "return")}>退回回聘</button></> : null}
        {employmentAuthority && row.status === "approved" ? <button type="button" className="ds-button ds-button-primary" disabled={busy || row.plannedHireDate > today()} onClick={() => void act(row, "confirm")}>确认回聘生效</button> : null}
      </div>
    </article>)}</div>
    {!rows.length ? <p>{loading ? "正在加载回聘申请…" : "暂无回聘申请。"}</p> : null}
    <nav aria-label="回聘申请分页" className={`${styles.actionRow} ${styles.rehirePagination}`}><button type="button" className="ds-button" disabled={busy || loading || page <= 1} onClick={() => void load(page - 1)}>回聘上一页</button><span role="status">第 {page} / {Math.max(1, Math.ceil(total / 20))} 页 · 共 {total} 条</span><button type="button" className="ds-button" disabled={busy || loading || page * 20 >= total} onClick={() => void load(page + 1)}>回聘下一页</button></nav>
  </section>;
}
