"use client";

import { HR_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { isForbiddenError } from "../../../lib/api-client";
import {
  hrApi,
  type HrPayrollBook,
  type HrPayrollCatalogItem,
  type HrPayrollFormula,
  type HrPayrollHistoryItem,
  type HrPayrollHistoryRow,
  type HrPayrollPeriod,
  type HrPayrollReconciliation,
  type HrPayrollReconciliationSetup,
  type HrPayrollReviewCase,
  type HrPayrollRun,
  type HrPayslip,
} from "../../../lib/hr-api";
import { hasPermission } from "../../../lib/permissions";
import workbenchStyles from "../hr-workbench.module.css";
import styles from "./payroll.module.css";

type WorkArea = "online" | "history" | "rules" | "difference";
type ViewState = "loading" | "ready" | "empty" | "forbidden" | "error";
const EMPTY_PAGE = { items: [], page: 1, page_size: 20, total: 0 };
const statusLabel: Record<string, string> = {
  draft: "草稿",
  calculating: "核算中",
  calculated: "待复核",
  reviewing: "复核中",
  confirmed: "已确认冻结",
  paid: "已发放",
};
const ruleStatusLabel: Record<string, string> = {
  review_required:"待复核",
  active:"启用",
  inactive:"停用",
  open:"待处理",
  resolved:"已完成",
  rejected:"已拒绝",
};
const itemCategoryLabel: Record<string, string> = {
  summary:"汇总项",
  earning:"收入项",
  deduction:"扣减项",
  tax:"税费项",
  reference:"参考项",
};
const valueTypeLabel: Record<string, string> = {
  decimal:"金额",
  text:"文本",
  date:"日期",
};
const caseTypeLabel: Record<string, string> = {
  formula_unsafe:"公式风险",
  employee_unmapped:"员工待匹配",
  item_unmapped:"项目待匹配",
  migration_error:"迁移异常",
};
const reviewActionLabel: Record<string, string> = {
  comment:"继续跟进",
  resolve:"完成复核",
  reject:"拒绝",
};
const money = (value: string | number | null | undefined) => {
  if(value==null)return "—";
  const match=String(value).match(/^(-?)(\d+)(?:\.(\d{0,4}))?$/);
  if(!match)return "—";
  const integer=match[2]!.replace(/\B(?=(\d{3})+(?!\d))/g,",");
  const decimal=(match[3]??"").replace(/0+$/,"").padEnd(2,"0");
  return `¥${match[1]}${integer}.${decimal}`;
};
const errorState=(error:unknown):ViewState=>isForbiddenError(error)?"forbidden":"error";

function Pager({page,total,pageSize,onPage}:{page:number;total:number;pageSize:number;onPage:(page:number)=>void}){
  const pages=Math.max(1,Math.ceil(total/pageSize));
  if(total<=pageSize)return null;
  return <nav className={styles.pager} aria-label="分页"><button className="ds-button" type="button" disabled={page<=1} onClick={()=>onPage(page-1)}>上一页</button><span>第 {page} / {pages} 页</span><button className="ds-button" type="button" disabled={page>=pages} onClick={()=>onPage(page+1)}>下一页</button></nav>;
}

function StatePanel({state,onRetry}:{state:ViewState;onRetry:()=>void}){
  if(state==="loading")return <div className="ds-panel" aria-live="polite">正在加载…</div>;
  if(state==="forbidden")return <div className="ds-panel" role="alert"><strong>无权读取此数据</strong><p>当前账号未获对应工资数据权限。</p></div>;
  if(state==="error")return <div className="ds-panel" role="alert"><strong>加载失败</strong><button className="ds-button" type="button" onClick={onRetry}>重试</button></div>;
  return null;
}

export function HrPayrollClient() {
  const user = useAuthUser();
  const canManage = hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_MANAGE);
  const canReadOnline = hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_READ);
  const canSelfOnline = hasPermission(
    user,
    HR_PERMISSIONS.HR_PAYSLIP_SELF_READ,
  );
  const canHistory = hasPermission(
    user,
    HR_PERMISSIONS.HR_PAYROLL_HISTORY_READ,
  );
  const canSelfHistory = hasPermission(
    user,
    HR_PERMISSIONS.HR_PAYROLL_HISTORY_SELF_READ,
  );
  const canTeamSummary = hasPermission(
    user,
    HR_PERMISSIONS.HR_PAYROLL_HISTORY_TEAM_SUMMARY,
  );
  const canRules = hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_RULE_READ);
  const canReviewRules = hasPermission(
    user,
    HR_PERMISSIONS.HR_PAYROLL_FORMULA_REVIEW,
  );
  const canReviewOnline = hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_REVIEW);
  const canConfirmOnline = hasPermission(
    user,
    HR_PERMISSIONS.HR_PAYROLL_CONFIRM,
  );
  const canDifference =
    hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE) ||
    hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW);
  const canCalculateDifference = hasPermission(
    user,
    HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE,
  );
  const canReviewDifference = hasPermission(
    user,
    HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW,
  );
  const [area, setArea] = useState<WorkArea>(
    canReadOnline || canSelfOnline
      ? "online"
      : canHistory || canSelfHistory
        ? "history"
        : canRules
          ? "rules"
          : "difference",
  );
  const availableAreas = useMemo(
    () => [
      ...(canReadOnline || canSelfOnline
        ? [{ id: "online" as const, label: "在线工资", description: "工资期间、批次复核与冻结" }]
        : []),
      ...(canHistory || canSelfHistory
        ? [{ id: "history" as const, label: "历史工资", description: "旧系统工资台账与个人明细" }]
        : []),
      ...(canRules ? [{ id: "rules" as const, label: "规则复核", description: "历史公式解析与人工复核" }] : []),
      ...(canDifference
        ? [{ id: "difference" as const, label: "双轨差异", description: "新旧口径模拟与差异审阅" }]
        : []),
    ],
    [
      canDifference,
      canHistory,
      canReadOnline,
      canRules,
      canSelfHistory,
      canSelfOnline,
    ],
  );

  return (
    <PermissionGuard
      module="hr"
      permission={HR_PERMISSIONS.HR_PAYROLL_PAGE}
      fallback={
        <main className={`content ds-page ${workbenchStyles.page}`}>
          <section className="ds-panel" role="alert">
            <h1>无法访问工资管理</h1>
            <p>当前账号没有工资模块页面权限。</p>
          </section>
        </main>
      }
    >
      <main
        className={`content ds-page ${workbenchStyles.page} ${styles.payrollPage}`}
      >
        <section className={`ds-hero ${styles.hero}`}>
          <div className="ds-hero-copy">
            <span className="ds-eyebrow">人力资源 · 薪酬</span>
            <h1>工资管理</h1>
          </div>
        </section>
        <nav className={`ds-panel ${styles.workspaceNav}`} aria-label="工资工作区">
          <div className={styles.workspaceIntro}>
            <span className="ds-eyebrow">工资工作区</span>
            <strong>{availableAreas.find((item) => item.id === area)?.label ?? "工资管理"}</strong>
            <p>{availableAreas.find((item) => item.id === area)?.description ?? "按权限进入对应工资业务。"}</p>
          </div>
          <div className={styles.tabs}>
            {availableAreas.map((item) => (
              <button
                key={item.id}
                type="button"
                className={area === item.id ? styles.activeTab : styles.tab}
                aria-current={area === item.id ? "page" : undefined}
                onClick={() => setArea(item.id)}
              >
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </button>
            ))}
          </div>
        </nav>
        {availableAreas.length === 0 ? (
          <section className="ds-panel">
            <strong>
              {canTeamSummary ? "团队工资数据不可见" : "无可用工资工作区"}
            </strong>
            <p>
              {canTeamSummary
                ? "团队权限不包含金额、工资存在性或历史明细；本页面不会请求相关接口。"
                : "当前账号没有工资数据读取权限。"}
            </p>
          </section>
        ) : null}
        {area === "online" && (canReadOnline || canSelfOnline) ? (
          <OnlinePayroll
            canManage={canManage}
            canRead={canReadOnline}
            selfOnly={!canReadOnline}
            canReview={canReviewOnline}
            canConfirm={canConfirmOnline}
          />
        ) : null}
        {area === "history" && (canHistory || canSelfHistory) ? (
          <HistoryPayroll selfOnly={!canHistory} />
        ) : null}
        {area === "rules" && canRules ? (
          <RuleReview canAct={canReviewRules} />
        ) : null}
        {area === "difference" && canDifference ? (
          <ReconciliationWorkbench
            canCalculate={canCalculateDifference}
            canReview={canReviewDifference}
          />
        ) : null}
      </main>
    </PermissionGuard>
  );
}

