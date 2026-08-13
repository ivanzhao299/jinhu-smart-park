const delay = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
const approvalWaitDeadlineMs = 40000;
const approvalDetailTimeoutMs = 5000;

async function requestApprovalDetail({ request, requestId, token, label, attempt, deadlineAt }) {
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) throw new Error(`${label} approval did not execute within 40 seconds`);
  let timeout;
  try {
    return await Promise.race([
      request(`/property/approvals/${requestId}`, { token }),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} approval detail request timed out on attempt ${attempt}`)),
          Math.min(approvalDetailTimeoutMs, remainingMs)
        );
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
  for (let attempt = 1; Date.now() < deadlineAt; attempt += 1) {
    const current = await requestApprovalDetail({ request, requestId, token, label, attempt, deadlineAt });
    if (current.request.decisionStatus === "approved" && current.request.executionStatus === "executed") {
      assert(true, `${label} approval executed`);
      return current;
    }
    if (["execution_failed", "infra_exhausted", "not_required"].includes(current.request.executionStatus)) {
      throw new Error(`${label} approval ended with ${current.request.executionStatus}`);
    }
    await delay(Math.min(250, Math.max(0, deadlineAt - Date.now())));
  }
  throw new Error(`${label} approval did not execute within 40 seconds`);
}
