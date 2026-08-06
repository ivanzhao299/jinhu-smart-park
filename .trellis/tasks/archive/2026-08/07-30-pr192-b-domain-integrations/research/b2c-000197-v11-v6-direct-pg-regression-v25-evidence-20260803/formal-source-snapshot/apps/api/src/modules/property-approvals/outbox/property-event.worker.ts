import { Inject, Injectable, Logger } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import {
  PROPERTY_EVENT_PUBLISHER,
  PROPERTY_EVENT_RUNTIME_STORE,
  type PropertyEventPublisherPort,
  type PropertyEventRuntimeStore
} from "./property-event-runtime.contracts";
import {
  PROPERTY_RUNTIME_CONTROL_PORT,
  type PropertyRuntimeControlPort
} from "../property-approval.ports";

export interface PropertyEventWorkerOptions {
  workerId: string;
  batchSize?: number;
  leaseSeconds?: number;
  maxAttempts?: number;
  retryDelayMs?: (attempt: number) => number;
}

export interface PropertyEventWorkerResult {
  claimed: number;
  published: number;
  retryWaiting: number;
  deadLettered: number;
  staleClaims: number;
  controlDeniedScopes: Array<{
    tenantId: string;
    parkId: string;
    errorCode: string;
  }>;
}

export interface PropertyEventControlDiagnostic {
  tenantId: string;
  parkId: string;
  errorCode: string;
}

const safeErrorCode = (error: unknown) => {
  const candidate = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  return /^[a-z][a-z0-9-]{0,127}$/.test(candidate)
    ? candidate
    : "event-publish-failed";
};

const safeControlErrorCode = (error: unknown) => {
  const response = typeof error === "object" && error !== null && "response" in error
    ? (error as { response?: { errorCode?: unknown } }).response
    : undefined;
  const candidate = String(response?.errorCode ?? "");
  return /^[a-z][a-z0-9-]{0,127}$/.test(candidate)
    ? candidate
    : "property-runtime-unavailable";
};

@Injectable()
export class PropertyEventPublisherWorker {
  private readonly logger = new Logger(PropertyEventPublisherWorker.name);
  private replayControlDeniedScopes: PropertyEventControlDiagnostic[] = [];

  constructor(
    @Inject(PROPERTY_EVENT_RUNTIME_STORE) private readonly store: PropertyEventRuntimeStore,
    @Inject(PROPERTY_EVENT_PUBLISHER) private readonly publisher: PropertyEventPublisherPort,
    @Inject(PROPERTY_RUNTIME_CONTROL_PORT)
    private readonly runtimeControls: PropertyRuntimeControlPort
  ) {}

  async run(options: PropertyEventWorkerOptions): Promise<PropertyEventWorkerResult> {
    const batchSize = Math.min(Math.max(options.batchSize ?? 50, 1), 500);
    const leaseSeconds = Math.min(Math.max(options.leaseSeconds ?? 60, 5), 900);
    const maxAttempts = Math.min(Math.max(options.maxAttempts ?? 8, 1), 100);
    const retryDelay = options.retryDelayMs ?? ((attempt) =>
      Math.min(300_000, 1_000 * 2 ** Math.min(attempt, 8)));
    const controlDeniedScopes: PropertyEventWorkerResult["controlDeniedScopes"] = [];
    const events = await this.store.claimPublishable({
      workerId: options.workerId,
      limit: batchSize,
      leaseSeconds,
      authorize: (manager, scope) =>
        this.authorizeScope(manager, scope, controlDeniedScopes)
    });
    const result: PropertyEventWorkerResult = {
      claimed: events.length,
      published: 0,
      retryWaiting: 0,
      deadLettered: 0,
      staleClaims: 0,
      controlDeniedScopes
    };
    for (const event of events) {
      try {
        await this.publisher.publish(event);
        if (await this.store.markPublished(event)) result.published += 1;
        else result.staleClaims += 1;
      } catch (error) {
        const outcome = await this.store.markPublishFailure({
          event,
          errorCategory: "infrastructure",
          errorCode: safeErrorCode(error),
          maxAttempts,
          retryAt: new Date(Date.now() + retryDelay(event.attemptCount + 1))
        });
        if (outcome === "retry_wait") result.retryWaiting += 1;
        else if (outcome === "dlq") result.deadLettered += 1;
        else result.staleClaims += 1;
      }
    }
    return result;
  }

  /**
   * Consumer replay only re-publishes the immutable original envelope.
   * The original consumer resolves its own DLQ after its effect and inbox
   * receipt commit atomically; broker publication is not a consumer ack.
   */
  async runConsumerReplays(limit = 50): Promise<number> {
    const deniedScopes: PropertyEventControlDiagnostic[] = [];
    const events = await this.store.listReplayingEvents({
      limit: Math.min(Math.max(limit, 1), 500),
      authorize: (manager, scope) => this.authorizeScope(manager, scope, deniedScopes)
    });
    this.replayControlDeniedScopes = deniedScopes;
    let published = 0;
    for (const event of events) {
      if (!event.replayDlqId || event.replayDlqVersion == null) {
        throw new Error("replaying event is missing canonical DLQ identity");
      }
      await this.publisher.publish(event);
      published += 1;
    }
    return published;
  }

  getReplayControlDiagnostics(): readonly PropertyEventControlDiagnostic[] {
    return this.replayControlDeniedScopes.map((item) => ({ ...item }));
  }

  private async authorizeScope(
    manager: EntityManager,
    scope: TenantParkScope,
    deniedScopes: PropertyEventControlDiagnostic[]
  ): Promise<boolean> {
    let diagnostic: PropertyEventControlDiagnostic | undefined;
    try {
      const control = await this.runtimeControls.inspect(
        manager, scope, "event-notification.enforce"
      );
      if (control.effective && control.mode === "enforce") return true;
      diagnostic = {
        ...scope, errorCode: "property-runtime-control-not-enforced"
      };
    } catch (error) {
      diagnostic = { ...scope, errorCode: safeControlErrorCode(error) };
    }
    deniedScopes.push(diagnostic);
    this.logger.warn({ event: "property-event-publication-control-denied", ...diagnostic });
    return false;
  }
}
