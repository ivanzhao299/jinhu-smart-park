import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AdjustHrPayslipDto, AssignHrCompensationDto } from "./dto/hr.dto";
import { addHrMoney, hrCentsToMoney, hrMoneyToCents, normalizeHrMoney } from "./hr-money";

test("normalizes accepted payroll amounts without binary floating point", () => {
  assert.equal(normalizeHrMoney("0"), "0.00");
  assert.equal(normalizeHrMoney("1.2"), "1.20");
  assert.equal(normalizeHrMoney("9999999999999999.99"), "9999999999999999.99");
});

test("rejects negative, excessive precision, scientific and out-of-range inputs", () => {
  for (const value of ["-0.01", "1.005", "1e3", "01.00", "10000000000000000.00", "NaN", ""]) {
    assert.throws(() => normalizeHrMoney(value), BadRequestException);
  }
});

test("adds one thousand payroll items exactly", () => {
  assert.equal(addHrMoney(...Array.from({ length: 1000 }, () => "0.01")), "10.00");
  assert.equal(addHrMoney("0.10", "0.20"), "0.30");
});

test("converts cents in both directions exactly", () => {
  assert.equal(hrMoneyToCents("123456789.09"), 12345678909n);
  assert.equal(hrCentsToMoney(12345678909n), "123456789.09");
});

test("payroll DTOs require decimal strings with no implicit number coercion", async () => {
  const valid = plainToInstance(AdjustHrPayslipDto, { deductionAmount: "10.20", personalTax: "0", reason: "核对" });
  assert.equal((await validate(valid)).length, 0);

  const numeric = plainToInstance(AdjustHrPayslipDto, { deductionAmount: 10.2, personalTax: 0, reason: "核对" });
  assert.ok((await validate(numeric)).length > 0);

  const excessivePrecision = plainToInstance(AssignHrCompensationDto, {
    employeeId: "33db8ec4-8605-4d75-b9b8-df2e5ae66a30",
    planId: "b455fc01-d945-4b7c-b14b-60b312d41afb",
    effectiveFrom: "2026-08-01",
    baseSalary: "1000.005"
  });
  assert.ok((await validate(excessivePrecision)).length > 0);
});
