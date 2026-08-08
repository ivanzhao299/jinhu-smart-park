import { Inject, Injectable } from "@nestjs/common";
import {
  PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION,
  PROPERTY_MUTATION_RECEIPT_PORT,
  PROPERTY_TASK_TERMINAL_CLIENT_KEY_PREFIX,
  PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST,
  evaluatePropertyTaskTerminalReceiptFence,
  propertyTaskMutationResultHash,
  propertyTaskSourceTerminalClientKeyCanonicalBytes,
  type PropertyMutationReceiptPort,
  type PropertyTaskAction,
  type PropertyTaskBlockRequest,
  type PropertyTaskEndpointContract,
  type PropertyTaskMutationBase,
  type PropertyTaskMutationResponse,
  type PropertyTaskProjectorSource,
  type PropertyTaskRebuildRequest,
  type PropertyTaskRebuildResponse,
  type PropertyTaskReleaseRequest,
  type PropertyTaskSourceSnapshot,
  type PropertyTaskSourceResolver,
  type PropertyTaskSourceTerminalRequestV1,
  type TenantParkScope
} from "@jinhu/shared";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { isPropertyMutationReceiptSerializationFailure } from
  "../property-approvals/property-mutation-receipt.adapter";
import { PropertyTaskAccessEvaluatorService } from "./property-task.access";
import {
  PropertyTaskAssignmentRepository,
  type PropertyTaskAssignmentRow
} from "./property-task.assignment.repository";
import {
  canonicalPropertyTaskRequestHash,
  derivePropertyTaskIdentity,
  sha256Hex
} from "./property-task.canonical";
import { propertyTaskError, translatePropertyTaskDatabaseError } from
  "./property-task.error";
import { toPropertyTaskManagerPort } from "./property-task.manager-port";
import { PropertyTaskMapper } from "./property-task.mapper";
import {
  PropertyTaskProjectionRepository,
  type PropertyTaskProjectionRow,
  type PropertyTaskProjectionWriteRow
} from "./property-task.projection.repository";
import { PropertyTaskSourceRegistryProvider } from "./property-task.registry";

type CommandRequest = PropertyTaskMutationBase
  | PropertyTaskBlockRequest
  | PropertyTaskReleaseRequest;

interface AuthorityCandidate {
  projector: PropertyTaskSourceResolver & PropertyTaskProjectorSource;
  snapshot: PropertyTaskSourceSnapshot;
  taskId: string;
  taskKey: string;
}

const PROPERTY_TASK_RECONCILER_ACTOR_ID = "00000000-0000-4000-8000-000000000001";

@Injectable()
export class PropertyTaskOrchestrator {
  constructor(
    private readonly dataSource: DataSource,
    private readonly assignments: PropertyTaskAssignmentRepository,
    private readonly projections: PropertyTaskProjectionRepository,
    private readonly registry: PropertyTaskSourceRegistryProvider,
    private readonly access: PropertyTaskAccessEvaluatorService,
    private readonly mapper: PropertyTaskMapper,
    @Inject(PROPERTY_MUTATION_RECEIPT_PORT)
    private readonly receipts: PropertyMutationReceiptPort
  ) {}

