const fail = detail => {
  const error = new Error(`YUZHOU_UAT_CONTRACT_FAILED: ${detail}`);
  error.code = "YUZHOU_UAT_CONTRACT_FAILED";
  throw error;
};
const uuid = value => typeof value === "string" && /^[0-9a-f-]{36}$/iu.test(value);
const data = response => response?.body?.data;
const items = response => Array.isArray(data(response)?.items) ? data(response).items : [];
const salaryAbsent = value => value && typeof value === "object" && !("baseSalary" in value) && !("probationSalary" in value);

export async function runYuzhouContractScenario({ runner, inspect, employeeId, contractTypeId, otherContractId, businessDate, contractNo }) {
  if (!runner?.execute || !inspect?.auditCount || !inspect?.contractNoCount || !uuid(employeeId) || !uuid(contractTypeId) || !uuid(otherContractId) || !/^\d{4}-\d{2}-\d{2}$/u.test(businessDate ?? "") || !/^UAT-[A-Z0-9-]{6,48}$/u.test(contractNo ?? "")) fail("invalid dependencies");
  const observations = [];
  let contractId;
  const body = { employeeId, contractTypeId, contractNo, startDate: businessDate, positionTitle: "隔离演练岗位", workType: "全日制", probationMonths: 0, probationSalary: "1000.00", baseSalary: "2000.00" };
  observations.push(await runner.execute({
    legacyId: 37,
    kind: "positive",
    checkId: "hr_manages_contract",
    bodies: [body, { action: "activate" }],
    afterOperation: ({ index, response }) => {
      if (index !== 0) return undefined;
      contractId = data(response)?.id;
      if (!uuid(contractId)) fail("created contract id missing");
      return { contractId };
    },
    assert: async responses => ({
      created_id: uuid(contractId),
      status_active: data(responses[1])?.status === "active",
      salary_retained_for_hr: data(responses[1])?.baseSalary === "2000.00" && data(responses[1])?.probationSalary === "1000.00",
      audit_written: await inspect.auditCount(contractId) >= 1
    })
  }));
  observations.push(await runner.execute({
    legacyId: 37,
    kind: "positive",
    checkId: "manager_reads_team_contract_without_salary",
    substitutions: { contractId },
    bodies: [undefined],
    assert: responses => ({ team_projection: data(responses[0])?.id === contractId, salary_fields_absent: salaryAbsent(data(responses[0])) })
  }));
  observations.push(await runner.execute({
    legacyId: 37,
    kind: "positive",
    checkId: "employee_reads_self_contract_without_salary",
    bodies: [undefined],
    assert: responses => {
      const own = items(responses[0]).find(item => item?.id === contractId);
      return { self_projection: Boolean(own), salary_fields_absent: salaryAbsent(own) };
    }
  }));
  const forbiddenNo = `${contractNo}-DENY`;
  observations.push(await runner.execute({
    legacyId: 37,
    kind: "negative",
    checkId: "manager_cannot_manage_contract",
    bodies: [{ ...body, contractNo: forbiddenNo }],
    assert: async () => ({ no_contract_created: await inspect.contractNoCount(forbiddenNo) === 0 })
  }));
  observations.push(await runner.execute({
    legacyId: 37,
    kind: "negative",
    checkId: "employee_cannot_read_other_contract",
    substitutions: { otherContractId },
    bodies: [undefined],
    assert: responses => ({ no_target_disclosure: [403, 404].includes(responses[0]?.status), salary_fields_absent: !data(responses[0]) || salaryAbsent(data(responses[0])) })
  }));
  return { contractId, observations };
}
