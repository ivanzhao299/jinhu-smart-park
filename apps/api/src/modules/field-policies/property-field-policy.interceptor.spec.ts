import assert from "node:assert/strict";
import test from "node:test";
import { firstValueFrom, of } from "rxjs";
import { HomestayFieldPolicyInterceptor, HousingFieldPolicyInterceptor } from "./property-field-policy.interceptor";
import { FieldPolicyService } from "./field-policy.service";

const actor = {
  sub: "user-1", username: "operator", tenantId: "tenant-a", parkId: "park-a",
  roles: [], permissions: []
};

function context(method: string, user: typeof actor | undefined, originalUrl = "/housing/leases/lease-1") {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, originalUrl, user }) })
  } as never;
}

test("property field-policy interceptors project every authenticated GET with the owning module", async () => {
  const calls: unknown[][] = [];
  const policies = {
    applyFieldPoliciesToProjection: async (...args: unknown[]) => {
      calls.push(args);
      return { projected: true };
    }
  };
  const homestay = new HomestayFieldPolicyInterceptor(policies as never);
  const housing = new HousingFieldPolicyInterceptor(policies as never);

  assert.deepEqual(await firstValueFrom(homestay.intercept(context("GET", actor, "/api/v1/homestay/bookings/booking-1"), { handle: () => of({ raw: true }) })), { projected: true });
  assert.deepEqual(await firstValueFrom(housing.intercept(context("GET", actor, "/api/v1/housing/leases/lease-1"), { handle: () => of({ raw: true }) })), { projected: true });
  assert.deepEqual(calls.map((call) => call[2]), ["homestay", "housing_rental"]);
  assert.deepEqual(calls.map((call) => call[4]), ["booking", "lease"]);
  assert.deepEqual(calls.map((call) => call[0]), [
    { tenantId: "tenant-a", parkId: "park-a" },
    { tenantId: "tenant-a", parkId: "park-a" }
  ]);
});

test("property field-policy interceptors leave mutations and unauthenticated reads untouched", async () => {
  let calls = 0;
  const interceptor = new HomestayFieldPolicyInterceptor({
    applyFieldPoliciesToProjection: async () => { calls += 1; return {}; }
  } as never);
  const payload = { request: { requestId: "approval-1" } };
  assert.equal(await firstValueFrom(interceptor.intercept(context("POST", actor), { handle: () => of(payload) })), payload);
  assert.equal(await firstValueFrom(interceptor.intercept(context("GET", undefined), { handle: () => of(payload) })), payload);
  assert.equal(calls, 0);
});

test("property field-policy interceptors declare their injectable policy dependency", () => {
  assert.deepEqual(Reflect.getMetadata("design:paramtypes", HomestayFieldPolicyInterceptor), [FieldPolicyService]);
  assert.deepEqual(Reflect.getMetadata("design:paramtypes", HousingFieldPolicyInterceptor), [FieldPolicyService]);
});