  async command(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    taskId: string,
    action: PropertyTaskAction,
    request: CommandRequest
  ): Promise<PropertyTaskMutationResponse> {
    try {
      return await this.dataSource.transaction("READ COMMITTED", async (manager) => {
        const projection = await this.mustProjection(manager, scope, taskId);
        const resolver = this.registry.resolve(projection.sourceType, projection.taskKind);
        if (!resolver || resolver.access.tag !== "workspace") {
          throw propertyTaskError("property-runtime-unavailable");
        }

        // Signed lock order starts with the owning source, then its assignment.
        const managerPort = toPropertyTaskManagerPort(manager);
        const source = await resolver.lockAndResolve({
          manager: managerPort,
          scope,
          sourceId: projection.sourceId,
          businessOccurrenceKey: projection.businessOccurrenceKey,
          expectedSourceVersion: projection.sourceVersion,
          taskKey: projection.taskKey
        });
        if (!source) throw propertyTaskError("property-resource-not-found");
        assertCurrentSourceIdentity(source, projection);

        const endpoint = endpointContract(action);
        const authorizeCandidate = async (
          candidate: Pick<PropertyTaskAssignmentRow, "assignmentStatus" | "assigneeId">
        ) => {
          const relation = candidate.assigneeId === actor.sub
            ? "current-assignee" as const
            : "unassigned" as const;
          return await this.access.authorizeCommand({
            manager: managerPort, scope, actor: { actorId: actor.sub }, endpoint,
            descriptor: resolver.access, sourceId: projection.sourceId, action,
            relation, sourceLifecycle: "eligible"
          }) || (action === "property.task.release"
            && candidate.assignmentStatus === "open"
            && await this.access.authorizeCommand({
              manager: managerPort, scope, actor: { actorId: actor.sub }, endpoint,
              descriptor: resolver.access, sourceId: projection.sourceId, action,
              relation: "current-assignee", sourceLifecycle: "eligible"
            }));
        };
        if (source.lifecycle !== "eligible") {
          const authorized = await authorizeCandidate(projection);
          if (!authorized || !commandActorStateAllowed(action, projection, actor.sub)) {
            throw propertyTaskError("property-resource-not-found");
          }
          const canReadSourceDetails = await this.access.canReadSourceDetails({
            manager: managerPort,
            scope,
            actor: { actorId: actor.sub },
            descriptor: resolver.access,
            sourceId: projection.sourceId
          });
          throw propertyTaskError("task-source-ineligible", {
            deepLink: canReadSourceDetails ? source.sourceDeepLink : null
          });
        }

        const assignment = projection.assignmentAuthority === "derived"
          ? await this.mustDerivedAssignment(manager, scope, projection)
          : owningAssignment(projection, source);
        if (action === "property.task.claim"
          && projection.assignmentStatus === "open"
          && projection.assigneeId === null
          && assignment.assignmentStatus !== "open") {
          const initiallyAuthorized = await authorizeCandidate(projection);
          if (!initiallyAuthorized) {
            throw propertyTaskError("property-resource-not-found");
          }
          throw propertyTaskError("task-already-claimed", {
            assigneeDisplay: assignment.assigneeDisplay
          });
        }
        const authorized = await authorizeCandidate(assignment);
        if (!authorized || !commandActorStateAllowed(action, assignment, actor.sub)) {
          throw propertyTaskError("property-resource-not-found");
        }

        const canReadSourceDetails = await this.access.canReadSourceDetails({
          manager: managerPort,
          scope,
          actor: { actorId: actor.sub },
          descriptor: resolver.access,
          sourceId: projection.sourceId
        });

        const lockedProjection = await this.projections.lockSourceProjection(
          manager,
          scope,
          projection.sourceType,
          projection.sourceId
        );
        const currentProjection = currentLockedProjection(
          projection,
          lockedProjection,
          assignment,
          source
        );
        if (!commandActorStateAllowed(action, assignment, actor.sub)) {
          throw propertyTaskError("property-resource-not-found");
        }
        const requestHash = commandRequestHash(action, actor.sub, taskId, request);
        const identity = {
          tag: "property-task" as const,
          businessOccurrenceKey: currentProjection.businessOccurrenceKey,
          taskKey: currentProjection.taskKey
        };
        const acquired = await this.receipts.acquire(manager, {
          scope,
          contractVersion: PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION,
          actorId: actor.sub,
          actionId: action,
          targetId: taskId,
          clientKey: request.clientKey,
          requestHash,
          identity,
          acquireMode: "execute-or-replay"
        });
        if (acquired.kind === "replay") {
          return {
            task: this.mapper.toDetail(currentProjection, [], canReadSourceDetails),
            replayed: true,
            replayedResultRef: acquired.resultRef,
            originalResultVersion: acquired.resultVersion
          };
        }
        assertCommandExpectedVersions(currentProjection, source, assignment, request);

        const mutation = currentProjection.assignmentAuthority === "derived"
          ? {
              assignment: await this.assignments.transition(manager, {
                scope,
                assignment,
                actorId: actor.sub,
                action,
                requestHash,
                reason: "reason" in request ? request.reason : undefined,
                blockedUntil: "blockedUntil" in request
                  ? request.blockedUntil
                  : undefined
              }),
              source
            }
          : await this.invokeOwningCommand(
              resolver,
              managerPort,
              scope,
              actor.sub,
              currentProjection,
              request,
              action
            );

        const resultVersion = mutation.assignment.version;
        const resultRef = `property-task/${taskId}/v${resultVersion}`;
        const resultHash = await propertyTaskMutationResultHash({
          actionId: action,
          targetId: taskId,
          identity,
          resultRef,
          resultVersion
        });
        const rows = await this.authorityRows(
          manager,
          scope,
          currentProjection,
          mutation.assignment,
          mutation.source
        );
        await this.projections.replace(manager, {
          scope,
          sourceType: currentProjection.sourceType,
          sourceId: currentProjection.sourceId,
          actorId: actor.sub,
          receiptId: acquired.receiptId,
          replaceMode: "authority-sync",
          commandAction: action,
          resultVersion,
          expectedProjectionVersion: currentProjection.projectionVersion,
          requestHash,
          resultRef,
          resultHash,
          reason: `authority-sync:${action}`,
          rows
        });
        await this.receipts.complete(manager, {
          scope,
          contractVersion: PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION,
          actorId: actor.sub,
          actionId: action,
          targetId: taskId,
          clientKey: request.clientKey,
          requestHash,
          identity,
          receiptId: acquired.receiptId,
          resultHash,
          resultRef,
          resultVersion
        });
        const current = await this.mustProjection(manager, scope, taskId);
        return {
          task: this.mapper.toDetail(current, [], canReadSourceDetails),
          replayed: false,
          replayedResultRef: null,
          originalResultVersion: resultVersion
        };
      });
    } catch (error) {
      if (isHttpException(error)) throw error;
      translatePropertyTaskDatabaseError(error);
    }
  }

