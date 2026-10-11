"use client";
import { useEffect, useRef, useState } from "react";
import { createIdempotencyKey } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import { hrApi, type HrCandidate, type HrPosition } from "../../../lib/hr-api";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "../hr-workbench.module.css";

export type ConversionReceipt = Awaited<ReturnType<typeof hrApi.convertRecruitmentCandidate>>;
type Body = { employeeCode: string; hireDate?: string; positionId?: string; workLocation?: string };
type Props = { candidate: HrCandidate; positions: HrPosition[]; disabled: boolean;
  onBusyChange: (busy: boolean) => void; onConverted: (receipt: ConversionReceipt, candidate: HrCandidate, employeeCode: string) => void };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function definiteRejection(error: unknown) {
  const status = (error as { status?: number })?.status;
  return status !== undefined && status >= 400 && status < 500 && status !== 408
    && !(status === 409 && /idempotency key.*(processing|does not match)/i.test((error as Error).message));
}
export function CandidateConversion({ candidate, positions, disabled, onBusyChange, onConverted }: Props) {
  const [employeeCode, setCode] = useState(""), [hireDate, setDate] = useState(candidate.expectedOnboardDate ?? ""),
    [positionId, setPosition] = useState(""), [workLocation, setLocation] = useState("");
  const [sending, setSending] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState("");
  const saving = useRef(false), mounted = useRef(true), attempt = useRef<{ body: Body; key: string } | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const locked = disabled || sending || uncertain;
  const submit = async () => {
    if (saving.current || disabled) return;
    if (!attempt.current) {
      if (!employeeCode.trim()) { setError("请填写员工编号。"); return; }
      attempt.current = { key: createIdempotencyKey("hr-candidate-convert"), body: {
        employeeCode: employeeCode.trim(), ...(hireDate ? { hireDate } : {}),
        ...(positionId ? { positionId } : {}), ...(workLocation.trim() ? { workLocation: workLocation.trim() } : {})
      } };
    }
    saving.current = true; setSending(true); setError(""); onBusyChange(true);
    const current = attempt.current;
    try {
      const receipt = await hrApi.convertRecruitmentCandidate(candidate.id, current.body, getAccessToken(), current.key);
      if (!receipt || receipt.candidateId !== candidate.id || !uuid.test(receipt.employeeId)
        || !uuid.test(receipt.checklistId) || receipt.employeeStatus !== "preboarding" || receipt.loginCreated !== false) {
        throw new Error("录用回执不完整，结果待确认，请保留原请求重试。");
      }
      if (!mounted.current) return;
      attempt.current = null; setUncertain(false); onBusyChange(false); onConverted(receipt, candidate, current.body.employeeCode);
    } catch (failure) {
      if (!mounted.current) return;
      const message = hrLoadErrorMessage(failure, "转入预入职失败");
      const messages: Record<string, string> = {
        HR_CANDIDATE_PROFILE_TARGET_CONFLICT: "候选人与已有员工档案资料不一致，请核对后再办理，已有资料未被覆盖。",
        HR_CANDIDATE_PROFILE_IDENTITY_CONFLICT: "证件已关联其他员工，请核对人员身份后再办理。",
        HR_CANDIDATE_PROFILE_SOURCE_CONFLICT: "候选人资料不完整或无法读取，请先核对候选人资料。",
        HR_CANDIDATE_PROFILE_LENGTH_CONFLICT: "联系方式超出员工档案长度，请修正候选人资料后再办理。"
      };
      setError(messages[message] ?? message);
      if (definiteRejection(failure)) { attempt.current = null; setUncertain(false); onBusyChange(false); }
      else setUncertain(true);
    } finally {
      saving.current = false; if (mounted.current) setSending(false);
    }
  };
  return <form className={styles.formGrid} aria-label="转入预入职办理" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <label className="form-field"><span>员工编号</span><input value={employeeCode} required maxLength={64} disabled={locked} onChange={event => setCode(event.target.value)} /></label>
    <label className="form-field"><span>预计入职日</span><input type="date" value={hireDate} disabled={locked} onChange={event => setDate(event.target.value)} /></label>
    <label className="form-field"><span>岗位</span><select value={positionId} disabled={locked} onChange={event => setPosition(event.target.value)}><option value="">沿用需求岗位</option>{positions.map(position => <option key={position.id} value={position.id}>{position.positionName}</option>)}</select></label>
    <label className="form-field"><span>工作地点</span><input value={workLocation} maxLength={128} disabled={locked} onChange={event => setLocation(event.target.value)} /></label>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {uncertain ? <p role="status">办理结果待确认，已保留原申请。请使用原请求重试，确认前暂不切换人员或重新录用。</p> : null}
    <button className="ds-button ds-button-primary" disabled={disabled || sending}>{sending ? "正在办理…" : uncertain ? "原请求重试" : "转入预入职"}</button>
  </form>;
}
