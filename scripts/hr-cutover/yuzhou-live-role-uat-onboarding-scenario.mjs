const fail = detail => { const error = new Error(`YUZHOU_UAT_ONBOARDING_FAILED: ${detail}`); error.code = "YUZHOU_UAT_ONBOARDING_FAILED"; throw error; };
const uuid = value => typeof value === "string" && /^[0-9a-f-]{36}$/iu.test(value);
const data = response => response?.body?.data;

export async function runYuzhouOnboardingScenario({ runner, inspect, employeeId, businessDate, attendanceCardNo }) {
  if (!runner?.execute || !inspect?.applicationStatus || !inspect?.employeeStatus || !inspect?.auditCount || !inspect?.makerReviewSuccessCount || !uuid(employeeId) || !/^\d{4}-\d{2}-\d{2}$/u.test(businessDate ?? "") || !/^\d{6,20}$/u.test(attendanceCardNo ?? "")) fail("invalid dependencies");
  const observations = [];
  let onboardingId;
  observations.push(await runner.execute({
    legacyId: 34, kind: "positive", checkId: "hr_maker_create_submit",
    bodies: [{ applicationName: "隔离入职演练", employeeId, applicationDate: businessDate, plannedHireDate: businessDate, probationMonths: 3, attendanceCardNo }, { action: "submit" }],
    afterOperation: ({ index, response }) => { if (index !== 0) return undefined; onboardingId = data(response)?.id; if (!uuid(onboardingId)) fail("created id missing"); return { onboardingId }; },
    assert: async responses => ({ created_id: uuid(onboardingId), status_submitted: data(responses[1])?.status === "submitted", audit_written: await inspect.auditCount(onboardingId) >= 1 })
  }));
  const submitted = await inspect.applicationStatus(onboardingId);
  observations.push(await runner.execute({
    legacyId: 34, kind: "negative", checkId: "maker_cannot_review_own", substitutions: { makerOwnedOnboardingId: onboardingId }, bodies: [{ action: "approve" }],
    assert: async () => ({ no_state_change: (await inspect.applicationStatus(onboardingId)) === submitted, no_success_audit: await inspect.makerReviewSuccessCount(onboardingId) === 0 })
  }));
  observations.push(await runner.execute({
    legacyId: 34, kind: "negative", checkId: "employee_cannot_list_all", bodies: [undefined],
    assert: responses => ({ no_rows_disclosed: responses[0]?.status === 403 && !data(responses[0]) })
  }));
  observations.push(await runner.execute({
    legacyId: 34, kind: "positive", checkId: "hr_reviewer_approve", substitutions: { onboardingId }, bodies: [{ action: "approve" }],
    assert: async responses => ({ status_approved: data(responses[0])?.status === "approved", audit_written: await inspect.auditCount(onboardingId) >= 2 })
  }));
  observations.push(await runner.execute({
    legacyId: 34, kind: "positive", checkId: "hr_reviewer_confirm", substitutions: { onboardingId }, bodies: [undefined],
    assert: async responses => ({ status_confirmed: data(responses[0])?.status === "confirmed", employee_state_changed: await inspect.employeeStatus(employeeId) === "probation", audit_written: await inspect.auditCount(onboardingId) >= 3 })
  }));
  return { onboardingId, observations };
}