  async sourceTerminal(
    request: PropertyTaskSourceTerminalRequestV1
  ): Promise<PropertyTaskMutationResponse> {
    const scope = { tenantId: request.tenantId, parkId: request.parkId };
    try {
      return await this.dataSource.transaction("READ COMMITTED", async (manager) => {
        const projection = await this.projections.findByTaskKey(
          manager,
          scope,
          request.taskKey
        );
        if (!projection
          || projection.sourceType !== request.sourceType
          || projection.sourceId !== request.sourceId
          || projection.businessOccurrenceKey !== request.businessOccurrenceKey) {
          throw propertyTaskError("property-resource-not-found");
        }
        const resolver = this.registry.resolve(projection.sourceType, projection.taskKind);
        if (!resolver) throw propertyTaskError("property-runtime-unavailable");
        const managerPort = toPropertyTaskManagerPort(manager);
        const source = await resolver.lockAndResolve({
          manager: managerPort,
          scope,
          sourceId: request.sourceId,
          businessOccurrenceKey: request.businessOccurrenceKey,
          expectedSourceVersion: request.sourceVersion,
          taskKey: request.taskKey
        });
        if (!source) throw propertyTaskError("property-resource-not-found");
        if (source.sourceId !== request.sourceId
          || source.sourceVersion !== request.sourceVersion
          || source.businessOccurrenceKey !== request.businessOccurrenceKey
          || !terminalLifecycleMatches(request, source)) {
          throw propertyTaskError("property-version-conflict");
        }

        const assignment = projection.assignmentAuthority === "derived"
          ? await this.mustDerivedAssignment(manager, scope, projection)
          : owningAssignment(projection, source);
        const lockedProjection = await this.projections.lockSourceProjection(
          manager,
          scope,
          projection.sourceType,
          projection.sourceId
        );
        const currentProjection = currentLockedProjection(
          projection,
          lockedProjection,
          assignment,
          source
        );
        const isActive = ["open", "claimed", "in_progress", "blocked"]
          .includes(assignment.assignmentStatus);
        const isSameTerminal = assignment.assignmentStatus === request.terminal
          && assignment.outcomeCode === request.outcomeCode
          && assignment.outcomeSourceVersion === request.sourceVersion
          && iso(assignment.outcomeAt) === request.outcomeAt;
        if (!isActive && !isSameTerminal) {
          throw propertyTaskError("property-version-conflict");
        }
        const fence = evaluatePropertyTaskTerminalReceiptFence({
          authorityState: isActive ? "active" : "same-terminal",
          lockedAssignmentVersion: assignment.version,
          incomingExpectedAssignmentVersion: request.expectedAssignmentVersion
        });
        if (!fence.allowed) throw propertyTaskError(fence.errorCode);
        const clientKey = `${PROPERTY_TASK_TERMINAL_CLIENT_KEY_PREFIX}${sha256Hex(
          propertyTaskSourceTerminalClientKeyCanonicalBytes(request)
        )}`;
        const requestHash = canonicalPropertyTaskRequestHash(request);
        const identity = {
          tag: "property-task" as const,
          businessOccurrenceKey: currentProjection.businessOccurrenceKey,
          taskKey: currentProjection.taskKey
        };
        const acquired = await this.receipts.acquire(manager, {
          scope,
          contractVersion: PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION,
          actorId: request.terminalActorId,
          actionId: request.actionId,
          targetId: request.sourceId,
          clientKey,
          requestHash,
          identity,
          acquireMode: fence.acquireMode
        });
        if (acquired.kind === "replay") {
          return {
            task: this.mapper.toDetail(currentProjection, [], true),
            replayed: true,
            replayedResultRef: acquired.resultRef,
            originalResultVersion: acquired.resultVersion
          };
        }
        if (!isActive || currentProjection.assignmentAuthority !== "derived") {
          throw propertyTaskError("property-runtime-unavailable");
        }

        const updated = await this.assignments.terminal(manager, {
          scope,
          assignment,
          actorId: request.terminalActorId,
          terminal: request.terminal,
          outcomeCode: request.outcomeCode,
          outcomeSourceVersion: request.sourceVersion,
          outcomeAt: request.outcomeAt,
          requestHash,
          actionId: request.actionId
        });
        const resultVersion = request.sourceVersion;
        const resultRef = `property-task-source-terminal/${request.sourceType}/${request.sourceId}/${request.terminal}/v${resultVersion}`;
        const resultHash = await propertyTaskMutationResultHash({
          actionId: request.actionId,
          targetId: request.sourceId,
          identity,
          resultRef,
          resultVersion
        });
        const rows = await this.authorityRows(
          manager,
          scope,
          currentProjection,
          updated,
          source
        );
        await this.projections.replace(manager, {
          scope,
          sourceType: request.sourceType,
          sourceId: request.sourceId,
          actorId: request.terminalActorId,
          receiptId: acquired.receiptId,
          replaceMode: "authority-sync",
          commandAction: request.actionId,
          resultVersion,
          expectedProjectionVersion: currentProjection.projectionVersion,
          requestHash,
          resultRef,
          resultHash,
          reason: `authority-sync:${request.actionId}`,
          rows
        });
        await this.receipts.complete(manager, {
          scope,
          contractVersion: PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION,
          actorId: request.terminalActorId,
          actionId: request.actionId,
          targetId: request.sourceId,
          clientKey,
          requestHash,
          identity,
          receiptId: acquired.receiptId,
          resultHash,
          resultRef,
          resultVersion
        });
        const current = await this.mustProjection(manager, scope, currentProjection.taskId);
        return {
          task: this.mapper.toDetail(current, [], true),
          replayed: false,
          replayedResultRef: null,
          originalResultVersion: resultVersion
        };
      });
    } catch (error) {
      if (isHttpException(error)) throw error;
      translatePropertyTaskDatabaseError(error);
    }
  }

