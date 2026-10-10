import {beforeEach, expect, it, vi} from "vitest";
import {apiRequest, createIdempotencyKey} from "../../lib/api-client";
vi.mock("../../lib/api-client", () => ({apiRequest: vi.fn(), createIdempotencyKey: vi.fn()}));
import {hrApi} from "../../lib/hr-api";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiRequest).mockResolvedValue({data: {id: "application", version: 7}} as Awaited<ReturnType<typeof apiRequest>>);
  vi.mocked(createIdempotencyKey).mockReturnValue("generated-key");
});

it("all five onboarding adapters preserve supplied keys, identity and structured request bodies", async () => {
  const body = {entryType: "rehire", employeeId: "employee", probationMonths: 0};
  const responses = await Promise.all([
    hrApi.createOnboardingApplication(body, "actor-token", "original-key"),
    hrApi.updateOnboardingApplication("application", body, "actor-token", "original-key"),
    hrApi.onboardingApplicationAction("application", "resubmit", "actor-token", "original-key"),
    hrApi.reviewOnboardingApplication("application", "return", "补充任职说明", "actor-token", "original-key"),
    hrApi.confirmOnboardingApplication("application", "actor-token", "original-key"),
  ]);
  expect(responses.every(row => row.version === 7)).toBe(true);
  expect(apiRequest).toHaveBeenCalledTimes(5);
  const calls = vi.mocked(apiRequest).mock.calls;
  expect(calls.map(call => call[0])).toEqual([
    "/hr/onboarding-applications", "/hr/onboarding-applications/application",
    "/hr/onboarding-applications/application/actions", "/hr/onboarding-applications/application/review",
    "/hr/onboarding-applications/application/confirm",
  ]);
  expect(calls.map(call => call[1]?.method)).toEqual(["POST", "PUT", "POST", "POST", "POST"]);
  for (const call of calls) expect(call[1]).toEqual(expect.objectContaining({token: "actor-token", idempotencyKey: "original-key"}));
  expect(calls.map(call => call[1]?.body)).toEqual([body, body, {action: "resubmit"}, {action: "return", comment: "补充任职说明"}, undefined]);
  expect(createIdempotencyKey).not.toHaveBeenCalled();
});

it("all five existing callers retain generated keys when the optional key is omitted", async () => {
  await hrApi.createOnboardingApplication({}, "actor-token");
  await hrApi.updateOnboardingApplication("application", {}, "actor-token");
  await hrApi.onboardingApplicationAction("application", "submit", "actor-token");
  await hrApi.reviewOnboardingApplication("application", "approve", "", "actor-token");
  await hrApi.confirmOnboardingApplication("application", "actor-token");
  expect(vi.mocked(createIdempotencyKey).mock.calls.map(call => call[0])).toEqual([
    "hr-onboarding-create", "hr-onboarding-update", "hr-onboarding-submit", "hr-onboarding-approve", "hr-onboarding-confirm",
  ]);
  for (const call of vi.mocked(apiRequest).mock.calls) expect(call[1]).toEqual(expect.objectContaining({token: "actor-token", idempotencyKey: "generated-key"}));
});
