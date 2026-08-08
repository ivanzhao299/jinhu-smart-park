import { Injectable, Logger } from "@nestjs/common";
import { PropertyApprovalRepository } from "./property-approval.repository";
import { PropertyApprovalService } from "./property-approval.service";

@Injectable()
export class PropertyApprovalExecutionWorker {
  private readonly logger = new Logger(PropertyApprovalExecutionWorker.name);

  constructor(
    private readonly repository: PropertyApprovalRepository,
    private readonly approvals: PropertyApprovalService
  ) {}

  async run(input: { workerId: string; limit?: number }) {
    const candidates = await this.repository.listExecutionCandidates(input.limit ?? 50);
    const result = { candidates: candidates.length, executed: 0, skipped: 0, failed: 0 };
    for (const candidate of candidates) {
      const scope = { tenantId: candidate.tenantId, parkId: candidate.parkId };
      try {
        const claim = await this.approvals.claimExecution(
          scope,
          candidate.requestId,
          input.workerId
        );
        await this.approvals.executeClaim(scope, claim);
        result.executed += 1;
      } catch (error) {
        const status = typeof error === "object" && error !== null && "getStatus" in error
          ? Number((error as { getStatus: () => number }).getStatus())
          : 0;
        if (status === 409 || status === 403 || status === 404) {
          result.skipped += 1;
          continue;
        }
        result.failed += 1;
        this.logger.warn(
          `Approval execution failed for ${candidate.requestId}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    return result;
  }
}