  async rebuild(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    request: PropertyTaskRebuildRequest,
    internal = false
  ): Promise<PropertyTaskRebuildResponse> {
    try {
      return await this.dataSource.transaction("SERIALIZABLE", async (manager) => {
        const managerPort = toPropertyTaskManagerPort(manager);
        const internalDescriptor = {
          tag: "internal-rebuild" as const,
          sourceType: "internal" as const,
          requiredModules: ["asset"] as const,
          maintenanceScope: "current-park" as const,
          requiredPermission: "property_task:rebuild" as const
        };
        if (!internal && !await this.access.authorizeTaskRead({
          manager: managerPort,
          scope,
          actor: { actorId: actor.sub },
          endpoint: endpointContract("property.task.internal-rebuild"),
          descriptor: internalDescriptor,
          sourceId: request.sourceId
        })) throw propertyTaskError("property-resource-not-found");

        const projectors = this.registry.projectorsForSourceType(request.sourceType);
        if (projectors.length === 0) {
          // C4 production registry is exact-empty. Do not manufacture an empty
          // projection generation or receipt when no downstream authority exists.
          throw propertyTaskError("property-runtime-unavailable");
        }
        const candidates = await this.scanAuthorityCandidates(
          managerPort,
          scope,
          request.sourceType,
          request.sourceId,
          projectors
        );
        const derivedTaskKeys = candidates
          .filter((candidate) => candidate.projector.assignmentAuthority === "derived")
          .map((candidate) => candidate.taskKey);
        const derivedAssignments = await this.assignments.lockByTaskKeys(
          manager,
          scope,
          derivedTaskKeys
        );
        const assignmentByTaskKey = new Map(
          derivedAssignments.map((assignment) => [assignment.taskKey, assignment])
        );
        if (assignmentByTaskKey.size !== new Set(derivedTaskKeys).size) {
          throw propertyTaskError("property-runtime-unavailable");
        }

        const lockedProjection = await this.projections.lockSourceProjection(
          manager,
          scope,
          request.sourceType,
          request.sourceId,
          true
        );
        const authorityRows = candidates.map((candidate) =>
          authorityCandidateRow(candidate, assignmentByTaskKey)
        );
        const rows = await this.projections.withDatabaseContentHashes(
          manager,
          authorityRows
        );
        const requestHash = canonicalPropertyTaskRequestHash(request);
        const identity = {
          tag: "property-task-source-rebuild" as const,
          sourceType: request.sourceType,
          sourceId: request.sourceId
        };
        const acquired = await this.receipts.acquire(manager, {
          scope,
          contractVersion: PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION,
          actorId: actor.sub,
          actionId: "property.task.rebuild",
          targetId: request.sourceId,
          clientKey: request.clientKey,
          requestHash,
          identity,
          acquireMode: "execute-or-replay"
        });
        if (acquired.kind === "replay") {
          return {
            sourceType: request.sourceType,
            sourceId: request.sourceId,
            previousProjectionVersion: Math.max(0, acquired.resultVersion - 1),
            projectionVersion: acquired.resultVersion,
            projectedTaskCount: rows.length,
            assignmentMutationCount: 0,
            replayed: true,
            replayedResultRef: acquired.resultRef,
            originalResultVersion: acquired.resultVersion
          };
        }
        if (lockedProjection.projectionVersion !== request.expectedProjectionVersion) {
          throw propertyTaskError(
            "task-version-conflict",
            {},
            lockedProjection.projectionVersion
          );
        }
        const resultVersion = lockedProjection.projectionVersion + 1;
        const resultRef = `property-task-rebuild/${request.sourceType}/${request.sourceId}/v${resultVersion}`;
        const resultHash = await propertyTaskMutationResultHash({
          actionId: "property.task.rebuild",
          targetId: request.sourceId,
          identity,
          resultRef,
          resultVersion
        });
        const replacement = await this.projections.replace(manager, {
          scope,
          sourceType: request.sourceType,
          sourceId: request.sourceId,
          actorId: actor.sub,
          receiptId: acquired.receiptId,
          replaceMode: "manual-rebuild",
          commandAction: "property.task.rebuild",
          resultVersion,
          expectedProjectionVersion: lockedProjection.projectionVersion,
          requestHash,
          resultRef,
          resultHash,
          reason: request.reason,
          rows
        });
        await this.receipts.complete(manager, {
          scope,
          contractVersion: PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION,
          actorId: actor.sub,
          actionId: "property.task.rebuild",
          targetId: request.sourceId,
          clientKey: request.clientKey,
          requestHash,
          identity,
          receiptId: acquired.receiptId,
          resultHash,
          resultRef,
          resultVersion
        });
        return {
          sourceType: request.sourceType,
          sourceId: request.sourceId,
          ...replacement,
          assignmentMutationCount: 0,
          replayed: false,
          replayedResultRef: null,
          originalResultVersion: resultVersion
        };
      });
    } catch (error) {
      if (isPropertyMutationReceiptSerializationFailure(error)) {
        throw propertyTaskError("task-version-conflict");
      }
      if (isHttpException(error)) throw error;
      translatePropertyTaskDatabaseError(error);
    }
  }