function ReconciliationWorkbench({
  canCalculate,
  canReview,
}: {
  canCalculate: boolean;
  canReview: boolean;
}) {
  const [page, setPage] = useState(1),
    [result, setResult] =
      useState<PaginatedResult<HrPayrollReconciliation>>(EMPTY_PAGE),
    [selected, setSelected] = useState<HrPayrollReconciliation | null>(null),
    [detailTarget, setDetailTarget] = useState<HrPayrollReconciliation | null>(
      null,
    ),
    [reconciliationSetup, setReconciliationSetup] =
      useState<HrPayrollReconciliationSetup | null>(null),
    [policyBookId, setPolicyBookId] = useState(""),
    [state, setState] = useState<ViewState>("loading"),
    [detailState, setDetailState] = useState<ViewState>("empty"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const generation = useRef(0),
    abort = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    abort.current?.abort();
    const current = ++generation.current,
      controller = new AbortController();
    abort.current = controller;
    setState("loading");
    setSelected(null);
    setDetailTarget(null);
    setDetailState("empty");
    try {
      const [data, setupData] = await Promise.all([
        hrApi.payrollReconciliations(
          getAccessToken(),
          page,
          20,
          controller.signal,
        ),
        hrApi.payrollReconciliationSetup(getAccessToken(), controller.signal),
      ]);
      if (current !== generation.current) return;
      setResult(data);
      setReconciliationSetup(setupData);
      setPolicyBookId((value) => value || setupData.books[0]?.id || "");
      setState(data.items.length ? "ready" : "empty");
    } catch (e) {
      if (
        current === generation.current &&
        !(e instanceof DOMException && e.name === "AbortError")
      )
        setState(errorState(e));
    }
  }, [page]);
  useEffect(() => {
    void load();
    return () => {
      abort.current?.abort();
      generation.current += 1;
    };
  }, [load]);
  const open = async (row: HrPayrollReconciliation, resultPage = 1) => {
    abort.current?.abort();
    const current = ++generation.current,
      controller = new AbortController();
    abort.current = controller;
    setDetailTarget(row);
    setSelected(null);
    setDetailState("loading");
    try {
      const detail = await hrApi.payrollReconciliation(
        row.id,
        getAccessToken(),
        controller.signal,
        resultPage,
        20,
      );
      if (current === generation.current) {
        setSelected(detail);
        setDetailState("ready");
      }
    } catch (e) {
      if (
        current === generation.current &&
        !(e instanceof DOMException && e.name === "AbortError")
      )
        setDetailState(errorState(e));
    }
  };
  const simulate = async (form: FormData) => {
    setBusy(true);
    setMessage("");
    try {
      await hrApi.simulatePayrollReconciliation(
        {
          legacyBatchId: String(form.get("legacyBatchId")),
          attendanceInputBatchId: String(form.get("attendanceInputBatchId")),
        },
        getAccessToken(),
      );
      setMessage("模拟完成，未触发发薪。");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "模拟失败");
    } finally {
      setBusy(false);
    }
  };
  const savePolicy = async (form: FormData) => {
    setBusy(true);
    setMessage("");
    try {
      await hrApi.createPayrollReconciliationPolicy(
        {
          bookId: String(form.get("bookId")),
          netItemVersionId: String(form.get("netItemVersionId")),
          toleranceAmount: String(form.get("toleranceAmount")),
          reason: String(form.get("reason")),
        },
        getAccessToken(),
      );
      setMessage("净额核对策略已追加并生效。");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "策略保存失败");
    } finally {
      setBusy(false);
    }
  };
  const review = async (form: FormData) => {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      await hrApi.reviewPayrollReconciliation(
        selected.id,
        {
          decision: String(form.get("decision")),
          comment: String(form.get("comment")),
        },
        getAccessToken(),
      );
      setMessage("复核意见已记录。");
      await open(detailTarget ?? selected);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "复核失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className={styles.desktopSensitive}>
        {message ? (
          <p className="form-error" role="alert">
            {message}
          </p>
        ) : null}
        {canReview && reconciliationSetup ? (
          <section className="ds-panel">
            <div className={workbenchStyles.sectionHeading}>
              <div>
                <span className="ds-eyebrow">CONTROL · 追加版本</span>
                <h2>账套净额核对策略</h2>
              </div>
            </div>
            <form className={workbenchStyles.formGrid} action={savePolicy}>
              <label className="form-field">
                <span>工资账套</span>
                <select
                  name="bookId"
                  required
                  value={policyBookId}
                  onChange={(event) => setPolicyBookId(event.target.value)}
                >
                  {reconciliationSetup.books.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.bookName}
                      {book.netItemName
                        ? `（当前：${book.netItemName}，容差 ${money(book.toleranceAmount ?? "0")}）`
                        : "（未配置）"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>权威净额项目</span>
                <select name="netItemVersionId" required defaultValue="">
                  <option value="" disabled>
                    请选择已批准公式项目
                  </option>
                  {reconciliationSetup.netItems
                    .filter((item) => item.bookId === policyBookId)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.displayName}（{item.itemCode} · V{item.versionNo}）
                      </option>
                    ))}
                </select>
              </label>
              <label className="form-field">
                <span>核对容差（元）</span>
                <input
                  name="toleranceAmount"
                  type="number"
                  min="0"
                  max="999999999999999"
                  step="0.0001"
                  defaultValue="0.0000"
                  required
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <label className="form-field">
                <span>复核理由</span>
                <textarea name="reason" required maxLength={1000} />
              </label>
              <button className="ds-button ds-button-primary" disabled={busy}>
                追加并启用策略
              </button>
            </form>
          </section>
        ) : null}
        {canCalculate ? (
          <section className="ds-panel">
            <div className={workbenchStyles.sectionHeading}>
              <div>
                <span className="ds-eyebrow">SIMULATION · 不可发薪</span>
                <h2>创建双轨模拟</h2>
              </div>
            </div>
            <form className={workbenchStyles.formGrid} action={simulate}>
              <label className="form-field">
                <span>旧系统已发布批次</span>
                <select name="legacyBatchId" required defaultValue="">
                  <option value="" disabled>请选择历史批次</option>
                  {reconciliationSetup?.legacyBatches.map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.batchCode} · {batch.sourceRowCount} 人
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>已关闭且生效的考勤输入</span>
                <select name="attendanceInputBatchId" required defaultValue="">
                  <option value="" disabled>请选择考勤输入批次</option>
                  {reconciliationSetup?.attendanceBatches.map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      {String(batch.periodMonth).slice(0, 7)} · 批次 {batch.batchNo}
                    </option>
                  ))}
                </select>
              </label>
              <button className="ds-button ds-button-primary" disabled={busy}>
                开始只算不发
              </button>
            </form>
          </section>
        ) : null}
        {state === "loading" || state === "forbidden" || state === "error" ? (
          <StatePanel state={state} onRetry={() => void load()} />
        ) : (
          <section className="ds-panel">
            <div className={workbenchStyles.sectionHeading}>
              <h2>模拟记录</h2>
              <span>{result.total} 次</span>
            </div>
            <div className="ds-mobile-record-list">
              {state === "empty" ? (
                <p className={workbenchStyles.emptyState}>暂无双轨模拟。</p>
              ) : (
                result.items.map((row) => (
                  <article className="ds-mobile-record" key={row.id}>
                    <strong>
                      {new Date(row.createdAt).toLocaleString("zh-CN")} · 复核中
                    </strong>
                    <span>
                      {row.employeeCount} 人 · {row.differenceCount} 人超出容差
                    </span>
                    <button
                      className="ds-button"
                      type="button"
                      onClick={() => void open(row)}
                    >
                      查看差异
                    </button>
                  </article>
                ))
              )}
            </div>
            <Pager
              page={result.page}
              pageSize={result.page_size}
              total={result.total}
              onPage={setPage}
            />
          </section>
        )}
        {detailState === "loading" ||
        detailState === "forbidden" ||
        detailState === "error" ? (
          <StatePanel
            state={detailState}
            onRetry={() => selected && void open(selected)}
          />
        ) : selected ? (
          <section className="ds-panel">
            <div className={workbenchStyles.sectionHeading}>
              <h2>逐人逐项差异</h2>
              <button
                className="ds-button"
                type="button"
                onClick={() => {
                  abort.current?.abort();
                  generation.current += 1;
                  setSelected(null);
                  setDetailState("empty");
                }}
              >
                关闭
              </button>
            </div>
            <div className="ds-mobile-record-list">
              {selected.results?.map((employee) => (
                <article className="ds-mobile-record" key={employee.resultId}>
                  <strong>
                    {employee.employeeName} · {employee.employeeCode}
                  </strong>
                  <span>
                    旧值 {money(employee.oldTotal)} · 新值{" "}
                    {money(employee.newTotal)} · 差额{" "}
                    {money(employee.deltaTotal)}
                  </span>
                  {employee.differences.map((item) => (
                    <small key={item.id}>
                      {item.itemName}：{money(item.oldAmount)} →{" "}
                      {money(item.newAmount)}（{money(item.deltaAmount)}）
                    </small>
                  ))}
                </article>
              ))}
            </div>
            <Pager
              page={selected.resultPage ?? 1}
              pageSize={selected.resultPageSize ?? 20}
              total={selected.resultTotal ?? selected.employeeCount}
              onPage={(nextPage) =>
                detailTarget && void open(detailTarget, nextPage)
              }
            />
            {canReview ? (
              <form className={workbenchStyles.formGrid} action={review}>
                <label className="form-field">
                  <span>复核结论</span>
                  <select name="decision">
                    <option value="request_follow_up">继续核查</option>
                    <option value="accept_explanation">接受差异说明</option>
                    <option value="reject_explanation">拒绝差异说明</option>
                  </select>
                </label>
                <label className="form-field">
                  <span>复核意见</span>
                  <textarea name="comment" required maxLength={1000} />
                </label>
                <button className="ds-button ds-button-primary" disabled={busy}>
                  记录复核
                </button>
              </form>
            ) : null}
          </section>
        ) : null}
      </div>
      <section className={`ds-panel ${styles.mobileNotice}`}>
        <strong>双轨核对请使用电脑端</strong>
        <p>手机端不提供批量工资模拟和差异复核。</p>
      </section>
    </>
  );
}

