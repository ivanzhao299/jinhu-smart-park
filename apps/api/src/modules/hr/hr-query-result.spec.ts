import assert from "node:assert/strict";
import test from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrOnboardingService } from "./hr-onboarding.service";
import { firstHrMutationRow } from "./hr-query-result";
import { HrTalentService } from "./hr-talent.service";

const scope = { tenantId: "tenant", parkId: "park" };
const actor: JwtPrincipal = {
  sub: "00000000-0000-4000-8000-000000000001",
  username: "hr-mutation-test",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: [HR_PERMISSIONS.HR_TALENT_REVIEW],
};

test("normalizes PostgreSQL mutation RETURNING result shapes", () => {
  const row = { id: "row-1", status: "submitted" };

  assert.equal(firstHrMutationRow([row]), row);
  assert.equal(firstHrMutationRow([[row], 1]), row);
});

test("returns undefined when a mutation returned no row", () => {
  assert.equal(firstHrMutationRow([]), undefined);
  assert.equal(firstHrMutationRow([[], 0]), undefined);
  assert.equal(firstHrMutationRow(undefined), undefined);
});

test("onboarding actions project the row from TypeORM's wrapped UPDATE result", async () => {
  const application = {
    id: "00000000-0000-4000-8000-000000000010",
    employee_id: "00000000-0000-4000-8000-000000000011",
    candidate_id: null,
    applicant_user_id: actor.sub,
    status: "draft",
    application_date: "2026-08-28",
    planned_hire_date: "2026-08-28",
    probation_months: 0,
    attendance_card_no: "CARD-1",
    application_name: "Test onboarding",
  };
  let call = 0;
  const manager = {
    query: async () => {
      call += 1;
      if (call === 1) return [application];
      if (call === 2) return [[{ ...application, status: "cancelled" }], 1];
      return [];
    },
  };
  const db = {
    transaction: async (work: (m: typeof manager) => unknown) => work(manager),
  } as unknown as DataSource;

  const result = await new HrOnboardingService(db).act(scope, actor, application.id, {
    action: "cancel",
  });

  assert.equal(result.status, "cancelled");
});

test("talent activation accepts one wrapped UPDATE row instead of the wrapper length", async () => {
  const manager = {
    query: async () => [[{ id: "session-1", status: "active" }], 1],
  };
  const db = {
    transaction: async (work: (m: typeof manager) => unknown) => work(manager),
  } as unknown as DataSource;

  const result = await new HrTalentService(db, {} as never, {} as never).activateSession(
    scope,
    actor,
    "session-1",
  );

  assert.deepEqual(result, { id: "session-1", status: "active" });
});