  async reconcile(
    scope: TenantParkScope,
    request: PropertyTaskRebuildRequest
  ): Promise<PropertyTaskRebuildResponse> {
    return this.rebuild(
      scope,
      { sub: PROPERTY_TASK_RECONCILER_ACTOR_ID } as JwtPrincipal,
      request,
      true
    );
  }

  private async scanAuthorityCandidates(
    manager: ReturnType<typeof toPropertyTaskManagerPort>,
    scope: TenantParkScope,
    sourceType: string,
    sourceId: string,
    projectors: readonly (PropertyTaskSourceResolver & PropertyTaskProjectorSource)[]
  ): Promise<AuthorityCandidate[]> {
    const candidates: AuthorityCandidate[] = [];
    const seenTaskIds = new Set<string>();
    for (const projector of projectors) {
      if (projector.sourceType !== sourceType || projector.access.tag !== "workspace") {
        throw propertyTaskError("property-runtime-unavailable");
      }
      let after: { sourceId: string; businessOccurrenceKey: string } | null = null;
      let pages = 0;
      let exhausted = false;
      while (pages < 10_000) {
        pages += 1;
        const page = await projector.scanCandidates({
          manager,
          scope,
          after,
          limit: 200
        });
        if (page.items.length > 200) {
          throw propertyTaskError("property-runtime-unavailable");
        }
        let priorItem = after;
        for (const scanned of page.items) {
          const itemCursor = {
            sourceId: scanned.sourceId,
            businessOccurrenceKey: scanned.businessOccurrenceKey
          };
          if (priorItem !== null && compareAuthorityCursor(itemCursor, priorItem) <= 0) {
            throw propertyTaskError("property-runtime-unavailable");
          }
          priorItem = itemCursor;
        }
        if (page.next !== null
          && (page.items.length === 0
            || priorItem === null
            || compareAuthorityCursor(page.next, priorItem) !== 0
            || (after !== null && compareAuthorityCursor(page.next, after) <= 0))) {
          throw propertyTaskError("property-runtime-unavailable");
        }
        const sourceItemCount = page.items.reduce(
          (count, item) => count + (item.sourceId === sourceId ? 1 : 0),
          0
        );
        if (candidates.length + sourceItemCount > 200) {
          throw propertyTaskError("property-runtime-unavailable");
        }

        // Only a fully validated page may cause authority locks or candidate effects.
        for (const scanned of page.items) {
          if (scanned.sourceId !== sourceId) continue;
          const identity = derivePropertyTaskIdentity({
            sourceType,
            sourceId,
            taskKind: projector.taskKind,
            businessOccurrenceKey: scanned.businessOccurrenceKey
          });
          const locked = await projector.lockAndResolve({
            manager,
            scope,
            sourceId,
            businessOccurrenceKey: scanned.businessOccurrenceKey,
            expectedSourceVersion: scanned.sourceVersion,
            taskKey: identity.taskKey
          });
          if (!locked || !sameAuthoritySnapshot(scanned, locked)) {
            throw propertyTaskError("property-version-conflict");
          }
          if (seenTaskIds.has(identity.taskId)) {
            throw propertyTaskError("property-runtime-unavailable");
          }
          seenTaskIds.add(identity.taskId);
          candidates.push({
            projector,
            snapshot: locked,
            taskId: identity.taskId,
            taskKey: identity.taskKey
          });
        }
        if (page.next === null) {
          exhausted = true;
          break;
        }
        after = page.next;
      }
      if (!exhausted) throw propertyTaskError("property-runtime-unavailable");
    }
    return candidates.sort((left, right) => left.taskId.localeCompare(right.taskId));
  }

