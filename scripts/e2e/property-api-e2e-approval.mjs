const delay = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

export async function approveAndWait({ request, token, createKey, assert, submission, label }) {
  const requestId = submission?.request?.requestId ?? submission?.requestId;
  assert(typeof requestId === "string", `${label} returns a pending approval request`);
  const detail = await request(`/property/approvals/${requestId}`, { token });
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
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const current = await request(`/property/approvals/${requestId}`, { token });
    if (current.request.decisionStatus === "approved" && current.request.executionStatus === "executed") {
      assert(true, `${label} approval executed`);
      return current;
    }
    if (["execution_failed", "infra_exhausted", "not_required"].includes(current.request.executionStatus)) {
      throw new Error(`${label} approval ended with ${current.request.executionStatus}`);
    }
    await delay(250);
  }
  throw new Error(`${label} approval did not execute within 40 seconds`);
}
