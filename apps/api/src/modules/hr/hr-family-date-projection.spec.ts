import assert from "node:assert/strict";
import test from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { HrLifecycleService } from "./hr-lifecycle.service";

const scope = { tenantId: "synthetic-tenant", parkId: "synthetic-park" };
const employeeId = "00000000-0000-4000-8000-000000000101";

for (const full of [true, false]) {
  test(`family ${full ? "full" : "self"} read projects leap dates and null without timezone conversion`, async () => {
    let familyReads = 0;
    let audits = 0;
    const db = {
      query: async (sql: string, parameters: unknown[]) => {
        if (sql.includes("SELECT 1 FROM hr_employee")) return [{ exists: 1 }];
        if (sql.includes("WHERE tenant_id=$1 AND park_id=$2 AND user_id=$3")) return [{ id: employeeId }];
        if (!sql.includes("FROM hr_employee_family")) return [];
        familyReads += 1;
        // This mocked-service contract checks the SQL boundary; it does not execute PostgreSQL.
        assert.match(sql, /to_char\(birth_date, 'YYYY-MM-DD'\) "birthDate"/u);
        assert.doesNotMatch(sql, /birth_date\s+"birthDate"|AT TIME ZONE|birth_date::text/u);
        assert.deepEqual(parameters, [scope.tenantId, scope.parkId, employeeId]);
        assert.equal(sql.includes('full_name_encrypted "fullNameEncrypted"'), full);
        return ["2000-02-29", null].map((birthDate, index) => ({
          id: `synthetic-family-${index}`,
          relationship: "合成关系",
          fullNameMasked: "合成**",
          birthDate,
          ...(full ? { fullNameEncrypted: "encrypted-synthetic-name" } : {}),
        }));
      },
    };
    const service = new HrLifecycleService(
      db as never,
      { decrypt: (value: string | null) => value ? "合成姓名" : null } as never,
      { recordOperationRequired: async () => { audits += 1; } } as never,
    );
    const result = await service.listRecords(scope, {
      sub: "00000000-0000-4000-8000-000000000001",
      username: "synthetic-reader",
      ...scope,
      roles: [],
      permissions: full
        ? [HR_PERMISSIONS.HR_EMPLOYEE_RECORD_READ, HR_PERMISSIONS.HR_EMPLOYEE_FAMILY_READ]
        : [HR_PERMISSIONS.HR_EMPLOYEE_RECORD_SELF_READ],
    }, employeeId);

    assert.equal(familyReads, 1);
    assert.equal(audits, 1);
    assert.equal(result.fieldAccess.family, true);
    assert.deepEqual([result.family[0]?.birthDate, result.family[1]?.birthDate], ["2000-02-29", null]);
    const wire = JSON.stringify(result.family);
    assert.match(wire, /"birthDate":"2000-02-29"/u);
    assert.match(wire, /"birthDate":null/u);
    assert.doesNotMatch(wire, /2000-02-28|T00:|T16:|fullNameEncrypted/u);
    assert.equal("fullName" in result.family[0], full);
  });
}