  private async invokeOwningCommand(
    resolver: NonNullable<ReturnType<PropertyTaskSourceRegistryProvider["resolve"]>>,
    manager: ReturnType<typeof toPropertyTaskManagerPort>,
    scope: TenantParkScope,
    actorId: string,
    projection: PropertyTaskProjectionRow,
    request: CommandRequest,
    action: PropertyTaskAction
  ): Promise<{
    assignment: PropertyTaskAssignmentRow;
    source: PropertyTaskSourceSnapshot;
  }> {
    if (!resolver.invokeOwningCommand) {
      throw propertyTaskError("property-runtime-unavailable");
    }
    await resolver.invokeOwningCommand({
      manager,
      scope,
      actor: { actorId },
      action,
      sourceId: projection.sourceId,
      businessOccurrenceKey: request.businessOccurrenceKey,
      taskKey: projection.taskKey,
      expectedSourceVersion: request.expectedSourceVersion,
      expectedAssignmentVersion: request.expectedAssignmentVersion
    });
    const refreshed = await resolver.lockAndResolve({
      manager,
      scope,
      sourceId: projection.sourceId,
      businessOccurrenceKey: request.businessOccurrenceKey,
      expectedSourceVersion: request.expectedSourceVersion + 1,
      taskKey: projection.taskKey
    });
    if (!refreshed) throw propertyTaskError("property-runtime-unavailable");
    const updated = owningAssignment(projection, refreshed);
    if (updated.version !== request.expectedAssignmentVersion + 1) {
      throw propertyTaskError("property-version-conflict");
    }
    return { assignment: updated, source: refreshed };
  }

  private async authorityRows(
    manager: EntityManager,
    scope: TenantParkScope,
    current: PropertyTaskProjectionRow,
    assignment: PropertyTaskAssignmentRow,
    source: PropertyTaskSourceSnapshot
  ): Promise<PropertyTaskProjectionWriteRow[]> {
    const existing = await this.projections.findBySource(
      manager,
      scope,
      current.sourceType,
      current.sourceId
    );
    const updatedAt = new Date().toISOString();
    const rows = existing.map((row) => row.taskId === current.taskId
      ? toWriteRowWithoutHash({
          ...row,
          sourceVersion: source.sourceVersion,
          assignmentStatus: assignment.assignmentStatus,
          assignmentVersion: assignment.version,
          assigneeId: assignment.assigneeId,
          assigneeDisplay: assignment.assigneeDisplay,
          claimedAt: assignment.claimedAt,
          startedAt: assignment.startedAt,
          blockedReason: assignment.blockedReason,
          blockedUntil: assignment.blockedUntil,
          outcomeCode: assignment.outcomeCode,
          outcomeSourceVersion: assignment.outcomeSourceVersion,
          outcomeAt: assignment.outcomeAt,
          updatedAt
        })
      : toWriteRowWithoutHash(row));
    if (!rows.some((row) => row.taskId === current.taskId)) {
      throw propertyTaskError("property-runtime-unavailable");
    }
    return this.projections.withDatabaseContentHashes(manager, rows);
  }

  private async mustProjection(
    manager: EntityManager,
    scope: TenantParkScope,
    taskId: string
  ): Promise<PropertyTaskProjectionRow> {
    const row = await this.projections.findByTaskId(manager, scope, taskId);
    if (!row) throw propertyTaskError("property-resource-not-found");
    return row;
  }

  private async mustDerivedAssignment(
    manager: EntityManager,
    scope: TenantParkScope,
    projection: PropertyTaskProjectionRow
  ): Promise<PropertyTaskAssignmentRow> {
    if (!projection.derivedAssignmentId) {
      throw propertyTaskError("property-runtime-unavailable");
    }
    const assignment = await this.assignments.lockById(
      manager,
      scope,
      projection.derivedAssignmentId
    );
    if (!assignment
      || assignment.taskKey !== projection.taskKey
      || assignment.sourceType !== projection.sourceType
      || assignment.sourceId !== projection.sourceId) {
      throw propertyTaskError("property-version-conflict");
    }
    return assignment;
  }
}

function commandRequestHash(
  action: PropertyTaskAction,
  actorId: string,
  taskId: string,
  request: CommandRequest
): string {
  return canonicalPropertyTaskRequestHash({
    actionId: action,
    actorId,
    businessOccurrenceKey: request.businessOccurrenceKey,
    clientKey: request.clientKey,
    expectedAssignmentVersion: request.expectedAssignmentVersion,
    expectedSourceVersion: request.expectedSourceVersion,
    taskId,
    ...(action === "property.task.block" ? {
      blockedUntil: (request as PropertyTaskBlockRequest).blockedUntil,
      reason: (request as PropertyTaskBlockRequest).reason
    } : {}),
    ...(action === "property.task.release" ? {
      reason: (request as PropertyTaskReleaseRequest).reason
    } : {})
  });
}

