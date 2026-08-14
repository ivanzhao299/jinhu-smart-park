const delay = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
const defaultApprovalWaitDeadlineMs = 90000;
const configuredApprovalWaitDeadlineMs = Number.parseInt(process.env.PROPERTY_API_E2E_APPROVAL_WAIT_MS ?? "", 10);
const approvalWaitDeadlineMs =
  Number.isFinite(configuredApprovalWaitDeadlineMs) && configuredApprovalWaitDeadlineMs > 0
    ? configuredApprovalWaitDeadlineMs
    : defaultApprovalWaitDeadlineMs;
const approvalDetailTimeoutMs = 5000;
const approvalWaitDeadlineSeconds = Math.round(approvalWaitDeadlineMs / 1000);

function summarizeApproval(current) {
  const request = current?.request ?? {};
  return JSON.stringify({
    requestId: request.requestId ?? request.id ?? null,
    decisionStatus: request.decisionStatus ?? null,
    executionStatus: request.executionStatus ?? null,
    executionAttempts: request.executionAttempts ?? request.attemptCount ?? null,
    nextRetryAt: request.nextRetryAt ?? null,
    lastErrorCode: request.lastErrorCode ?? null,
    lastErrorMessage: request.lastErrorMessage ?? null,
    workerId: request.workerId ?? null
  });
}

async function requestApprovalDetail({ request, requestId, token, label, attempt, deadlineAt }) {
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) throw new Error(`${label} approval did not execute within ${approvalWaitDeadlineSeconds} seconds`);
  const controller = new AbortController();
  let timeout;
  try {
    return await Promise.race([
      request(`/property/approvals/${requestId}`, { token, signal: controller.signal }),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error(`${label} approval detail request timed out on attempt ${attempt}`));
        }, Math.min(approvalDetailTimeoutMs, remainingMs));
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export async function approveAndWait({ request, token, createKey, assert, submission, label }) {
  const requestId = submission?.request?.requestId ?? submission?.requestId;
  assert(typeof requestId === "string", `${label} returns a pending approval request`);
  const deadlineAt = Date.now() + approvalWaitDeadlineMs;
  const detail = await requestApprovalDetail({ request, requestId, token, label, attempt: "initial", deadlineAt });
  const stage = detail.stages.find((candidate) => candidate.stageStatus === "pending");
  assert(Boolean(stage), `${label} exposes a pending approval stage`);
  const clientKey = createKey(`approve-${label}`);
  await request(`/property/approvals/${requestId}/decisions`, {
    method: "POST",
    token,
    idempotent: true,
    idempotencyKey: clientKey,
    body: {
      clientKey,
      decision: "approve",
      reason: `Property API E2E approval: ${label}`,
      stageId: stage.stageId,
      expectedStageVersion: stage.version,
      expectedRequestVersion: detail.request.decisionVersion
    }
  });
  let lastDetail = detail;
  for (let attempt = 1; Date.now() < deadlineAt; attempt += 1) {
    const current = await requestApprovalDetail({ request, requestId, token, label, attempt, deadlineAt });
    lastDetail = current;
    if (current.request.decisionStatus === "approved" && current.request.executionStatus === "executed") {
      assert(true, `${label} approval executed`);
      return current;
    }
    if (["execution_failed", "infra_exhausted", "not_required"].includes(current.request.executionStatus)) {
      throw new Error(`${label} approval ended with ${current.request.executionStatus}: ${summarizeApproval(current)}`);
    }
    await delay(Math.min(250, Math.max(0, deadlineAt - Date.now())));
  }
  throw new Error(`${label} approval did not execute within ${approvalWaitDeadlineSeconds} seconds: ${summarizeApproval(lastDetail)}`);
}
