import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PropertyApprovalExecutionWorker } from "./property-approval.execution.worker";
import type { PropertyApprovalRepository } from "./property-approval.repository";
import type { PropertyApprovalService } from "./property-approval.service";

describe("PropertyApprovalExecutionWorker", () => {
  it("claims and executes every due approved request", async () => {
    const calls: string[] = [];
    const repository = {
      listExecutionCandidates: async () => [{
        requestId: "11111111-1111-4111-8111-111111111111",
        tenantId: "tenant",
        parkId: "park"
      }]
    } as unknown as PropertyApprovalRepository;
    const approvals = {
      claimExecution: async (_scope: unknown, requestId: string, workerId: string) => {
        calls.push(`claim:${requestId}:${workerId}`);
        return { requestId };
      },
      executeClaim: async (_scope: unknown, claim: { requestId: string }) => {
        calls.push(`execute:${claim.requestId}`);
      }
    } as unknown as PropertyApprovalService;
    const result = await new PropertyApprovalExecutionWorker(repository, approvals)
      .run({ workerId: "worker" });
    assert.deepEqual(result, { candidates: 1, executed: 1, skipped: 0, failed: 0 });
    assert.deepEqual(calls, [
      "claim:11111111-1111-4111-8111-111111111111:worker",
      "execute:11111111-1111-4111-8111-111111111111"
    ]);
  });
});