function authorityCandidateRow(
  candidate: AuthorityCandidate,
  assignmentByTaskKey: ReadonlyMap<string, PropertyTaskAssignmentRow>
): Omit<PropertyTaskProjectionWriteRow, "contentHash"> {
  const { projector, snapshot, taskId, taskKey } = candidate;
  const assignment = projector.assignmentAuthority === "derived"
    ? assignmentByTaskKey.get(taskKey)
    : snapshot.owningAssignment;
  if (!assignment) throw propertyTaskError("property-runtime-unavailable");
  if (projector.assignmentAuthority === "derived") {
    const derived = assignment as PropertyTaskAssignmentRow;
    if (derived.taskKey !== taskKey
      || derived.taskKind !== projector.taskKind
      || derived.sourceType !== projector.sourceType
      || derived.sourceId !== snapshot.sourceId) {
      throw propertyTaskError("property-version-conflict");
    }
  }
  const status = "assignmentStatus" in assignment
    ? assignment.assignmentStatus
    : assignment.status;
  const derived = "assignmentStatus" in assignment
    ? assignment as PropertyTaskAssignmentRow
    : null;
  return {
    taskId,
    taskKey,
    assignmentAuthority: projector.assignmentAuthority,
    derivedAssignmentId: derived?.id ?? null,
    sourceType: projector.sourceType,
    sourceId: snapshot.sourceId,
    sourceVersion: snapshot.sourceVersion,
    businessOccurrenceKey: snapshot.businessOccurrenceKey,
    taskKind: projector.taskKind,
    queueCode: projector.access.tag === "workspace"
      ? projector.access.queueCode
      : neverValue(),
    title: snapshot.title,
    kindLabel: snapshot.kindLabel,
    sourceLabel: snapshot.sourceLabel,
    priority: snapshot.priority,
    dueAt: snapshot.dueAt,
    assignmentStatus: status,
    assignmentVersion: assignment.version,
    assigneeId: assignment.assigneeId,
    assigneeDisplay: assignment.assigneeDisplay,
    claimedAt: iso(assignment.claimedAt),
    startedAt: iso(assignment.startedAt),
    blockedReason: assignment.blockedReason,
    blockedUntil: iso(assignment.blockedUntil),
    outcomeCode: assignment.outcomeCode,
    outcomeSourceVersion: assignment.outcomeSourceVersion,
    outcomeAt: iso(assignment.outcomeAt),
    sourceDeepLink: snapshot.sourceDeepLink,
    createdAt: iso(assignment.createdAt)!,
    updatedAt: iso(assignment.updatedAt)!
  };
}

function sameAuthoritySnapshot(
  scanned: PropertyTaskSourceSnapshot,
  locked: PropertyTaskSourceSnapshot
): boolean {
  return canonicalPropertyTaskRequestHash(scanned)
    === canonicalPropertyTaskRequestHash(locked);
}

