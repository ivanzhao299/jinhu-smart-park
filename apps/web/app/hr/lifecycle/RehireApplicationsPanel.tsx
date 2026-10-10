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
  const [draft,setDraft]=useState({applicationName:"员工回聘申请",applicationDate:today(),plannedHireDate:today(),probationMonths:"0",attendanceCardNo:"",remark:""});
  const receipts=useRef<Record<string,{row:HrOnboardingApplication;page:number}>>({});
  const currentPage=useRef(1);
  const [readConflict,setReadConflict]=useState(false);
  const listAbort = useRef<AbortController | null>(null), optionAbort = useRef<AbortController | null>(null), managerAbort = useRef<AbortController | null>(null);
  const busyRef = useRef(false), formRef = useRef<HTMLFormElement | null>(null);
  const alive=useRef(true),pending=useRef<null|{retry:()=>Promise<HrOnboardingApplication>;key:string;validate:(receipt:HrOnboardingApplication)=>HrOnboardingApplication;success:()=>void;message:string}>(null);
  const [pendingState,setPendingState]=useState(false);
  const setPending=(operation:typeof pending.current)=>{pending.current=operation;setPendingState(Boolean(operation));};

  const load = useCallback(async (requestedPage = 1) => {
    if (!alive.current || !canRead) return;
    const controller = new AbortController(); listAbort.current?.abort(); listAbort.current = controller;
    setLoading(true);
    if (currentPage.current !== requestedPage) setRows([]);
    try {
      const result = await hrApi.onboardingApplications(getAccessToken(), requestedPage, 20, undefined, controller.signal, { entryType: "rehire", employeeId });
      if (controller.signal.aborted || !alive.current) return;
      if (result.items.some(row => row.entryType !== "rehire" || (employeeId && row.employeeId !== employeeId) || !Number.isInteger(row.version) || Number(row.version)<1)) {
        setReadConflict(true); throw new Error("回聘申请响应与当前员工范围或办理凭据不一致，请重新加载。");
      }
      const comparable: (keyof HrOnboardingApplication)[]=["employeeId","entryType","status","applicationName","applicationDate","plannedHireDate","probationMonths","attendanceCardNo","expectedEmployeeVersion","targetOrgId","targetPositionId","targetManagerEmployeeId","reviewComment","reviewedAt","confirmedAt","remark"];
      const next=result.items.map(item=>{
        const known=receipts.current[item.id]?.row;
        if(!known)return item;
        if(Number(item.version)<Number(known.version))return known;
        if(item.version===known.version&&comparable.some(key=>(item[key]??null)!==(known[key]??null))){setReadConflict(true);throw new Error("回聘申请同版本内容不一致，请刷新后核对，勿继续办理。");}
        return item;
      });
      for(const {row,page:receiptPage} of Object.values(receipts.current))if(receiptPage===requestedPage&&!next.some(item=>item.id===row.id))next.unshift(row);
      for(const item of next)if(receipts.current[item.id])receipts.current[item.id]={row:item,page:requestedPage};
      setRows(next);setTotal(Math.max(result.total,next.length));setPage(requestedPage);currentPage.current=requestedPage;setReadConflict(false);
    } catch (e) { if (!controller.signal.aborted && alive.current) setError(hrLoadErrorMessage(e, "加载回聘申请失败")); }
    finally { if (!controller.signal.aborted && alive.current) setLoading(false); }
  }, [canRead, employeeId]);

  const loadOptions = useCallback(async (requestedPage = 1, keyword = "", exactEmployeeId?: string) => {
    if (!alive.current || !canManage || !canRead) return;
    const controller = new AbortController(); optionAbort.current?.abort(); optionAbort.current = controller; setOptionLoading(true);
    try {
      const result = await hrApi.rehireOptions(getAccessToken(), requestedPage, "employee", keyword, controller.signal, exactEmployeeId);
      if (!controller.signal.aborted && alive.current) {
        setOptions(result);
        if (exactEmployeeId) {
          const employee = result.items.find(item => item.id === exactEmployeeId);
          setSelected(employee ?? null);
          if (!employee) setError("该员工当前不是可回聘的离职人员，请核对档案状态。");
        }
      }
    } catch (e) { if (!controller.signal.aborted && alive.current) setError(hrLoadErrorMessage(e, "加载可回聘员工失败")); }
    finally { if (!controller.signal.aborted && alive.current) setOptionLoading(false); }
  }, [canManage, canRead]);

  const loadManagers = useCallback(async (requestedPage = 1, keyword = "") => {
    if (!alive.current || !canManage || !canRead) return;
    const controller = new AbortController(); managerAbort.current?.abort(); managerAbort.current = controller; setManagerLoading(true);
    try {
      const result = await hrApi.rehireOptions(getAccessToken(), requestedPage, "manager", keyword, controller.signal);
      if (!controller.signal.aborted && alive.current) setManagers(result);
    } catch (e) { if (!controller.signal.aborted && alive.current) setError(hrLoadErrorMessage(e, "加载直属上级候选失败")); }
    finally { if (!controller.signal.aborted && alive.current) setManagerLoading(false); }
  }, [canManage, canRead]);

  useEffect(() => { alive.current=true;void load(); void loadOptions(1, "", employeeId); void loadManagers(); return () => { alive.current=false; listAbort.current?.abort(); optionAbort.current?.abort(); managerAbort.current?.abort(); }; }, [load, loadOptions, loadManagers, employeeId]);
  if (!canRead) return null;

  const begin = (retry=false) => { if (busyRef.current||(!retry&&(pending.current||readConflict))) return false; busyRef.current = true; setBusy(true); setError(""); setNotice(""); return true; };
  const finish = () => { busyRef.current = false; setBusy(false); };
  const idempotencyPending=(error:unknown)=>{const detail=error as {status?:unknown;message?:unknown};const status=typeof detail.status==="number"?detail.status:undefined;const message=String(detail.message??"");return status===undefined||status>=500||(status===409&&(message==="The same idempotency key is still processing"||message==="Idempotency reservation changed; retry request"));};
  const accept=(receipt:HrOnboardingApplication,expected:{id?:string;employeeId:string;status:string;minimumVersion?:number;confirm?:boolean;body?:HrRehireSaveRequest;original?:HrOnboardingApplication;subject?:HrRehireEmployeeOption})=>{
    if(!receipt || !receipt.id || receipt.entryType!=="rehire"||receipt.employeeId!==expected.employeeId||receipt.status!==expected.status||!Number.isInteger(receipt.version)||Number(receipt.version)<1||(expected.id&&receipt.id!==expected.id)||(expected.minimumVersion!==undefined&&Number(receipt.version)<=expected.minimumVersion)||(expected.confirm&&!receipt.confirmedAt))throw new Error("回聘办理回执不完整，请核对后重试原请求。");
    if(expected.body){
      const fields: (keyof HrRehireSaveRequest)[]=["entryType","employeeId","expectedEmployeeVersion","applicationName","applicationDate","plannedHireDate","probationMonths","attendanceCardNo","targetOrgId","targetPositionId","targetManagerEmployeeId","remark"];
      if(fields.some(key=>(receipt[key as keyof HrOnboardingApplication]??null)!==(expected.body?.[key]??null)))throw new Error("回聘保存回执与本次填写内容不一致，请核对后重试原请求。");
    }
    const original=expected.original;
    return {...original,...receipt,
      employeeName:receipt.employeeName??original?.employeeName??expected.subject?.employeeName,
      employeeCode:receipt.employeeCode??original?.employeeCode??expected.subject?.employeeCode,
      applicantUserId:receipt.applicantUserId??original?.applicantUserId??user?.id,
      targetOrgName:receipt.targetOrgName??options.orgs.find(item=>item.id===receipt.targetOrgId)?.orgName??(original?.targetOrgId===receipt.targetOrgId?original?.targetOrgName:null),
      targetPositionName:receipt.targetPositionName??options.positions.find(item=>item.id===receipt.targetPositionId)?.positionName??(original?.targetPositionId===receipt.targetPositionId?original?.targetPositionName:null),
      targetManagerName:receipt.targetManagerName??managers.items.find(item=>item.id===receipt.targetManagerEmployeeId)?.employeeName??(original?.targetManagerEmployeeId===receipt.targetManagerEmployeeId?original?.targetManagerName:null),
    };
  };
  const reset = () => { setEditing(null); setSelected(null); setOrgId(""); setPositionId(""); setManagerId(""); setDraft({applicationName:"员工回聘申请",applicationDate:today(),plannedHireDate:today(),probationMonths:"0",attendanceCardNo:"",remark:""}); };
  const execute=async(operation:NonNullable<typeof pending.current>)=>{
    try{
      const raw=await operation.retry();if(!alive.current)return;
      const receipt=operation.validate(raw);
      receipts.current[receipt.id]={row:receipt,page:currentPage.current};
      setRows(current=>current.some(row=>row.id===receipt.id)?current.map(row=>row.id===receipt.id?receipt:row):[receipt,...current]);
      setPending(null);operation.success();setNotice(operation.message);void load(currentPage.current);
    }catch(e){if(!alive.current)return;if(!idempotencyPending(e))setPending(null);setError(hrLoadErrorMessage(e,"办理回聘申请失败"));}
    finally{if(alive.current)finish();}
  };
  const retryPending=async()=>{const operation=pending.current;if(!operation||!begin(true))return;await execute(operation);};
  const chooseEmployee = (id: string) => {
    const employee = options.items.find(item => item.id === id) ?? null; setSelected(employee);
    const organization = employee?.orgId && options.orgs.some(org => org.id === employee.orgId) ? employee.orgId : "";
    setOrgId(organization); setPositionId(employee?.positionId && options.positions.some(position => position.id === employee.positionId && position.orgId === organization) ? employee.positionId : "");
    setManagerId("");
  };
  const edit = (row: HrOnboardingApplication) => {
    setEditing(row); setSelected(null); setOrgId(row.targetOrgId ?? ""); setPositionId(row.targetPositionId ?? ""); setManagerId(row.targetManagerEmployeeId ?? ""); setDraft({applicationName:row.applicationName,applicationDate:row.applicationDate,plannedHireDate:row.plannedHireDate,probationMonths:String(row.probationMonths),attendanceCardNo:row.attendanceCardNo,remark:row.remark??""}); setError("");
    void loadOptions(1, "", row.employeeId);
  };
  const save = async () => {
    if (!selected || !Number.isInteger(selected.version) || selected.version<1 || !begin()) return;
    const body: HrRehireSaveRequest = { entryType: "rehire", employeeId: selected.id, expectedEmployeeVersion: selected.version, targetOrgId: orgId, targetPositionId: positionId, targetManagerEmployeeId: managerId || null,
      applicationName:draft.applicationName.trim(), applicationDate:draft.applicationDate, plannedHireDate:draft.plannedHireDate, probationMonths:Number(draft.probationMonths), attendanceCardNo:draft.attendanceCardNo.trim(), remark:draft.remark.trim() || undefined };
    const original=editing, subject=selected;
    const token=getAccessToken(),key=crypto.randomUUID();
    const operation={key,retry:()=>original?hrApi.updateOnboardingApplication(original.id,body,token,key):hrApi.createOnboardingApplication(body,token,key),validate:(receipt:HrOnboardingApplication)=>accept(receipt,{id:original?.id,employeeId:body.employeeId,status:"draft",minimumVersion:original?.version,body,original:original??undefined,subject}),success:reset,message:"回聘草稿已保存，提交并经独立复核后才能确认生效。"};
    setPending(operation);await execute(operation);
  };

  const act = async (row: HrOnboardingApplication, action: "submit" | "resubmit" | "cancel" | "approve" | "return" | "confirm") => {
    const comment = comments[row.id]?.trim() ?? "";
    if (action === "return" && !comment) { setError("退回回聘申请时，请填写复核意见。"); return; }
    if (!begin()) return;
    if(!Number.isInteger(row.version)||Number(row.version)<1){finish();setError("当前回聘申请办理凭据不完整，请刷新后再办理。");return;}
    const token=getAccessToken(),key=crypto.randomUUID(),target=action==="approve"?"approved":action==="return"?"returned":action==="confirm"?"confirmed":action==="cancel"?"cancelled":"submitted";
    const operation={key,retry:()=>action === "approve" || action === "return"?hrApi.reviewOnboardingApplication(row.id, action, comment, token,key):action === "confirm"?hrApi.confirmOnboardingApplication(row.id,token,key):hrApi.onboardingApplicationAction(row.id, action, token,key),validate:(receipt:HrOnboardingApplication)=>accept(receipt,{id:row.id,employeeId:row.employeeId,status:target,minimumVersion:row.version,confirm:action==="confirm",original:row}),success:()=>{},message:action === "confirm" ? "回聘已生效，沿用原员工档案。请按正常流程办理本次合同及后续入职事项。" : "回聘申请已更新。"};
    setPending(operation);await execute(operation);
  };
  const locked=busy||pendingState||readConflict;


  return <section id="employee-rehire" className="ds-panel" aria-labelledby="rehire-heading">
    <div className={styles.sectionHeading}><div><span className="ds-eyebrow">人员回聘</span><h2 id="rehire-heading">离职员工回聘</h2></div><button type="button" className="ds-button" disabled={loading || busy || pendingState} onClick={() => { setError(""); void load(page); }}>刷新回聘申请</button></div>
    <p className="muted-text">沿用员工原档案和任职历史，按本次部门、岗位和入职日期重新办理。</p>
    {employeeId ? <p className="muted-text">已按当前员工筛选。<Link className="ds-button" href="/hr/lifecycle#employee-rehire">查看全部回聘申请</Link></p> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}{pendingState?<button type="button" className="ds-button ds-button-secondary" disabled={busy} onClick={()=>void retryPending()}>重试原回聘请求</button>:null}{notice ? <p role="status">{notice}</p> : null}
    {pendingState?<p role="status">正在等待原回聘请求结果；请勿发起其他办理操作。</p>:null}
    {canManage ? <form ref={formRef} key={editing?.id ?? "new"} aria-label={editing ? "修改回聘申请" : "新建回聘申请"} onSubmit={event => { event.preventDefault(); void save(); }}>
      <fieldset disabled={locked} className={`${styles.formGrid} ${styles.rehireForm}`}>
        <legend>{editing ? "修改回聘草稿 · 保存时重新核对当前档案" : "新建回聘申请"}</legend>
        <label className="form-field"><span>搜索离职员工</span><input value={employeeKeyword} maxLength={100} onChange={event => setEmployeeKeyword(event.target.value)} placeholder="姓名或员工编号" /></label>
        <div className={`${styles.actionRow} ${styles.fullWidth}`}><button type="button" className="ds-button" disabled={optionLoading || Boolean(editing)} onClick={() => void loadOptions(1, employeeKeyword)}>搜索员工</button><button type="button" className="ds-button" disabled={optionLoading || Boolean(editing) || options.page <= 1} onClick={() => void loadOptions(options.page - 1, employeeKeyword)}>员工上一页</button><button type="button" className="ds-button" disabled={optionLoading || Boolean(editing) || options.page * options.page_size >= options.total} onClick={() => void loadOptions(options.page + 1, employeeKeyword)}>员工下一页</button><span>第 {options.page} 页 · 共 {options.total} 人</span></div>
        <label className="form-field"><span>回聘员工</span><select required value={selected?.id ?? ""} disabled={optionLoading || Boolean(editing)} onChange={event => chooseEmployee(event.target.value)}><option value="">请选择离职员工</option>{selected && !options.items.some(item => item.id === selected.id) ? <option value={selected.id}>{nameOf(selected)}</option> : null}{options.items.map(item => <option key={item.id} value={item.id}>{nameOf(item)}</option>)}</select></label>
        {selected ? <p className={`muted-text ${styles.fullWidth}`}>{nameOf(selected)} · 原入职日期 {selected.hireDate ?? "未登记"} · 原离职日期 {selected.departureDate ?? "未登记"}</p> : null}
        <label className="form-field"><span>申请名称</span><input name="applicationName" required maxLength={64} value={draft.applicationName} onChange={event=>setDraft(current=>({...current,applicationName:event.target.value}))}/></label>
        <label className="form-field"><span>本次部门</span><select required value={orgId} onChange={event => { setOrgId(event.target.value); setPositionId(""); }}><option value="">请选择部门</option>{orgId && !options.orgs.some(item => item.id === orgId) ? <option value={orgId} disabled>原选择已不可用，请重新选择</option> : null}{options.orgs.map(item => <option key={item.id} value={item.id}>{item.orgName}</option>)}</select></label>
        <label className="form-field"><span>本次岗位</span><select required value={positionId} onChange={event => setPositionId(event.target.value)}><option value="">请选择该部门岗位</option>{positionId && !options.positions.some(item => item.id === positionId && item.orgId === orgId) ? <option value={positionId} disabled>原选择已不可用，请重新选择</option> : null}{options.positions.filter(item => item.orgId === orgId).map(item => <option key={item.id} value={item.id}>{item.positionName}</option>)}</select></label>
        <label className="form-field"><span>搜索直属上级</span><input value={managerKeyword} maxLength={100} onChange={event => setManagerKeyword(event.target.value)} placeholder="上级姓名或员工编号" /></label>
        <div className={`${styles.actionRow} ${styles.fullWidth}`}><button type="button" className="ds-button" disabled={managerLoading} onClick={() => void loadManagers(1, managerKeyword)}>搜索上级</button><button type="button" className="ds-button" disabled={managerLoading || managers.page <= 1} onClick={() => void loadManagers(managers.page - 1, managerKeyword)}>上级上一页</button><button type="button" className="ds-button" disabled={managerLoading || managers.page * managers.page_size >= managers.total} onClick={() => void loadManagers(managers.page + 1, managerKeyword)}>上级下一页</button><span>第 {managers.page} 页 · 共 {managers.total} 人</span></div>
        <label className="form-field"><span>本次直属上级</span><select value={managerId} disabled={managerLoading} onChange={event => setManagerId(event.target.value)}><option value="">暂不指定直属上级</option>{managerId && !managers.items.some(item => item.id === managerId) ? <option value={managerId}>{editing?.targetManagerName ?? "已选择上级，请核对"}</option> : null}{managers.items.filter(item => item.id !== selected?.id).map(item => <option key={item.id} value={item.id}>{nameOf(item)}</option>)}</select></label>
        <label className="form-field"><span>申请日期</span><input name="applicationDate" type="date" required value={draft.applicationDate} onChange={event=>setDraft(current=>({...current,applicationDate:event.target.value}))}/></label>
        <label className="form-field"><span>本次入职日期</span><input name="plannedHireDate" type="date" required value={draft.plannedHireDate} onChange={event=>setDraft(current=>({...current,plannedHireDate:event.target.value}))}/></label>
        <label className="form-field"><span>试用期限（月）</span><input name="probationMonths" type="number" min={0} max={12} step={1} required value={draft.probationMonths} onChange={event=>setDraft(current=>({...current,probationMonths:event.target.value}))} onFocus={event => event.currentTarget.select()} /></label>
        <label className="form-field"><span>本次考勤卡号</span><input name="attendanceCardNo" inputMode="numeric" pattern="[0-9]{1,20}" maxLength={20} required value={draft.attendanceCardNo} onChange={event=>setDraft(current=>({...current,attendanceCardNo:event.target.value}))}/></label>
        <label className={`form-field ${styles.fullWidth}`}><span>回聘说明</span><textarea name="remark" maxLength={250} value={draft.remark} onChange={event=>setDraft(current=>({...current,remark:event.target.value}))}/></label>
        <div className={`${styles.actionRow} ${styles.fullWidth}`}><button className="ds-button ds-button-primary" disabled={!selected || optionLoading || managerLoading}>{editing ? "保存回聘修改" : "保存回聘草稿"}</button>{editing ? <button type="button" className="ds-button" onClick={reset}>退出修改</button> : null}</div>
      </fieldset>
    </form> : null}
    <div className={`ds-scene-grid ${styles.rehireRecords}`}>{rows.map(row => <article key={row.id} className={`ds-scene-card ${styles.rehireRecord}`} aria-label={`${row.employeeName ?? "员工"}回聘申请`}>
      <h3>{row.employeeName ?? "员工"} · {statusLabels[row.status] ?? row.status}</h3>
      <p>{row.applicationName} · {row.applicationNo}</p><p>申请 {row.applicationDate} · 本次入职 {row.plannedHireDate} · 试用 {row.probationMonths} 个月</p>
      <p>部门 {row.targetOrgName ?? "待核对"} · 岗位 {row.targetPositionName ?? "待核对"} · 上级 {row.targetManagerName ?? (row.targetManagerEmployeeId ? "待核对" : "暂不指定")}</p>
      <p>原入职 {row.previousEmployment?.hire_date ?? "未登记"} · 原离职 {row.previousEmployment?.departure_date ?? "未登记"}</p>
      <p>本次考勤卡号：{row.attendanceCardNo} · 回聘说明：{row.remark ?? "未填写"}</p>
      {row.reviewComment ? <p>复核意见：{row.reviewComment}</p> : null}{row.reviewedAt ? <p>复核时间：{row.reviewedAt}</p> : null}
      {row.confirmedAt ? <p>回聘确认生效时间：{row.confirmedAt}</p> : null}
      {canReview && row.status === "submitted" && row.applicantUserId !== user?.id ? <label className="form-field"><span>复核意见（退回时必填）</span><textarea maxLength={1000} disabled={locked} value={comments[row.id] ?? ""} onChange={event => setComments(current => ({ ...current, [row.id]: event.target.value }))} /></label> : null}
      {canReview && row.status === "submitted" && row.applicantUserId === user?.id ? <p className="muted-text">本人提交的申请须由其他有权限人员复核。</p> : null}
      <div className={styles.actionRow}>
        {canManage && ["draft", "returned"].includes(row.status) ? <button type="button" className="ds-button" disabled={locked} onClick={() => edit(row)}>修改回聘申请</button> : null}
        {canManage && row.status === "draft" ? <button type="button" className="ds-button ds-button-primary" disabled={locked} onClick={() => void act(row, "submit")}>提交回聘审批</button> : null}
        {canManage && row.status === "returned" ? <button type="button" className="ds-button ds-button-primary" disabled={locked} onClick={() => void act(row, "resubmit")}>重新提交回聘</button> : null}
        {canManage && ["draft", "submitted", "returned", "approved"].includes(row.status) ? <button type="button" className="ds-button" disabled={locked} onClick={() => void act(row, "cancel")}>取消回聘申请</button> : null}
        {canReview && row.status === "submitted" && row.applicantUserId !== user?.id ? <><button type="button" className="ds-button ds-button-primary" disabled={locked} onClick={() => void act(row, "approve")}>批准回聘</button><button type="button" className="ds-button" disabled={locked} onClick={() => void act(row, "return")}>退回回聘</button></> : null}
        {employmentAuthority && row.status === "approved" ? <button type="button" className="ds-button ds-button-primary" disabled={locked || row.plannedHireDate > today()} onClick={() => void act(row, "confirm")}>确认回聘生效</button> : null}
      </div>
    </article>)}</div>
    {!rows.length ? <p>{loading ? "正在加载回聘申请…" : "暂无回聘申请。"}</p> : null}
    <nav aria-label="回聘申请分页" className={`${styles.actionRow} ${styles.rehirePagination}`}><button type="button" className="ds-button" disabled={locked || loading || page <= 1} onClick={() => void load(page - 1)}>回聘上一页</button><span role="status">第 {page} / {Math.max(1, Math.ceil(total / 20))} 页 · 共 {total} 条</span><button type="button" className="ds-button" disabled={locked || loading || page * 20 >= total} onClick={() => void load(page + 1)}>回聘下一页</button></nav>
  </section>;
}