function OnlinePayroll({canManage,canRead,selfOnly,canReview,canConfirm}:{canManage:boolean;canRead:boolean;selfOnly:boolean;canReview:boolean;canConfirm:boolean}){
  const [periods,setPeriods]=useState<HrPayrollPeriod[]>([]),[runs,setRuns]=useState<HrPayrollRun[]>([]),[slips,setSlips]=useState<HrPayslip[]>([]),[runSlips,setRunSlips]=useState<HrPayslip[]>([]);
  const [selectedRun,setSelectedRun]=useState<HrPayrollRun|null>(null),[setup,setSetup]=useState<"period"|"run"|null>(null),[message,setMessage]=useState(""),[state,setState]=useState<ViewState>("loading");
  const load=useCallback(async()=>{setState("loading");try{const token=getAccessToken();if(canRead){const [p,r]=await Promise.all([hrApi.payrollPeriods(token),hrApi.payrollRuns(token)]);setPeriods(p);setRuns(r);setState(r.length?"ready":"empty");}else if(selfOnly){const rows=await hrApi.myPayslips(token);setSlips(rows);setState(rows.length?"ready":"empty");}}catch(e){setState(errorState(e));}},[canRead,selfOnly]);
  useEffect(()=>{void load();},[load]);
  const createPeriod=async(form:FormData)=>{try{await hrApi.createPayrollPeriod({periodMonth:`${String(form.get("periodMonth"))}-01`,startDate:String(form.get("startDate")),endDate:String(form.get("endDate"))},getAccessToken());setSetup(null);await load();}catch(e){setMessage(e instanceof Error?e.message:"创建期间失败");}};
  const createRun=async(form:FormData)=>{try{await hrApi.createPayrollRun({periodId:String(form.get("periodId")),correctionOfRunId:String(form.get("correctionOfRunId"))||undefined},getAccessToken());setSetup(null);await load();}catch(e){setMessage(e instanceof Error?e.message:"生成工资失败");}};
  const inspect=async(run:HrPayrollRun)=>{setSelectedRun(run);setRunSlips([]);try{setRunSlips(await hrApi.payrollRunPayslips(run.id,getAccessToken()));}catch(e){setSelectedRun(null);setMessage(e instanceof Error?e.message:"加载工资条失败");}};
  const runAction=async(run:HrPayrollRun,action:"review"|"confirm")=>{try{if(action==="review")await hrApi.reviewPayrollRun(run.id,getAccessToken());else await hrApi.confirmPayrollRun(run.id,getAccessToken());await load();}catch(e){setMessage(e instanceof Error?e.message:"操作失败");}};
  const adjust=async(form:FormData)=>{if(!selectedRun)return;try{await hrApi.adjustPayslip(selectedRun.id,String(form.get("payslipId")),{deductionAmount:String(form.get("deductionAmount")),personalTax:String(form.get("personalTax")),reason:String(form.get("reason"))},getAccessToken());await inspect(selectedRun);}catch(e){setMessage(e instanceof Error?e.message:"校正工资条失败");}};
  if(state==="loading"||state==="forbidden"||state==="error")return <StatePanel state={state} onRetry={()=>void load()}/>;
  return <>
    {message?<p className="form-error" role="alert">{message}</p>:null}
    {canManage?<div className={styles.toolbar}><button className="ds-button" type="button" onClick={()=>setSetup(setup==="period"?null:"period")}>工资期间</button><button className="ds-button ds-button-primary" type="button" onClick={()=>setSetup(setup==="run"?null:"run")}>生成批次</button></div>:null}
    {setup==="period"?<form className={`ds-panel ${workbenchStyles.formGrid}`} action={createPeriod}><div className={workbenchStyles.sectionHeading}><h2>创建工资期间</h2></div><label className="form-field"><span>工资月份</span><input name="periodMonth" type="month" required/></label><label className="form-field"><span>周期开始</span><input name="startDate" type="date" required/></label><label className="form-field"><span>周期结束</span><input name="endDate" type="date" required/></label><button className="ds-button ds-button-primary">保存期间</button></form>:null}
    {setup === "run" ? <form className={`ds-panel ${workbenchStyles.formGrid}`} action={createRun}><div className={workbenchStyles.sectionHeading}><h2>生成工资批次</h2></div><label className="form-field"><span>工资期间</span><select name="periodId" required>{periods.map(p=><option value={p.id} key={p.id}>{p.periodMonth}</option>)}</select></label><label className="form-field"><span>更正原批次</span><select name="correctionOfRunId"><option value="">基础批次</option>{runs.filter(r=>r.status==="confirmed").map(r=><option value={r.id} key={r.id}>批次 {r.runNo}</option>)}</select></label><button className="ds-button ds-button-primary">生成批次</button></form>:null}
    <section className="ds-panel"><div className={workbenchStyles.sectionHeading}><h2>{canRead?"工资批次":"我的工资条"}</h2><span className={styles.srOnly}>待确认</span></div><div className="ds-mobile-record-list">{state==="empty"?<p className={workbenchStyles.emptyState}>暂无数据。</p>:canRead?runs.map(r=><article className="ds-mobile-record" key={r.id}><strong>批次 {r.runNo} · {statusLabel[r.status]??r.status}</strong><span>{r.employeeCount} 人 · 应发 {money(r.grossTotal)} · 实发 {money(r.netTotal)}</span><div className={styles.toolbar}><button className="ds-button" type="button" onClick={()=>void inspect(r)}>查看工资条</button>{canReview&&r.status==="calculated"?<button className="ds-button" type="button" onClick={()=>void runAction(r,"review")}>提交复核</button>:null}{canConfirm&&r.status==="reviewing"?<button className="ds-button ds-button-primary" type="button" onClick={()=>void runAction(r,"confirm")}>确认并冻结</button>:null}</div></article>):slips.map(s=><article className="ds-mobile-record" key={s.id}><strong>实发 {money(s.netAmount)}</strong><span>应发 {money(s.grossAmount)} · 扣款 {money(s.deductionAmount)} · 个税 {money(s.personalTax)}</span><small>仅限本人数据</small></article>)}</div></section>
    {selectedRun?<section className="ds-panel"><div className={workbenchStyles.sectionHeading}><h2>批次 {selectedRun.runNo} · 工资条</h2><button className="ds-button" type="button" onClick={()=>{setSelectedRun(null);setRunSlips([]);}}>关闭明细</button></div><div className="ds-mobile-record-list">{runSlips.map(s=><article className="ds-mobile-record" key={s.id}><strong>实发 {money(s.netAmount)}</strong><span>应发 {money(s.grossAmount)} · 扣款 {money(s.deductionAmount)} · 个税 {money(s.personalTax)}</span>{selectedRun.status!=="confirmed"?<details><summary>校正工资条</summary><form className={workbenchStyles.formGrid} action={adjust}><input type="hidden" name="payslipId" value={s.id}/><label className="form-field"><span>扣款</span><input name="deductionAmount" type="number" min="0" step="0.01" defaultValue={s.deductionAmount}/></label><label className="form-field"><span>个税</span><input name="personalTax" type="number" min="0" step="0.01" defaultValue={s.personalTax}/></label><label className="form-field"><span>校正原因</span><input name="reason" maxLength={500} required/></label><button className="ds-button ds-button-primary">保存校正</button></form></details>:<span>已确认冻结</span>}</article>)}</div></section>:null}
  </>;
}

