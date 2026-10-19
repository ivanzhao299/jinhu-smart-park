"use client";

import { useEffect, useRef, useState } from "react";
import { createIdempotencyKey } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import type { HrOnboardingApplication } from "../../../lib/hr-api";
import { hrLoadErrorMessage } from "../hr-errors";

export type InitialOnboardingBody = {
  applicationName: string; employeeId: string; candidateId?: string;
  applicationDate: string; plannedHireDate: string; probationMonths: number;
  attendanceCardNo: string; remark?: string;
};
type Expected = {
  employeeId: string; candidateId: string | null; status: string; applicantUserId?: string;
  original?: HrOnboardingApplication; body?: InitialOnboardingBody;
  reviewComment?: string; confirmed?: boolean;
};
const timestamp = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));

export function acceptInitialOnboardingReceipt(receipt: HrOnboardingApplication, expected: Expected) {
  if (!receipt || typeof receipt.id !== "string" || !receipt.id || receipt.entryType !== "initial"
    || receipt.employeeId !== expected.employeeId || receipt.candidateId !== expected.candidateId
    || receipt.status !== expected.status || !Number.isInteger(receipt.version)
    || Number(receipt.version) <= (expected.original?.version ?? 0)
    || typeof receipt.applicationNo !== "string" || !receipt.applicationNo.trim()
    || (expected.original && receipt.id !== expected.original.id)
    || (expected.reviewComment !== undefined && (!timestamp(receipt.reviewedAt) || receipt.reviewComment !== expected.reviewComment))
    || (expected.confirmed && !timestamp(receipt.confirmedAt))) {
    throw new Error("入职办理回执不完整，结果待确认，请重试原请求。");
  }
  if (expected.body) {
    const fields: (keyof InitialOnboardingBody)[] = ["applicationName", "employeeId", "candidateId", "applicationDate", "plannedHireDate", "probationMonths", "attendanceCardNo", "remark"];
    if (fields.some(field => (receipt[field] ?? null) !== (field === "candidateId" ? expected.body?.candidateId ?? null : expected.body?.[field] ?? null))) {
      throw new Error("入职保存回执与本次填写内容不一致，结果待确认，请重试原请求。");
    }
  }
  return { ...expected.original, ...receipt,
    applicantUserId: receipt.applicantUserId ?? expected.original?.applicantUserId ?? expected.applicantUserId,
    employeeName: receipt.employeeName ?? expected.original?.employeeName,
    employeeCode: receipt.employeeCode ?? expected.original?.employeeCode };
}

type Operation = {
  send: (key: string, token: string | undefined) => Promise<HrOnboardingApplication>;
  expected: Expected; message: string; onSuccess?: () => void;
};
type Attempt = Operation & { key: string; token: string | undefined };

function definiteRejection(error: unknown) {
  const failure = error as { status?: number; message?: string };
  return typeof failure?.status === "number" && failure.status >= 400 && failure.status < 500 && failure.status !== 408
    && !(failure.status === 409 && /idempotency.*(processing|does not match|reservation changed)/i.test(failure.message ?? ""));
}

export function useInitialOnboardingOperation(options: {
  blocked: () => boolean; onBusyChange: (busy: boolean) => void;
  onReceipt: (row: HrOnboardingApplication, created: boolean) => void;
}) {
  const [sending, setSending] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{ row: HrOnboardingApplication; message: string } | null>(null);
  const attempt = useRef<Attempt | null>(null), saving = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const execute = async (current: Attempt) => {
    saving.current = true; setSending(true); setError(""); options.onBusyChange(true);
    try {
      const raw = await current.send(current.key, current.token);
      if (!alive.current) return;
      const row = acceptInitialOnboardingReceipt(raw, current.expected);
      attempt.current = null; setUncertain(false); options.onBusyChange(false);
      setReceipt({ row, message: current.message }); options.onReceipt(row, !current.expected.original); current.onSuccess?.();
    } catch (failure) {
      if (!alive.current) return;
      const detail = failure as { status?: number; message?: string };
      setError(detail?.status === 409 && /idempotency/i.test(detail.message ?? "")
        ? "入职办理结果仍待确认，请稍后重试原请求。"
        : hrLoadErrorMessage(failure, "办理入职申请失败"));
      if (definiteRejection(failure)) { attempt.current = null; setUncertain(false); options.onBusyChange(false); }
      else setUncertain(true);
    } finally {
      saving.current = false; if (alive.current) setSending(false);
    }
  };
  const run = async (operation: Operation) => {
    if (!alive.current || saving.current || attempt.current || options.blocked()) return;
    const current = { ...operation, key: createIdempotencyKey("hr-initial-onboarding"), token: getAccessToken() };
    attempt.current = current; await execute(current);
  };
  const retry = async () => {
    if (!alive.current || saving.current || !attempt.current || options.blocked()) return;
    await execute(attempt.current);
  };
  return { run, retry, sending, uncertain, error, receipt };
}