function compareAuthorityCursor(
  left: { sourceId: string; businessOccurrenceKey: string },
  right: { sourceId: string; businessOccurrenceKey: string }
): number {
  const sourceOrder = compareUtf8(left.sourceId, right.sourceId);
  return sourceOrder === 0
    ? compareUtf8(left.businessOccurrenceKey, right.businessOccurrenceKey)
    : sourceOrder;
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function neverValue(): never {
  throw propertyTaskError("property-runtime-unavailable");
}

function owningAssignment(
  projection: PropertyTaskProjectionRow,
  source: PropertyTaskSourceSnapshot
): PropertyTaskAssignmentRow {
  const assignment = source.owningAssignment;
  if (!assignment) throw propertyTaskError("property-runtime-unavailable");
  return {
    id: projection.taskId,
    taskKey: projection.taskKey,
    taskKind: projection.taskKind,
    sourceType: projection.sourceType,
    sourceId: projection.sourceId,
    sourceVersionAtGeneration: source.sourceVersion,
    assignmentStatus: assignment.status,
    assigneeId: assignment.assigneeId,
    assigneeDisplay: assignment.assigneeDisplay,
    claimEpoch: 0,
    claimToken: null,
    version: assignment.version,
    claimedAt: assignment.claimedAt,
    startedAt: assignment.startedAt,
    blockedReason: assignment.blockedReason,
    blockedUntil: assignment.blockedUntil,
    outcomeCode: assignment.outcomeCode,
    outcomeSourceVersion: assignment.outcomeSourceVersion,
    outcomeAt: assignment.outcomeAt,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt
  };
}

function currentLockedProjection(
  initial: PropertyTaskProjectionRow,
  locked: {
    projectionVersion: number;
    rows: readonly PropertyTaskProjectionRow[];
  },
  assignment: PropertyTaskAssignmentRow,
  source: PropertyTaskSourceSnapshot
): PropertyTaskProjectionRow {
  const matches = locked.rows.filter((row) => row.taskId === initial.taskId);
  if (matches.length !== 1) {
    throw propertyTaskError("property-runtime-unavailable");
  }
  const current = matches[0]!;
  if (current.projectionVersion !== locked.projectionVersion) {
    throw propertyTaskError("property-runtime-unavailable");
  }
  if (current.taskKey !== initial.taskKey
    || current.taskKind !== initial.taskKind
    || current.sourceType !== initial.sourceType
    || current.sourceId !== initial.sourceId
    || current.businessOccurrenceKey !== initial.businessOccurrenceKey
    || current.assignmentAuthority !== initial.assignmentAuthority
    || current.derivedAssignmentId !== initial.derivedAssignmentId) {
    throw propertyTaskError("property-version-conflict");
  }
  assertCurrentSourceIdentity(source, current);
  if (current.assignmentStatus !== assignment.assignmentStatus
    || current.assignmentVersion !== assignment.version
    || current.assigneeId !== assignment.assigneeId
    || current.assigneeDisplay !== assignment.assigneeDisplay
    || iso(current.claimedAt) !== iso(assignment.claimedAt)
    || iso(current.startedAt) !== iso(assignment.startedAt)
    || current.blockedReason !== assignment.blockedReason
    || iso(current.blockedUntil) !== iso(assignment.blockedUntil)
    || current.outcomeCode !== assignment.outcomeCode
    || current.outcomeSourceVersion !== assignment.outcomeSourceVersion
    || iso(current.outcomeAt) !== iso(assignment.outcomeAt)) {
    throw propertyTaskError("property-version-conflict");
  }
  return current;
}

function assertCurrentSourceIdentity(
  source: PropertyTaskSourceSnapshot,
  projection: PropertyTaskProjectionRow
): void {
  if (source.sourceId !== projection.sourceId
    || source.sourceVersion !== projection.sourceVersion
    || source.businessOccurrenceKey !== projection.businessOccurrenceKey) {
    throw propertyTaskError("property-version-conflict");
  }
}

function commandActorStateAllowed(
  action: PropertyTaskAction,
  assignment: Pick<PropertyTaskAssignmentRow, "assignmentStatus" | "assigneeId">,
  actorId: string
): boolean {
  const currentAssignee = assignment.assigneeId === actorId;
  if (action === "property.task.claim") {
    return (assignment.assignmentStatus === "open" && assignment.assigneeId === null)
      || (assignment.assignmentStatus === "claimed" && currentAssignee);
  }
  if (action === "property.task.start") {
    return currentAssignee
      && ["claimed", "in_progress"].includes(assignment.assignmentStatus);
  }
  if (action === "property.task.block") {
    return currentAssignee
      && ["in_progress", "blocked"].includes(assignment.assignmentStatus);
  }
  if (action === "property.task.unblock") {
    return ["blocked", "in_progress"].includes(assignment.assignmentStatus);
  }
  return ["claimed", "in_progress", "blocked", "open"]
    .includes(assignment.assignmentStatus);
}

function assertCommandExpectedVersions(
  projection: PropertyTaskProjectionRow,
  source: PropertyTaskSourceSnapshot,
  assignment: PropertyTaskAssignmentRow,
  request: CommandRequest
): void {
  if (request.businessOccurrenceKey !== projection.businessOccurrenceKey) {
    throw propertyTaskError("property-version-conflict");
  }
  if (assignment.version !== request.expectedAssignmentVersion) {
    throw propertyTaskError("task-version-conflict", {}, assignment.version);
  }
  if (source.sourceVersion !== request.expectedSourceVersion) {
    throw propertyTaskError("property-version-conflict");
  }
}

function terminalLifecycleMatches(
  request: PropertyTaskSourceTerminalRequestV1,
  source: PropertyTaskSourceSnapshot
): boolean {
  return request.terminal === "closed"
    ? source.lifecycle === "succeeded"
    : source.lifecycle === "cancelled";
}

function endpointContract(actionId: string): PropertyTaskEndpointContract {
  const endpoint = PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST.find(
    (candidate) => candidate.actionId === actionId
  );
  if (!endpoint) throw propertyTaskError("property-runtime-unavailable");
  return {
    requiredPermissions: endpoint.requiredPermissions,
    authorizationAlternatives: endpoint.authorizationAlternatives
  };
}

function toWriteRowWithoutHash(
  row: PropertyTaskProjectionRow
): Omit<PropertyTaskProjectionWriteRow, "contentHash"> {
  return {
    taskId: row.taskId,
    taskKey: row.taskKey,
    assignmentAuthority: row.assignmentAuthority,
    derivedAssignmentId: row.derivedAssignmentId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    sourceVersion: row.sourceVersion,
    businessOccurrenceKey: row.businessOccurrenceKey,
    taskKind: row.taskKind,
    queueCode: row.queueCode,
    title: row.title,
    kindLabel: row.kindLabel,
    sourceLabel: row.sourceLabel,
    priority: row.priority,
    dueAt: iso(row.dueAt),
    assignmentStatus: row.assignmentStatus,
    assignmentVersion: row.assignmentVersion,
    assigneeId: row.assigneeId,
    assigneeDisplay: row.assigneeDisplay,
    claimedAt: iso(row.claimedAt),
    startedAt: iso(row.startedAt),
    blockedReason: row.blockedReason,
    blockedUntil: iso(row.blockedUntil),
    outcomeCode: row.outcomeCode,
    outcomeSourceVersion: row.outcomeSourceVersion,
    outcomeAt: iso(row.outcomeAt),
    sourceDeepLink: row.sourceDeepLink,
    createdAt: iso(row.createdAt)!,
    updatedAt: iso(row.updatedAt)!
  };
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isHttpException(error: unknown): error is { getStatus(): number } {
  return Boolean(error && typeof (error as { getStatus?: unknown }).getStatus === "function");
}