function HistoryPayroll({selfOnly}:{selfOnly:boolean}){
  const [page,setPage]=useState(1),[result,setResult]=useState<PaginatedResult<HrPayrollHistoryRow>>(EMPTY_PAGE),[state,setState]=useState<ViewState>("loading");
  const [selected,setSelected]=useState<HrPayrollHistoryRow|null>(null),[detailTarget,setDetailTarget]=useState<HrPayrollHistoryRow|null>(null),[items,setItems]=useState<HrPayrollHistoryItem[]>([]),[detailState,setDetailState]=useState<ViewState>("empty");
  const [periodFrom,setPeriodFrom]=useState(""),[periodTo,setPeriodTo]=useState(""),[filters,setFilters]=useState({periodFrom:"",periodTo:""});
  const generation=useRef(0);
  const abort=useRef<AbortController|null>(null);
  const nextRequest=()=>{abort.current?.abort();abort.current=new AbortController();return {current:++generation.current,signal:abort.current.signal};};
  const load=useCallback(async()=>{const request=nextRequest();setState("loading");setSelected(null);setDetailTarget(null);setItems([]);setDetailState("empty");try{const data=await hrApi.payrollHistory(getAccessToken(),page,20,filters,request.signal);if(request.current!==generation.current)return;setResult(data);setState(data.items.length?"ready":"empty");}catch(e){if(request.current===generation.current&&!(e instanceof DOMException&&e.name==="AbortError"))setState(errorState(e));}},[filters,page]);
  useEffect(()=>{void load();return()=>{abort.current?.abort();generation.current+=1;};},[load]);
  const open=async(row:HrPayrollHistoryRow)=>{const request=nextRequest();setDetailTarget(row);setSelected(null);setItems([]);setDetailState("loading");try{const [detail,entries]=await Promise.all([hrApi.payrollHistoryDetail(row.id,getAccessToken(),request.signal),hrApi.payrollHistoryItems(row.id,getAccessToken(),request.signal)]);if(request.current!==generation.current)return;setSelected(detail);setItems(entries);setDetailState(entries.length?"ready":"empty");}catch(e){if(request.current===generation.current&&!(e instanceof DOMException&&e.name==="AbortError"))setDetailState(errorState(e));}};
  return <>
    <section className="ds-panel"><form className={styles.filters} onSubmit={e=>{e.preventDefault();setPage(1);setFilters({periodFrom,periodTo});}}><label className="form-field"><span>开始月份</span><input type="month" value={periodFrom} onChange={e=>setPeriodFrom(e.target.value)}/></label><label className="form-field"><span>结束月份</span><input type="month" value={periodTo} onChange={e=>setPeriodTo(e.target.value)}/></label><button className="ds-button ds-button-primary">查询</button></form></section>
    {state==="loading"||state==="forbidden"||state==="error"?<StatePanel state={state} onRetry={()=>void load()}/>:<section className="ds-panel"><div className={workbenchStyles.sectionHeading}><h2>{selfOnly?"我的历史工资":"历史工资"}</h2><span>{result.total} 条</span></div><div className="ds-mobile-record-list">{state==="empty"?<p className={workbenchStyles.emptyState}>当前筛选条件下没有历史工资。</p>:result.items.map(row=><article className="ds-mobile-record" key={row.id}><strong>{row.periodMonth.slice(0,7)} · {row.bookName||`账套 ${row.legacyScheme}`}</strong>{!selfOnly?<span>{row.employeeName} · {row.employeeCode}</span>:null}<span>实发 {money(row.netAmount)} · 应发 {money(row.grossAmount)}</span><button className="ds-button" type="button" onClick={()=>void open(row)}>查看明细</button></article>)}</div><Pager page={result.page} pageSize={result.page_size} total={result.total} onPage={next=>{setPage(next);setSelected(null);setItems([]);}}/></section>}
    {detailState==="loading"||detailState==="forbidden"||detailState==="error"?<StatePanel state={detailState} onRetry={()=>detailTarget&&void open(detailTarget)}/>:selected?<section className="ds-panel"><div className={workbenchStyles.sectionHeading}><h2>{selected.periodMonth.slice(0,7)} 工资明细</h2><button className="ds-button" type="button" onClick={()=>{abort.current?.abort();generation.current+=1;setSelected(null);setDetailTarget(null);setItems([]);}}>关闭</button></div><div className="ds-mobile-record-list">{items.length?items.map(item=><article className="ds-mobile-record" key={item.id}><strong>{item.displayName||item.itemCode||"历史项目"}</strong><span>{item.isSourceNull?"源值为空":item.valueType==="decimal"?money(item.decimalValue):item.textValue||item.dateValue||"—"}</span></article>):<p className={workbenchStyles.emptyState}>该工资条没有逐项明细。</p>}</div></section>:null}
  </>;
}

