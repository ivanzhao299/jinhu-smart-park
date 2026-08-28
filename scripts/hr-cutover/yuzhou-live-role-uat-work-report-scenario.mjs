const fail = detail => {
  const error = new Error(`YUZHOU_UAT_WORK_REPORT_FAILED: ${detail}`);
  error.code = "YUZHOU_UAT_WORK_REPORT_FAILED";
  throw error;
};

const data = response => response?.body?.data;
const rows = response => {
  const value = data(response);
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  return [];
};
const uuid = value => typeof value === "string" && /^[0-9a-f-]{36}$/iu.test(value);

export async function runYuzhouWorkReportScenario({ runner, inspect, otherWorkReportId, businessDate }) {
  if (!runner?.execute || !inspect?.reportState || !inspect?.auditCount || !uuid(otherWorkReportId) || !/^\d{4}-\d{2}-\d{2}$/u.test(businessDate ?? "")) {
    fail("invalid dependencies");
  }
  const observations = [];
  let workReportId;
  const initial = {
    reportType: "daily",
    periodStart: businessDate,
    periodEnd: businessDate,
    title: "隔离演练日报",
    completedWork: "完成隔离演练",
    nextPlan: "继续验证",
    hours: 1
  };
  const updated = { ...initial, completedWork: "完成隔离演练并复核", nextPlan: "形成证据闭环", hours: 2 };
  observations.push(await runner.execute({
    legacyId: 313,
    kind: "positive",
    checkId: "employee_create_update_submit",
    bodies: [initial, updated, undefined],
    afterOperation: ({ index, response }) => {
      if (index !== 0) return undefined;
      const id = data(response)?.id;
      if (!uuid(id)) fail("created report id missing");
      workReportId = id;
      return { workReportId: id };
    },
    assert: async responses => ({
      created_id: uuid(workReportId),
      draft_updated: data(responses[1])?.completedWork === updated.completedWork,
      status_submitted: data(responses[2])?.status === "submitted",
      audit_written: await inspect.auditCount(workReportId) >= 1
    })
  }));
  if (!uuid(workReportId)) fail("work report chain incomplete");

  observations.push(await runner.execute({
    legacyId: 313,
    kind: "positive",
    checkId: "manager_reads_team_and_reviews",
    substitutions: { workReportId },
    bodies: [undefined, { action: "confirmed", comment: "隔离演练复核" }],
    assert: async responses => ({
      team_row_present: rows(responses[0]).some(item => item?.id === workReportId),
      status_confirmed: data(responses[1])?.status === "confirmed",
      audit_written: await inspect.auditCount(workReportId) >= 2
    })
  }));

  observations.push(await runner.execute({
    legacyId: 313,
    kind: "positive",
    checkId: "employee_reads_action_history",
    substitutions: { workReportId },
    bodies: [undefined],
    assert: responses => {
      const actions = rows(responses[0]);
      return {
        self_action_history: actions.some(item => item?.actionType === "confirmed"),
        review_actor_not_disclosed: actions.every(item => !("actorUserId" in item) && !("actor_user_id" in item))
      };
    }
  }));

  const confirmedState = await inspect.reportState(workReportId);
  observations.push(await runner.execute({
    legacyId: 313,
    kind: "negative",
    checkId: "employee_cannot_review",
    substitutions: { workReportId },
    bodies: [{ action: "confirmed" }],
    assert: async () => ({ no_state_change: (await inspect.reportState(workReportId)) === confirmedState })
  }));

  observations.push(await runner.execute({
    legacyId: 313,
    kind: "negative",
    checkId: "employee_cannot_read_other_report",
    substitutions: { otherWorkReportId },
    bodies: [undefined],
    assert: responses => ({ no_target_disclosure: [403, 404].includes(responses[0]?.status) })
  }));

  return { workReportId, observations };
}
