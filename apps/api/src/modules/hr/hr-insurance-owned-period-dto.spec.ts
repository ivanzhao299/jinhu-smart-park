import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { HR_INSURANCE_KINDS } from "./hr-insurance-calculation";
import { CloseHrInsuranceOwnedPeriodDto, ConfirmHrInsuranceOwnedPeriodDto, CorrectHrInsuranceOwnedPeriodDto, CreateHrInsuranceOwnedPreviewDto, HrInsuranceOwnedPeriodListQueryDto } from "./dto/hr-insurance-owned-period.dto";

const id = "00000000-0000-4000-8000-000000000001";
const hash = "a".repeat(64);
const preview = () => ({ requestId: id, employeeId: id, expectedEmployeeVersion: 1, policyVersionId: id,
  expectedDefinitionHash: hash, periodMonth: "2026-10", includeFund: false,
  bases: HR_INSURANCE_KINDS.map(insuranceKind => ({ insuranceKind, contributionBase: "1234.56" })) });
const confirm = () => ({ requestId: id, previewId: id, expectedPreviewHash: hash, reason: "业务核对" });
const options = { whitelist: true, forbidNonWhitelisted: true };

test("owned preview requires explicit exact bases and refuses client financial factors", async () => {
  assert.equal((await validate(plainToInstance(CreateHrInsuranceOwnedPreviewDto, preview()), options)).length, 0);
  for (const patch of [{ includeFund: "false" }, { expectedEmployeeVersion: "1" }, { expectedDefinitionHash: "b" },
    { periodMonth: "2026-13" }, { periodMonth: "1899-12" }, { periodMonth: "2101-01" },
    { rates: [] }, { totals: {} }, { bases: [...preview().bases.slice(0, 5), preview().bases[0]] },
    { bases: preview().bases.map(x => ({ ...x, contributionBase: "1.001" })) },
    { bases: preview().bases.map(x => ({ ...x, contributionBase: 100 })) }]) {
    assert.ok((await validate(plainToInstance(CreateHrInsuranceOwnedPreviewDto, { ...preview(), ...patch }), options)).length);
  }
});

test("confirm, close and correction require independent request and observed version evidence", async () => {
  assert.equal((await validate(plainToInstance(ConfirmHrInsuranceOwnedPeriodDto, confirm()), options)).length, 0);
  assert.equal((await validate(plainToInstance(CorrectHrInsuranceOwnedPeriodDto, { ...confirm(), previousRevisionId: id, expectedPeriodVersion: 2 }), options)).length, 0);
  assert.equal((await validate(plainToInstance(CloseHrInsuranceOwnedPeriodDto, { requestId: id, revisionId: id, expectedPeriodVersion: 1, reason: "关账核对" }), options)).length, 0);
  assert.ok((await validate(plainToInstance(CorrectHrInsuranceOwnedPeriodDto, confirm()), options)).length);
  for (const patch of [{ reason: "  " }, { expectedPreviewHash: hash.toUpperCase() }, { previewId: null }, { requestId: null }, { amounts: [] }]) {
    assert.ok((await validate(plainToInstance(ConfirmHrInsuranceOwnedPeriodDto, { ...confirm(), ...patch }), options)).length);
  }
});

test("owned period list accepts only explicit month, state and revision filters", async () => {
  const valid = { page: "2", page_size: "100", keyword: "员工", period_month: "2026-10", status: "closed", revision: "history" };
  assert.equal((await validate(plainToInstance(HrInsuranceOwnedPeriodListQueryDto, valid), options)).length, 0);
  for (const patch of [{ period_month: "2026-13" }, { period_month: "2026-1" }, { status: "open" }, { revision: "latest" }, { page_size: "101" }]) {
    assert.ok((await validate(plainToInstance(HrInsuranceOwnedPeriodListQueryDto, { ...valid, ...patch }), options)).length);
  }
});
