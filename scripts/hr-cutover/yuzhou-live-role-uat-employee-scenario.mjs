const fail = detail => {
  const error = new Error(`YUZHOU_UAT_EMPLOYEE_FAILED: ${detail}`);
  error.code = "YUZHOU_UAT_EMPLOYEE_FAILED";
  throw error;
};
const uuid = value => typeof value === "string" && /^[0-9a-f-]{36}$/iu.test(value);
const data = response => response?.body?.data;
const sensitiveFields = ["idNumber", "personalMobile", "personalEmail", "address", "emergencyContactName", "emergencyContactMobile"];
const hasNoSensitive = value => value && typeof value === "object" && sensitiveFields.every(field => !(field in value));

export async function runYuzhouEmployeeScenario({ runner, inspect, employeeId, outsideEmployeeId }) {
  if (!runner?.execute || !inspect?.auditCount || !uuid(employeeId) || !uuid(outsideEmployeeId) || employeeId === outsideEmployeeId) fail("invalid dependencies");
  const observations = [];
  observations.push(await runner.execute({
    legacyId: 35,
    kind: "positive",
    checkId: "hr_reads_sensitive_profile",
    substitutions: { profileEmployeeId: employeeId },
    bodies: [undefined],
    assert: async responses => ({
      full_profile_projection: typeof data(responses[0])?.personalMobile === "string" && "idNumber" in data(responses[0]),
      required_audit_written: await inspect.auditCount(employeeId) >= 1
    })
  }));
  observations.push(await runner.execute({
    legacyId: 35,
    kind: "positive",
    checkId: "manager_reads_masked_team_profile",
    substitutions: { teamEmployeeId: employeeId },
    bodies: [undefined],
    assert: responses => ({ masked_projection: data(responses[0])?.id === employeeId, no_sensitive_fields: hasNoSensitive(data(responses[0])) })
  }));
  observations.push(await runner.execute({
    legacyId: 35,
    kind: "positive",
    checkId: "employee_reads_masked_self_profile",
    bodies: [undefined],
    assert: responses => ({ self_projection: data(responses[0])?.id === employeeId, no_sensitive_fields: hasNoSensitive(data(responses[0])) })
  }));
  observations.push(await runner.execute({
    legacyId: 35,
    kind: "negative",
    checkId: "manager_cannot_read_sensitive_profile",
    substitutions: { teamEmployeeId: employeeId },
    bodies: [undefined],
    assert: async responses => ({ no_sensitive_fields: !data(responses[0]) || hasNoSensitive(data(responses[0])), no_success_audit: await inspect.managerProfileSuccessAuditCount(employeeId) === 0 })
  }));
  observations.push(await runner.execute({
    legacyId: 35,
    kind: "negative",
    checkId: "employee_cannot_read_other_employee",
    substitutions: { otherEmployeeId: outsideEmployeeId },
    bodies: [undefined],
    assert: responses => ({ no_target_disclosure: [403, 404].includes(responses[0]?.status) && !data(responses[0])?.id })
  }));
  return { observations };
}