function RuleReview({canAct}:{canAct:boolean}){
  const [page,setPage]=useState(1),[bookPage,setBookPage]=useState(1),[itemPage,setItemPage]=useState(1),[formulaPage,setFormulaPage]=useState(1);
  const [books,setBooks]=useState<PaginatedResult<HrPayrollBook>>(EMPTY_PAGE),[catalogItems,setCatalogItems]=useState<PaginatedResult<HrPayrollCatalogItem>>(EMPTY_PAGE),[formulas,setFormulas]=useState<PaginatedResult<HrPayrollFormula>>(EMPTY_PAGE),[result,setResult]=useState<PaginatedResult<HrPayrollReviewCase>>(EMPTY_PAGE),[state,setState]=useState<ViewState>("loading");
  const [selected,setSelected]=useState<HrPayrollReviewCase|null>(null),[detailTarget,setDetailTarget]=useState<HrPayrollReviewCase|null>(null),[detailState,setDetailState]=useState<ViewState>("empty"),[comment,setComment]=useState(""),[actionError,setActionError]=useState(""),[busy,setBusy]=useState(false);const generation=useRef(0),abort=useRef<AbortController|null>(null),detailAbort=useRef<AbortController|null>(null);
  const load=useCallback(async()=>{abort.current?.abort();detailAbort.current?.abort();const current=++generation.current,controller=new AbortController();abort.current=controller;setState("loading");setSelected(null);setDetailTarget(null);setDetailState("empty");try{const [b,i,f,c]=await Promise.all([hrApi.payrollHistoryBooks(getAccessToken(),bookPage,20,controller.signal),hrApi.payrollHistoryCatalogItems(getAccessToken(),itemPage,20,{},controller.signal),hrApi.payrollHistoryFormulas(getAccessToken(),formulaPage,20,{parseStatus:"manual_review"},controller.signal),hrApi.payrollHistoryReviewCases(getAccessToken(),page,20,{},controller.signal)]);if(current!==generation.current)return;setBooks(b);setCatalogItems(i);setFormulas(f);setResult(c);setState(c.items.length||b.items.length||i.items.length||f.items.length?"ready":"empty");}catch(e){if(current===generation.current&&!(e instanceof DOMException&&e.name==="AbortError"))setState(errorState(e));}},[bookPage,formulaPage,itemPage,page]);
  useEffect(()=>{void load();return()=>{abort.current?.abort();detailAbort.current?.abort();generation.current+=1;};},[load]);
  const open=async(item:HrPayrollReviewCase)=>{detailAbort.current?.abort();const current=++generation.current,controller=new AbortController();detailAbort.current=controller;setDetailTarget(item);setDetailState("loading");setSelected(null);setComment("");setActionError("");try{const detail=await hrApi.payrollHistoryReviewCase(item.id,getAccessToken(),controller.signal);if(current===generation.current){setSelected(detail);setDetailState("ready");}}catch(e){if(current===generation.current&&!(e instanceof DOMException&&e.name==="AbortError"))setDetailState(errorState(e));}};
  const act=async(action:"comment"|"resolve"|"reject")=>{if(!selected||!comment.trim())return;setBusy(true);setActionError("");try{const decision=action==="comment"?"needs_follow_up":action==="reject"?"unsafe_rejected":selected.caseType==="employee_unmapped"||selected.caseType==="item_unmapped"?"mapping_confirmed":"accepted_exception";await hrApi.addPayrollHistoryReviewAction(selected.id,{action,decision,comment:comment.trim()},getAccessToken());setComment("");await load();}catch(e){setActionError(e instanceof Error?e.message:"复核操作失败");}finally{setBusy(false);}};
  if(state==="loading"||state==="forbidden"||state==="error")return <StatePanel state={state} onRetry={()=>void load()}/>;
  return <><div className={styles.desktopSensitive}>
    <section className="ds-kpi-grid"><article className="ds-kpi-card"><span>历史账套</span><strong>{books.total}</strong></article><article className="ds-kpi-card"><span>工资项目</span><strong>{catalogItems.total}</strong></article><article className="ds-kpi-card"><span>待复核公式</span><strong>{formulas.total}</strong></article><article className="ds-kpi-card"><span>复核事项</span><strong>{result.total}</strong></article></section>
    <section className="ds-panel"><div className={workbenchStyles.sectionHeading}><h2>账套与项目</h2></div><div className={styles.catalogGrid}><div><div className="ds-mobile-record-list">{books.items.map(book=><article className="ds-mobile-record" key={book.id}><strong>{book.bookName||`账套 ${book.legacyScheme}`}</strong><span>{ruleStatusLabel[book.status]??book.status}</span></article>)}</div><Pager page={books.page} pageSize={books.page_size} total={books.total} onPage={setBookPage}/></div><div><div className="ds-mobile-record-list">{catalogItems.items.map(item=><article className="ds-mobile-record" key={item.id}><strong>{item.displayName}</strong><span>{itemCategoryLabel[item.itemCategory]??item.itemCategory} · {valueTypeLabel[item.valueType]??item.valueType}</span></article>)}</div><Pager page={catalogItems.page} pageSize={catalogItems.page_size} total={catalogItems.total} onPage={setItemPage}/></div><div><div className="ds-mobile-record-list">{formulas.items.map(formula=><article className="ds-mobile-record" key={formula.id}><strong>{formula.itemName||`账套 ${formula.legacyScheme}`}</strong><span>待人工复核 · 顺序 {formula.calculationOrder}</span></article>)}</div><Pager page={formulas.page} pageSize={formulas.page_size} total={formulas.total} onPage={setFormulaPage}/></div></div></section>
    <section className="ds-panel"><div className={workbenchStyles.sectionHeading}><h2>规则与复核</h2></div><div className="ds-mobile-record-list">{result.items.map(item=><article className="ds-mobile-record" key={item.id}><strong>{caseTypeLabel[item.caseType]??item.caseType} · {ruleStatusLabel[item.sourceStatus]??item.sourceStatus}</strong><span>已追加 {item.actionCount??0} 条处理记录</span><button className="ds-button" type="button" onClick={()=>void open(item)}>处理</button></article>)}{result.total===0?<p className={workbenchStyles.emptyState}>暂无待处理规则。</p>:null}</div><Pager page={result.page} pageSize={result.page_size} total={result.total} onPage={setPage}/></section>
    {detailState==="loading"||detailState==="forbidden"||detailState==="error"?<StatePanel state={detailState} onRetry={()=>detailTarget&&void open(detailTarget)}/>:selected?<section className="ds-panel"><div className={workbenchStyles.sectionHeading}><h2>复核记录</h2><button className="ds-button" type="button" onClick={()=>{detailAbort.current?.abort();generation.current+=1;setSelected(null);setDetailTarget(null);setDetailState("empty");setComment("");setActionError("");}}>关闭</button></div><div className="ds-mobile-record-list">{selected.actions?.map(a=><article className="ds-mobile-record" key={a.id}><strong>#{a.sequenceNo} · {reviewActionLabel[a.action]??a.action}</strong><span>{a.comment}</span></article>)}</div>{canAct?<div className={styles.reviewActions}>{actionError?<p className="form-error" role="alert">{actionError}</p>:null}<label className="form-field"><span>处理意见</span><textarea maxLength={1000} required value={comment} onChange={e=>{setComment(e.target.value);setActionError("");}}/></label><div className={styles.toolbar}><button className="ds-button" disabled={busy||!comment.trim()} type="button" onClick={()=>void act("comment")}>继续跟进</button><button className="ds-button" disabled={busy||!comment.trim()} type="button" onClick={()=>void act("reject")}>拒绝</button><button className="ds-button ds-button-primary" disabled={busy||!comment.trim()} type="button" onClick={()=>void act("resolve")}>完成复核</button></div></div>:null}</section>:null}
  </div><section className={`ds-panel ${styles.mobileNotice}`}><strong>规则复核请使用电脑端</strong><p>手机端仅提供本人历史工资查询。</p></section></>;
}
