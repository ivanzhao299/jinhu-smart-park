import type { TenantParkScope } from "../index";
import type {
  EntityManagerPort,
  PropertyErrorCode,
  PropertyTaskStatus
} from "./track-b-contracts";
import type {
  PropertyTaskAuthorizationAlternative,
  PropertyTrackBEndpointPermission
} from "./track-b-endpoint-permissions";

export const PROPERTY_TASK_ACTIONS = [
  "property.task.claim",
  "property.task.start",
  "property.task.block",
  "property.task.unblock",
  "property.task.release"
] as const;
export type PropertyTaskAction = (typeof PROPERTY_TASK_ACTIONS)[number];

export const PROPERTY_TASK_RUNTIME_HANDOFF_GRAMMAR =
  "b-property-task-runtime-v1" as const;
export const PROPERTY_TASK_PROJECTION_CALLSITE_GRAMMAR =
  "b-property-task-projection-callsite-v1" as const;

export const PROPERTY_TASK_ASSIGNMENT_AUTHORITIES = ["owning", "derived"] as const;
export type PropertyTaskAssignmentAuthority =
  (typeof PROPERTY_TASK_ASSIGNMENT_AUTHORITIES)[number];

export const PROPERTY_TASK_SOURCE_LIFECYCLES = [
  "eligible",
  "succeeded",
  "cancelled"
] as const;
export type PropertyTaskSourceLifecycle =
  (typeof PROPERTY_TASK_SOURCE_LIFECYCLES)[number];

export const PROPERTY_TASK_ACTOR_RELATIONS = [
  "unassigned",
  "current-assignee",
  "queue-supervisor"
] as const;
export type PropertyTaskActorRelation =
  (typeof PROPERTY_TASK_ACTOR_RELATIONS)[number];

export const PROPERTY_TASK_KEY_VERSION = 1 as const;
export const PROPERTY_TASK_KEY_PREFIX = "task-key-v1\n" as const;
export const PROPERTY_TASK_ID_PREFIX = "task-id-v1\n" as const;
export const PROPERTY_TASK_ID_NAMESPACE =
  "7b2df21d-6bb8-5e2f-a04f-a3ebf43f04a7" as const;
export const PROPERTY_TASK_KEY_PATTERN = /^[0-9a-f]{64}$/;
export const PROPERTY_TASK_SOURCE_TYPE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
export const PROPERTY_TASK_COMPOSITION_TOKEN_PATTERN = /^[a-z][a-z0-9_:-]{0,127}$/;
export const PROPERTY_TASK_DOMAIN_ROUTE_PATTERN =
  /^\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\/\[taskId\](?:\/[a-z0-9_-]+)*$/;
export const PROPERTY_TASK_OUTCOME_CODE_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
export const PROPERTY_TASK_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const PROPERTY_TASK_ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export const PROPERTY_TASK_OCCURRENCE_MAX_UTF8_BYTES = 256 as const;
export const PROPERTY_TASK_RESULT_VERSION_MAX = 2147483647 as const;

export function isCanonicalUtcMillisecondIso(value: string): boolean {
  if (!PROPERTY_TASK_ISO_DATE_TIME_PATTERN.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function assertCanonicalField(name: string, value: string): void {
  if (value.length === 0 || /[\t\n\r\0\ufffd]/u.test(value)) {
    throw new TypeError(
      `${name} must be non-empty and contain no TAB, CR, LF, NUL or replacement character`
    );
  }
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const following = value.charCodeAt(index + 1);
      if (!(following >= 0xdc00 && following <= 0xdfff)) {
        throw new TypeError(`${name} contains a lone high surrogate`);
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new TypeError(`${name} contains a lone low surrogate`);
    }
  }
}

export function assertCanonicalPropertyTaskBusinessOccurrenceKey(value: string): void {
  assertCanonicalField("businessOccurrenceKey", value);
  if (/^ *$/u.test(value)) {
    throw new TypeError("businessOccurrenceKey must contain a character other than U+0020");
  }
  const byteLength = new TextEncoder().encode(value).byteLength;
  if (byteLength < 1 || byteLength > PROPERTY_TASK_OCCURRENCE_MAX_UTF8_BYTES) {
    throw new TypeError(
      `businessOccurrenceKey must contain 1..${PROPERTY_TASK_OCCURRENCE_MAX_UTF8_BYTES} UTF-8 bytes`
    );
  }
}

export function assertPropertyTaskResultVersion(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > PROPERTY_TASK_RESULT_VERSION_MAX) {
    throw new TypeError(
      `resultVersion must be an integer from 1 to ${PROPERTY_TASK_RESULT_VERSION_MAX}`
    );
  }
}

export function propertyTaskKeyCanonicalBytes(input: {
  sourceType: string;
  sourceId: string;
  taskKind: string;
  businessOccurrenceKey: string;
}): Uint8Array {
  assertCanonicalField("sourceType", input.sourceType);
  assertCanonicalField("taskKind", input.taskKind);
  assertCanonicalPropertyTaskBusinessOccurrenceKey(input.businessOccurrenceKey);
  if (!PROPERTY_TASK_UUID_PATTERN.test(input.sourceId)) {
    throw new TypeError("sourceId must be a lowercase canonical UUID");
  }
  return new TextEncoder().encode(
    `${PROPERTY_TASK_KEY_PREFIX}${input.sourceType}\t${input.sourceId}\t${input.taskKind}\t${input.businessOccurrenceKey}\n`
  );
}

export function propertyTaskIdCanonicalBytes(taskKey: string): Uint8Array {
  if (!PROPERTY_TASK_KEY_PATTERN.test(taskKey)) {
    throw new TypeError("taskKey must be 64 lowercase hexadecimal characters");
  }
  return new TextEncoder().encode(`${PROPERTY_TASK_ID_PREFIX}${taskKey}\n`);
}

export type PropertyTaskSourceAccessDescriptor =
  | {
      tag: "workspace";
      sourceType: string;
      requiredModules: readonly string[];
      surfaceId: string;
      pagePermission: string;
      queueCode: string;
      domainRoute: string;
      sourceDetailPermission: string;
    }
  | {
      tag: "internal-rebuild";
      sourceType: "internal";
      requiredModules: readonly ["asset"];
      maintenanceScope: "current-park";
      requiredPermission: "property_task:rebuild";
    };

export interface PropertyTaskEndpointAccess {
  requiredPermissions: readonly string[];
  authorizationAlternatives: readonly PropertyTaskAuthorizationAlternative[];
}

export interface PropertyTaskEndpointAuthorizationFacts {
  activeModules: boolean;
  currentUserPark: boolean;
  taskRead: boolean;
  sourceScope: boolean;
  queueScope: boolean;
  currentAssignee: boolean;
  queueSupervisor: boolean;
  grantedPermissions: ReadonlySet<string>;
}

export function evaluatePropertyTaskEndpointAuthorization(
  endpoint: PropertyTaskEndpointAccess,
  facts: PropertyTaskEndpointAuthorizationFacts
): boolean {
  if (
    !facts.activeModules
    || !facts.currentUserPark
    || !facts.taskRead
    || !facts.sourceScope
    || !facts.queueScope
    || !endpoint.requiredPermissions.every((permission) =>
      facts.grantedPermissions.has(permission))
  ) {
    return false;
  }
  if (endpoint.authorizationAlternatives.length === 0) return true;
  return endpoint.authorizationAlternatives.some((alternative) =>
    alternative.requiredPermissions.every((permission) =>
      facts.grantedPermissions.has(permission))
    && (alternative.actorPredicate === "current-assignee"
      ? facts.currentAssignee
      : alternative.actorPredicate === "queue-supervisor" && facts.queueSupervisor)
  );
}

export interface CurrentPropertyActor {
  actorId: string;
}

export interface PropertyTaskOwningAssignmentProjection {
  status: PropertyTaskStatus;
  version: number;
  assigneeId: string | null;
  assigneeDisplay: string | null;
  claimedAt: IsoDateTime | null;
  startedAt: IsoDateTime | null;
  blockedReason: string | null;
  blockedUntil: IsoDateTime | null;
  outcomeCode: string | null;
  outcomeSourceVersion: number | null;
  outcomeAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface PropertyTaskSourceSnapshot {
  sourceId: string;
  sourceVersion: number;
  lifecycle: PropertyTaskSourceLifecycle;
  businessOccurrenceKey: string;
  title: string;
  kindLabel: string;
  sourceLabel: string;
  priority: number;
  dueAt: IsoDateTime | null;
  sourceDeepLink: string | null;
  owningAssignment: PropertyTaskOwningAssignmentProjection | null;
}

export interface PropertyTaskOwningCommandInput {
  manager: EntityManagerPort;
  scope: TenantParkScope;
  actor: CurrentPropertyActor;
  action: PropertyTaskAction;
  sourceId: string;
  businessOccurrenceKey: string;
  taskKey: string;
  expectedSourceVersion: number;
  expectedAssignmentVersion: number;
  reason?: string;
  blockedUntil?: IsoDateTime | null;
}

export interface PropertyTaskSourceResolver {
  readonly sourceType: string;
  readonly taskKind: string;
  readonly assignmentAuthority: PropertyTaskAssignmentAuthority;
  readonly access: PropertyTaskSourceAccessDescriptor;
  lockAndResolve(input: {
    manager: EntityManagerPort;
    scope: TenantParkScope;
    sourceId: string;
    businessOccurrenceKey: string;
    expectedSourceVersion: number;
    taskKey: string;
  }): Promise<PropertyTaskSourceSnapshot | null>;
  invokeOwningCommand?(input: PropertyTaskOwningCommandInput): Promise<void>;
}

export interface PropertyTaskProjectorSource {
  readonly sourceType: string;
  readonly taskKind: string;
  scanCandidates(input: {
    manager: EntityManagerPort;
    scope: TenantParkScope;
    after: { sourceId: string; businessOccurrenceKey: string } | null;
    limit: number;
  }): Promise<{
    items: readonly PropertyTaskSourceSnapshot[];
    next: { sourceId: string; businessOccurrenceKey: string } | null;
  }>;
}

export interface PropertyTaskAccessEvaluator {
  authorizeTaskRead(input: {
    manager: EntityManagerPort;
    scope: TenantParkScope;
    actor: CurrentPropertyActor;
    endpoint: PropertyTaskEndpointAccess;
    descriptor: PropertyTaskSourceAccessDescriptor;
    sourceId: string;
  }): Promise<boolean>;
  canReadSourceDetails(input: {
    manager: EntityManagerPort;
    scope: TenantParkScope;
    actor: CurrentPropertyActor;
    descriptor: Extract<PropertyTaskSourceAccessDescriptor, { tag: "workspace" }>;
    sourceId: string;
  }): Promise<boolean>;
  authorizeCommand(input: {
    manager: EntityManagerPort;
    scope: TenantParkScope;
    actor: CurrentPropertyActor;
    endpoint: PropertyTaskEndpointAccess;
    descriptor: PropertyTaskSourceAccessDescriptor;
    sourceId: string;
    action: PropertyTaskAction;
    relation: PropertyTaskActorRelation;
    sourceLifecycle: PropertyTaskSourceLifecycle;
  }): Promise<boolean>;
}

export type PropertyTaskRegistryMode =
  | "production"
  | "b2c-production"
  | "test-fixture";

export class PropertyTaskSourceRegistry {
  readonly #resolvers: ReadonlyMap<string, PropertyTaskSourceResolver>;

  constructor(
    resolvers: readonly PropertyTaskSourceResolver[],
    mode: PropertyTaskRegistryMode
  ) {
    if (mode === "production" && resolvers.length !== 0) {
      throw new Error("The C4 production property task source registry must be exact-empty");
    }
    if (mode === "b2c-production" && resolvers.length === 0) {
      throw new Error("The B-2c property task source registry must not be exact-empty");
    }
    const entries = new Map<string, PropertyTaskSourceResolver>();
    for (const resolver of resolvers) {
      validateRegistryResolver(resolver, mode);
      const key = propertyTaskSourceRegistryKey(resolver.sourceType, resolver.taskKind);
      if (entries.has(key)) {
        throw new Error(`Duplicate property task source resolver: ${key}`);
      }
      entries.set(key, snapshotRegistryResolver(resolver));
    }
    this.#resolvers = entries;
  }

  get size(): number {
    return this.#resolvers.size;
  }

  resolve(sourceType: string, taskKind: string): PropertyTaskSourceResolver | null {
    return this.#resolvers.get(propertyTaskSourceRegistryKey(sourceType, taskKind)) ?? null;
  }

  values(): readonly PropertyTaskSourceResolver[] {
    return Object.freeze([...this.#resolvers.values()]);
  }
}

export const PROPERTY_TASK_PRODUCTION_SOURCE_REGISTRATIONS = [] as const satisfies
  readonly PropertyTaskSourceResolver[];

export function createPropertyTaskProductionSourceRegistry(): PropertyTaskSourceRegistry {
  return new PropertyTaskSourceRegistry(
    PROPERTY_TASK_PRODUCTION_SOURCE_REGISTRATIONS,
    "production"
  );
}

export function createPropertyTaskComposedSourceRegistry(
  resolvers: readonly PropertyTaskSourceResolver[]
): PropertyTaskSourceRegistry {
  return new PropertyTaskSourceRegistry(resolvers, "b2c-production");
}

export function propertyTaskSourceRegistryKey(sourceType: string, taskKind: string): string {
  assertCanonicalField("sourceType", sourceType);
  assertCanonicalField("taskKind", taskKind);
  return `${sourceType}\t${taskKind}`;
}

function validateRegistryResolver(
  resolver: PropertyTaskSourceResolver,
  mode: PropertyTaskRegistryMode
): void {
  if (mode === "b2c-production") validateB2cProductionResolver(resolver);
  propertyTaskSourceRegistryKey(resolver.sourceType, resolver.taskKind);
  if (resolver.access.sourceType !== resolver.sourceType) {
    throw new Error("Property task descriptor sourceType must match its resolver");
  }
  if (
    mode === "test-fixture"
    && (!resolver.sourceType.startsWith("test_fixture_")
      || !resolver.taskKind.startsWith("test_fixture_")
      || resolver.access.tag !== "workspace"
      || !resolver.access.surfaceId.startsWith("test_fixture_")
      || !resolver.access.queueCode.startsWith("test_fixture_")
      || !resolver.access.pagePermission.startsWith("test_fixture_")
      || !resolver.access.sourceDetailPermission.startsWith("test_fixture_")
      || !resolver.access.requiredModules.every((value) => value.startsWith("test_fixture_"))
      || !resolver.access.domainRoute.startsWith("/test_fixture_"))
  ) {
    throw new Error("Test property task sources must remain in the test_fixture_* namespace");
  }
  if (mode === "b2c-production" && isTestFixtureResolver(resolver)) {
    throw new Error("Test property task sources cannot enter B-2c production composition");
  }
}

const PROPERTY_TASK_WORKSPACE_DESCRIPTOR_KEYS = [
  "domainRoute",
  "pagePermission",
  "queueCode",
  "requiredModules",
  "sourceDetailPermission",
  "sourceType",
  "surfaceId",
  "tag"
] as const;

function validateB2cProductionResolver(resolver: PropertyTaskSourceResolver): void {
  if (!resolver || typeof resolver !== "object") {
    throw new Error("B-2c property task source resolver must be an object");
  }
  if (!PROPERTY_TASK_SOURCE_TYPE_PATTERN.test(resolver.sourceType)
    || !PROPERTY_TASK_SOURCE_TYPE_PATTERN.test(resolver.taskKind)) {
    throw new Error("B-2c property task sourceType and taskKind must be canonical");
  }
  if (resolver.assignmentAuthority !== "owning"
    && resolver.assignmentAuthority !== "derived") {
    throw new Error("B-2c property task assignmentAuthority is invalid");
  }
  if (typeof resolver.lockAndResolve !== "function") {
    throw new Error("B-2c property task resolver requires lockAndResolve");
  }
  if (!("scanCandidates" in resolver) || typeof resolver.scanCandidates !== "function") {
    throw new Error("B-2c property task resolver requires scanCandidates");
  }
  const hasOwningHook = "invokeOwningCommand" in resolver;
  if (resolver.assignmentAuthority === "owning"
    && (!hasOwningHook || typeof resolver.invokeOwningCommand !== "function")) {
    throw new Error("Owning property task sources require invokeOwningCommand");
  }
  if (resolver.assignmentAuthority === "derived" && hasOwningHook) {
    throw new Error("Derived property task sources must not declare invokeOwningCommand");
  }
  validateB2cWorkspaceDescriptor(resolver.access, resolver.sourceType);
}

function validateB2cWorkspaceDescriptor(
  descriptor: PropertyTaskSourceAccessDescriptor,
  sourceType: string
): void {
  if (!descriptor || typeof descriptor !== "object" || descriptor.tag !== "workspace") {
    throw new Error("B-2c property task sources require a workspace descriptor");
  }
  const keys = Reflect.ownKeys(descriptor);
  if (keys.some((key) => typeof key !== "string")
    || keys.length !== PROPERTY_TASK_WORKSPACE_DESCRIPTOR_KEYS.length
    || [...keys].sort().some(
      (key, index) => key !== PROPERTY_TASK_WORKSPACE_DESCRIPTOR_KEYS[index]
    )) {
    throw new Error("B-2c property task workspace descriptor keys are not exact");
  }
  if (descriptor.sourceType !== sourceType) {
    throw new Error("Property task descriptor sourceType must match its resolver");
  }
  if (!Array.isArray(descriptor.requiredModules)
    || descriptor.requiredModules.length === 0
    || descriptor.requiredModules.some(
      (value) => typeof value !== "string" || !PROPERTY_TASK_SOURCE_TYPE_PATTERN.test(value)
    )
    || new Set(descriptor.requiredModules).size !== descriptor.requiredModules.length
    || descriptor.requiredModules.some(
      (value, index) => index > 0 && descriptor.requiredModules[index - 1]! >= value
    )) {
    throw new Error("B-2c property task requiredModules are not canonical");
  }
  for (const [name, value] of [
    ["surfaceId", descriptor.surfaceId],
    ["pagePermission", descriptor.pagePermission],
    ["sourceDetailPermission", descriptor.sourceDetailPermission]
  ] as const) {
    if (!PROPERTY_TASK_COMPOSITION_TOKEN_PATTERN.test(value)) {
      throw new Error(`B-2c property task ${name} is not canonical`);
    }
  }
  if (!PROPERTY_TASK_SOURCE_TYPE_PATTERN.test(descriptor.queueCode)) {
    throw new Error("B-2c property task queueCode is not canonical");
  }
  if (!PROPERTY_TASK_DOMAIN_ROUTE_PATTERN.test(descriptor.domainRoute)) {
    throw new Error("B-2c property task domainRoute is not canonical");
  }
}

function isTestFixtureResolver(resolver: PropertyTaskSourceResolver): boolean {
  if (resolver.sourceType.startsWith("test_fixture_")
    || resolver.taskKind.startsWith("test_fixture_")) return true;
  if (resolver.access.tag !== "workspace") return false;
  return resolver.access.surfaceId.startsWith("test_fixture_")
    || resolver.access.queueCode.startsWith("test_fixture_")
    || resolver.access.pagePermission.startsWith("test_fixture_")
    || resolver.access.sourceDetailPermission.startsWith("test_fixture_")
    || resolver.access.requiredModules.some((value) => value.startsWith("test_fixture_"))
    || resolver.access.domainRoute.startsWith("/test_fixture_");
}

function snapshotRegistryResolver(
  resolver: PropertyTaskSourceResolver
): PropertyTaskSourceResolver {
  const access: PropertyTaskSourceAccessDescriptor = resolver.access.tag === "workspace"
    ? Object.freeze({
      ...resolver.access,
      requiredModules: Object.freeze([...resolver.access.requiredModules])
    })
    : Object.freeze({
      ...resolver.access,
      requiredModules: Object.freeze([...resolver.access.requiredModules]) as readonly ["asset"]
    });
  const snapshot: PropertyTaskSourceResolver & Partial<PropertyTaskProjectorSource> = {
    sourceType: resolver.sourceType,
    taskKind: resolver.taskKind,
    assignmentAuthority: resolver.assignmentAuthority,
    access,
    lockAndResolve: resolver.lockAndResolve.bind(resolver)
  };
  if (typeof resolver.invokeOwningCommand === "function") {
    snapshot.invokeOwningCommand = resolver.invokeOwningCommand.bind(resolver);
  }
  if ("scanCandidates" in resolver && typeof resolver.scanCandidates === "function") {
    snapshot.scanCandidates = resolver.scanCandidates.bind(resolver);
  }
  return Object.freeze(snapshot);
}

export type IsoDateTime = string;

export interface PropertyTaskListResponse {
  items: readonly PropertyTaskListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PropertyTaskListItem {
  taskId: string;
  assignmentAuthority: PropertyTaskAssignmentAuthority;
  taskKind: string;
  kindLabel: string;
  sourceType: string;
  sourceLabel: string;
  title: string;
  priority: number;
  dueAt: IsoDateTime | null;
  assignmentStatus: PropertyTaskStatus;
  assignmentVersion: number;
  assigneeDisplay: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  allowedActions: readonly PropertyTaskAction[];
  blockedReason?: string;
}

function exactOwnKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const canonicalExpected = [...expected].sort();
  return actual.length === canonicalExpected.length
    && actual.every((key, index) => key === canonicalExpected[index]);
}

export function validatePropertyTaskListItemWire(
  value: unknown,
  canReadSourceDetails: boolean
): string[] {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return ["Property task list item must be an object"];
  }
  const item = value as Record<string, unknown>;
  const blockedReasonExpected = item.assignmentStatus === "blocked" && canReadSourceDetails;
  const expected = PROPERTY_TASK_WIRE_FIELD_SETS.listItem.filter(
    (key) => key !== "blockedReason" || blockedReasonExpected
  );
  const issues: string[] = [];
  if (!exactOwnKeys(item, expected)) issues.push("Property task list item keys are not exact");
  if (!(item.dueAt === null || typeof item.dueAt === "string")) {
    issues.push("dueAt must be an explicit string or null");
  }
  if (!(item.assigneeDisplay === null || typeof item.assigneeDisplay === "string")) {
    issues.push("assigneeDisplay must be an explicit string or null");
  }
  if (!Array.isArray(item.allowedActions)) {
    issues.push("allowedActions must be an array");
  } else {
    const actionIndexes = item.allowedActions.map((action) =>
      PROPERTY_TASK_ACTIONS.indexOf(action as PropertyTaskAction));
    if (actionIndexes.some((index) => index < 0)
      || actionIndexes.some((index, position) => position > 0
        && index <= actionIndexes[position - 1]!)) {
      issues.push("allowedActions must be a unique ordered action subsequence");
    }
  }
  return issues;
}

export function validatePropertyTaskDetailWire(
  value: unknown,
  canReadSourceDetails: boolean
): string[] {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return ["Property task detail must be an object"];
  }
  const item = value as Record<string, unknown>;
  const terminal = item.assignmentStatus === "closed" || item.assignmentStatus === "cancelled";
  const blockedReasonExpected = item.assignmentStatus === "blocked" && canReadSourceDetails;
  const expected = [
    ...PROPERTY_TASK_WIRE_FIELD_SETS.listItem.filter(
      (key) => key !== "blockedReason" || blockedReasonExpected
    ),
    ...PROPERTY_TASK_WIRE_FIELD_SETS.detailExtension.filter((key) =>
      !["sourceId", "sourceDeepLink", "outcome"].includes(key)
      || (canReadSourceDetails && (key !== "outcome" || terminal))
    )
  ];
  const issues = validatePropertyTaskListItemWire(
    Object.fromEntries(Object.entries(item).filter(([key]) =>
      PROPERTY_TASK_WIRE_FIELD_SETS.listItem.includes(
        key as (typeof PROPERTY_TASK_WIRE_FIELD_SETS.listItem)[number]
      ))),
    canReadSourceDetails
  );
  if (!exactOwnKeys(item, expected)) issues.push("Property task detail keys are not exact");
  for (const key of ["claimedAt", "startedAt", "blockedUntil"] as const) {
    if (!(item[key] === null || typeof item[key] === "string")) {
      issues.push(`${key} must be an explicit string or null`);
    }
  }
  if (item.outcome !== undefined
    && !validatePropertyTaskExactWireKeys(item.outcome, "outcome")) {
    issues.push("outcome keys are not exact");
  }
  return issues;
}

export interface PropertyTaskDetailResponse extends PropertyTaskListItem {
  sourceVersion: number;
  businessOccurrenceKey: string;
  sourceId?: string;
  sourceDeepLink?: string | null;
  claimedAt: IsoDateTime | null;
  startedAt: IsoDateTime | null;
  blockedUntil: IsoDateTime | null;
  outcome?: {
    code: string;
    sourceVersion: number;
    at: IsoDateTime;
  };
}

export interface PropertyTaskMutationBase {
  clientKey: string;
  expectedAssignmentVersion: number;
  expectedSourceVersion: number;
  businessOccurrenceKey: string;
}

export type PropertyTaskClaimRequest = PropertyTaskMutationBase;
export type PropertyTaskStartRequest = PropertyTaskMutationBase;
export type PropertyTaskUnblockRequest = PropertyTaskMutationBase;

export interface PropertyTaskBlockRequest extends PropertyTaskMutationBase {
  reason: string;
  blockedUntil: IsoDateTime | null;
}

export interface PropertyTaskReleaseRequest extends PropertyTaskMutationBase {
  reason: string;
}

export interface PropertyTaskMutationResponse {
  task: PropertyTaskDetailResponse;
  replayed: boolean;
  replayedResultRef: string | null;
  originalResultVersion: number;
}

export interface PropertyTaskRebuildRequest {
  clientKey: string;
  sourceType: string;
  sourceId: string;
  expectedProjectionVersion: number;
  reason: string;
}

export interface PropertyTaskRebuildResponse {
  sourceType: string;
  sourceId: string;
  previousProjectionVersion: number;
  projectionVersion: number;
  projectedTaskCount: number;
  assignmentMutationCount: 0;
  replayed: boolean;
  replayedResultRef: string | null;
  originalResultVersion: number;
}

export const PROPERTY_TASK_WIRE_FIELD_SETS = {
  listResponse: ["items", "page", "pageSize", "total"],
  listItem: [
    "taskId", "assignmentAuthority", "taskKind", "kindLabel", "sourceType",
    "sourceLabel", "title", "priority", "dueAt", "assignmentStatus",
    "assignmentVersion", "assigneeDisplay", "createdAt", "updatedAt",
    "allowedActions", "blockedReason"
  ],
  detailExtension: [
    "sourceVersion", "businessOccurrenceKey", "sourceId", "sourceDeepLink",
    "claimedAt", "startedAt", "blockedUntil", "outcome"
  ],
  outcome: ["code", "sourceVersion", "at"],
  mutationBase: [
    "clientKey", "expectedAssignmentVersion", "expectedSourceVersion",
    "businessOccurrenceKey"
  ],
  mutationResponse: [
    "task", "replayed", "replayedResultRef", "originalResultVersion"
  ],
  rebuildRequest: [
    "clientKey", "sourceType", "sourceId", "expectedProjectionVersion", "reason"
  ],
  rebuildResponse: [
    "sourceType", "sourceId", "previousProjectionVersion", "projectionVersion",
    "projectedTaskCount", "assignmentMutationCount", "replayed",
    "replayedResultRef", "originalResultVersion"
  ]
} as const;

export type PropertyTaskWireFieldSetName = keyof typeof PROPERTY_TASK_WIRE_FIELD_SETS;

export function validatePropertyTaskExactWireKeys(
  value: unknown,
  fieldSet: PropertyTaskWireFieldSetName
): boolean {
  return value != null
    && typeof value === "object"
    && !Array.isArray(value)
    && exactOwnKeys(
      value as Record<string, unknown>,
      PROPERTY_TASK_WIRE_FIELD_SETS[fieldSet]
    );
}

export const PROPERTY_TASK_RECOVERY_ACTIONS = [
  "property.task.refresh",
  "property.task.return-to-workspace",
  "property.task.reload"
] as const;
export type PropertyTaskRecoveryAction =
  (typeof PROPERTY_TASK_RECOVERY_ACTIONS)[number];

export const PROPERTY_ERROR_RECOVERY_ACTIONS = [
  "reload",
  "retry-with-same-client-key",
  "party.identity.update-draft",
  ...PROPERTY_TASK_RECOVERY_ACTIONS
] as const;
export type PropertyErrorRecoveryAction =
  (typeof PROPERTY_ERROR_RECOVERY_ACTIONS)[number];

export interface PropertyTaskErrorData {
  errorCode: PropertyErrorCode;
  retryable: boolean;
  recoveryAction?: PropertyErrorRecoveryAction;
  latestVersion?: number;
  details: Record<string, unknown>;
}

export const PROPERTY_TASK_ERROR_GOLDEN = {
  "task-already-claimed": {
    status: 409, retryable: false, recoveryAction: "property.task.refresh",
    details: ["assigneeDisplay"]
  },
  "task-source-ineligible": {
    status: 409, retryable: false, recoveryAction: "property.task.return-to-workspace",
    details: ["deepLink"]
  },
  "task-version-conflict": {
    status: 409, retryable: true, recoveryAction: "property.task.reload",
    latestVersion: "required", details: []
  },
  "property-version-conflict": {
    status: 409, retryable: true, recoveryAction: "reload", details: []
  },
  "property-runtime-unavailable": {
    status: 503, retryable: true, recoveryAction: "retry-with-same-client-key", details: []
  },
  "property-action-forbidden": {
    status: 403, retryable: false, recoveryAction: null, details: []
  },
  "property-resource-not-found": {
    status: 404, retryable: false, recoveryAction: null, details: []
  }
} as const satisfies Partial<Record<PropertyErrorCode, {
  status: number;
  retryable: boolean;
  recoveryAction: PropertyErrorRecoveryAction | null;
  latestVersion?: "required";
  details: readonly string[];
}>>;

export const PROPERTY_MUTATION_RECEIPT_ACQUIRE_MODES = [
  "execute-or-replay",
  "existing-only"
] as const;
export type PropertyMutationReceiptAcquireMode =
  (typeof PROPERTY_MUTATION_RECEIPT_ACQUIRE_MODES)[number];

export const PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION = "port-v2" as const;

export type PropertyTaskMutationIdentity =
  | { tag: "property-task"; businessOccurrenceKey: string; taskKey: string }
  | { tag: "property-task-source-rebuild"; sourceType: string; sourceId: string };

export const LEGACY_MUTATION_RECEIPT_ACTION_AUTHORITY_MANIFEST = [
  { actionId: "property.approval.submit", owner: "approval-runtime-owner" },
  { actionId: "property.approval.withdraw", owner: "approval-runtime-owner" },
  { actionId: "property.approval.decide", owner: "approval-runtime-owner" },
  { actionId: "property.approval.incident-retry", owner: "approval-runtime-owner" },
  { actionId: "property.event.replay", owner: "approval-runtime-owner" },
  { actionId: "property.notification.mark-read", owner: "approval-runtime-owner" },
  { actionId: "party.identity.create-draft", owner: "property-foundation-identity-owner" },
  { actionId: "party.identity.update-draft", owner: "property-foundation-identity-owner" },
  { actionId: "party.identity.submit", owner: "property-foundation-identity-owner" },
  { actionId: "party.identity.claim", owner: "property-foundation-identity-owner" },
  { actionId: "party.identity.reassign", owner: "property-foundation-identity-owner" },
  { actionId: "party.identity.verify", owner: "property-foundation-identity-owner" },
  { actionId: "party.identity.withdraw", owner: "property-foundation-identity-owner" }
] as const;

export const PROPERTY_TASK_PORT_V2_ACTION_IDENTITY_MODE_MANIFEST = [
  {
    actionId: "property.task.rebuild",
    identityTag: "property-task-source-rebuild",
    acquireModes: ["execute-or-replay"]
  },
  {
    actionId: "property.task.claim",
    identityTag: "property-task",
    acquireModes: ["execute-or-replay"]
  },
  {
    actionId: "property.task.start",
    identityTag: "property-task",
    acquireModes: ["execute-or-replay"]
  },
  {
    actionId: "property.task.block",
    identityTag: "property-task",
    acquireModes: ["execute-or-replay"]
  },
  {
    actionId: "property.task.unblock",
    identityTag: "property-task",
    acquireModes: ["execute-or-replay"]
  },
  {
    actionId: "property.task.release",
    identityTag: "property-task",
    acquireModes: ["execute-or-replay"]
  },
  {
    actionId: "property.task.source-terminal.closed",
    identityTag: "property-task",
    acquireModes: ["execute-or-replay", "existing-only"]
  },
  {
    actionId: "property.task.source-terminal.cancelled",
    identityTag: "property-task",
    acquireModes: ["execute-or-replay", "existing-only"]
  }
] as const satisfies readonly {
  actionId: string;
  identityTag: PropertyTaskMutationIdentity["tag"];
  acquireModes: readonly PropertyMutationReceiptAcquireMode[];
}[];

export type PropertyTaskMutationReceiptAction =
  (typeof PROPERTY_TASK_PORT_V2_ACTION_IDENTITY_MODE_MANIFEST)[number]["actionId"];
export type PropertyTaskItemMutationReceiptAction = Exclude<
  PropertyTaskMutationReceiptAction,
  "property.task.rebuild"
>;

export function legacyMutationReceiptActionAuthorityManifestCanonicalBytes(): Uint8Array {
  return new TextEncoder().encode(
    "legacy-action-authority-v1\n"
    + LEGACY_MUTATION_RECEIPT_ACTION_AUTHORITY_MANIFEST.map((row) =>
      `row\t${row.actionId}\t${row.owner}\tlegacy-v1\n`
    ).join("")
  );
}

export function propertyTaskPortV2ActionIdentityModeManifestCanonicalBytes(): Uint8Array {
  return new TextEncoder().encode(
    "port-v2-action-identity-mode-v1\n"
    + PROPERTY_TASK_PORT_V2_ACTION_IDENTITY_MODE_MANIFEST.map((row) =>
      `row\t${row.actionId}\t${row.identityTag}\t${row.acquireModes.join(",")}\n`
    ).join("")
  );
}

/**
 * Cross-package transaction boundary for the receipt ABI. A real TypeORM
 * EntityManager satisfies this object type directly. C3 implementations must
 * pass that manager instance without a wrapper, cast or nested transaction.
 */
export type EntityManager = object;

interface PropertyMutationReceiptInputBase {
  scope: TenantParkScope;
  contractVersion: typeof PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION;
  actorId: string;
  targetId: string;
  clientKey: string;
  requestHash: string;
}

export type PropertyMutationReceiptAcquireInput = PropertyMutationReceiptInputBase & (
  | {
      actionId: "property.task.rebuild";
      identity: Extract<PropertyTaskMutationIdentity, { tag: "property-task-source-rebuild" }>;
      acquireMode: "execute-or-replay";
    }
  | {
      actionId: Exclude<
        PropertyTaskItemMutationReceiptAction,
        "property.task.source-terminal.closed" | "property.task.source-terminal.cancelled"
      >;
      identity: Extract<PropertyTaskMutationIdentity, { tag: "property-task" }>;
      acquireMode: "execute-or-replay";
    }
  | {
      actionId:
        | "property.task.source-terminal.closed"
        | "property.task.source-terminal.cancelled";
      identity: Extract<PropertyTaskMutationIdentity, { tag: "property-task" }>;
      acquireMode: PropertyMutationReceiptAcquireMode;
    }
);

export interface PropertyMutationReceiptExecute {
  kind: "execute";
  receiptId: string;
}

export interface PropertyMutationReceiptReplay {
  kind: "replay";
  resultHash: string;
  resultRef: string;
  resultVersion: number;
}

export type PropertyMutationReceiptAcquireResult =
  | PropertyMutationReceiptExecute
  | PropertyMutationReceiptReplay;

interface PropertyMutationReceiptCompleteBase extends PropertyMutationReceiptInputBase {
  receiptId: string;
  resultHash: string;
  resultRef: string;
  resultVersion: number;
}

export type PropertyMutationReceiptCompleteInput = PropertyMutationReceiptCompleteBase & (
  | {
      actionId: "property.task.rebuild";
      identity: Extract<PropertyTaskMutationIdentity, { tag: "property-task-source-rebuild" }>;
    }
  | {
      actionId: PropertyTaskItemMutationReceiptAction;
      identity: Extract<PropertyTaskMutationIdentity, { tag: "property-task" }>;
    }
);

export interface PropertyMutationReceiptPort {
  acquire(
    manager: EntityManager,
    input: PropertyMutationReceiptAcquireInput
  ): Promise<PropertyMutationReceiptAcquireResult>;
  complete(
    manager: EntityManager,
    input: PropertyMutationReceiptCompleteInput
  ): Promise<void>;
}

export const PROPERTY_MUTATION_RECEIPT_PORT =
  Symbol("PROPERTY_MUTATION_RECEIPT_PORT");

export interface PropertyTaskMutationResultInput {
  actionId: PropertyTaskMutationReceiptAction;
  targetId: string;
  identity: PropertyTaskMutationIdentity;
  resultRef: string;
  resultVersion: number;
}

export function propertyTaskMutationIdentityTag(
  identity: PropertyTaskMutationIdentity
): string {
  if (identity.tag === "property-task") {
    assertCanonicalPropertyTaskBusinessOccurrenceKey(identity.businessOccurrenceKey);
    if (!PROPERTY_TASK_KEY_PATTERN.test(identity.taskKey)) {
      throw new TypeError("taskKey must be 64 lowercase hexadecimal characters");
    }
    const byteLength = new TextEncoder().encode(identity.businessOccurrenceKey).byteLength;
    return `property-task:${identity.taskKey}:${byteLength}:${identity.businessOccurrenceKey}`;
  }
  assertCanonicalField("sourceType", identity.sourceType);
  if (!PROPERTY_TASK_SOURCE_TYPE_PATTERN.test(identity.sourceType)
    || !PROPERTY_TASK_UUID_PATTERN.test(identity.sourceId)) {
    throw new TypeError("Rebuild identity sourceType/sourceId is not canonical");
  }
  const byteLength = new TextEncoder().encode(identity.sourceType).byteLength;
  return `property-task-source-rebuild:${byteLength}:${identity.sourceType}:${identity.sourceId}`;
}

export function assertPropertyTaskMutationActionIdentityMode(input: {
  contractVersion: string;
  actionId: string;
  targetId: string;
  identity: PropertyTaskMutationIdentity;
  acquireMode?: string;
}): void {
  if (input.contractVersion !== PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION
    || !PROPERTY_TASK_UUID_PATTERN.test(input.targetId)) {
    throw new TypeError("Receipt contractVersion/targetId is not canonical");
  }
  const row = PROPERTY_TASK_PORT_V2_ACTION_IDENTITY_MODE_MANIFEST.find(
    (candidate) => candidate.actionId === input.actionId
  );
  if (!row || row.identityTag !== input.identity.tag
    || (input.acquireMode !== undefined
      && !(row.acquireModes as readonly string[]).includes(input.acquireMode))) {
    throw new TypeError("Receipt action/identity/acquireMode is not in the port-v2 manifest");
  }
  propertyTaskMutationIdentityTag(input.identity);
  if (input.identity.tag === "property-task-source-rebuild"
    && input.targetId !== input.identity.sourceId) {
    throw new TypeError("Rebuild targetId must equal identity sourceId");
  }
}

function assertPropertyTaskMutationResultRef(input: PropertyTaskMutationResultInput): void {
  assertCanonicalField("resultRef", input.resultRef);
  const version = input.resultVersion.toString();
  if (input.actionId === "property.task.rebuild") {
    const identity = input.identity as Extract<
      PropertyTaskMutationIdentity,
      { tag: "property-task-source-rebuild" }
    >;
    if (input.resultRef !== `property-task-rebuild/${identity.sourceType}/${identity.sourceId}/v${version}`) {
      throw new TypeError("Rebuild resultRef is not canonical");
    }
    return;
  }
  if (PROPERTY_TASK_ACTIONS.includes(input.actionId as PropertyTaskAction)) {
    if (input.resultRef !== `property-task/${input.targetId}/v${version}`) {
      throw new TypeError("Task command resultRef is not canonical");
    }
    return;
  }
  const terminal = input.actionId.endsWith(".closed") ? "closed" : "cancelled";
  const match = input.resultRef.match(
    /^property-task-source-terminal\/([a-z][a-z0-9_]{0,63})\/([0-9a-f-]+)\/(closed|cancelled)\/v([1-9][0-9]*)$/
  );
  if (!match || match[2] !== input.targetId || match[3] !== terminal || match[4] !== version) {
    throw new TypeError("Source terminal resultRef is not canonical");
  }
}

export function propertyTaskMutationResultCanonicalBytes(
  input: PropertyTaskMutationResultInput
): Uint8Array {
  assertPropertyTaskResultVersion(input.resultVersion);
  assertPropertyTaskMutationActionIdentityMode({
    contractVersion: PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION,
    actionId: input.actionId,
    targetId: input.targetId,
    identity: input.identity
  });
  assertPropertyTaskMutationResultRef(input);
  return new TextEncoder().encode(
    "property-mutation-result-v1\n"
    + `${input.actionId}\t${input.targetId}\t${propertyTaskMutationIdentityTag(input.identity)}\t`
    + `${input.resultRef}\t${input.resultVersion}\n`
  );
}

export async function propertyTaskMutationResultHash(
  input: PropertyTaskMutationResultInput
): Promise<string> {
  const canonicalBytes = propertyTaskMutationResultCanonicalBytes(input);
  const hashInput = new ArrayBuffer(canonicalBytes.byteLength);
  new Uint8Array(hashInput).set(canonicalBytes);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    hashInput
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const PROPERTY_TASK_REPLACE_MODES = ["manual-rebuild", "authority-sync"] as const;
export type PropertyTaskReplaceMode = (typeof PROPERTY_TASK_REPLACE_MODES)[number];

export const PROPERTY_TASK_REPLACEMENT_COMMAND_ACTIONS = [
  "property.task.rebuild",
  ...PROPERTY_TASK_ACTIONS,
  "property.task.source-terminal.closed",
  "property.task.source-terminal.cancelled"
] as const;
export type PropertyTaskReplacementCommandAction =
  (typeof PROPERTY_TASK_REPLACEMENT_COMMAND_ACTIONS)[number];

export const PROPERTY_TASK_SOURCE_TERMINALS = ["closed", "cancelled"] as const;
export type PropertyTaskSourceTerminal = (typeof PROPERTY_TASK_SOURCE_TERMINALS)[number];

export interface PropertyTaskSourceTerminalRequestV1 {
  schemaVersion: "property-task-source-terminal-v1";
  tenantId: string;
  parkId: string;
  terminalActorId: string;
  actionId:
    | "property.task.source-terminal.closed"
    | "property.task.source-terminal.cancelled";
  targetId: string;
  sourceType: string;
  sourceId: string;
  businessOccurrenceKey: string;
  taskKey: string;
  terminal: PropertyTaskSourceTerminal;
  sourceVersion: number;
  expectedAssignmentVersion: number;
  outcomeCode: string;
  outcomeAt: IsoDateTime;
}

export const PROPERTY_TASK_SOURCE_TERMINAL_REQUEST_FIELDS = [
  "schemaVersion", "tenantId", "parkId", "terminalActorId", "actionId", "targetId",
  "sourceType", "sourceId", "businessOccurrenceKey", "taskKey", "terminal",
  "sourceVersion", "expectedAssignmentVersion", "outcomeCode", "outcomeAt"
] as const;

export const PROPERTY_TASK_TERMINAL_CLIENT_KEY_PREFIX = "ptst-v1:" as const;
export const PROPERTY_TASK_TERMINAL_CLIENT_KEY_PATTERN = /^ptst-v1:[0-9a-f]{64}$/;

export interface PropertyTaskTerminalReceiptFenceInput {
  authorityState: "active" | "same-terminal";
  lockedAssignmentVersion: number;
  incomingExpectedAssignmentVersion: number;
}

export type PropertyTaskTerminalReceiptFenceResult =
  | {
      allowed: true;
      acquireMode: PropertyMutationReceiptAcquireMode;
      receiptAccessCount: 1;
    }
  | {
      allowed: false;
      errorCode: "property-version-conflict";
      receiptAccessCount: 0;
    };

export function evaluatePropertyTaskTerminalReceiptFence(
  input: PropertyTaskTerminalReceiptFenceInput
): PropertyTaskTerminalReceiptFenceResult {
  const incoming = input.incomingExpectedAssignmentVersion;
  const locked = input.lockedAssignmentVersion;
  const persistedPositive = (value: number) => Number.isInteger(value)
    && value > 0 && value <= PROPERTY_TASK_RESULT_VERSION_MAX;
  const allowed = input.authorityState === "active"
    ? persistedPositive(incoming) && persistedPositive(locked)
      && incoming === locked && locked < PROPERTY_TASK_RESULT_VERSION_MAX
    : persistedPositive(incoming) && persistedPositive(locked)
      && incoming < PROPERTY_TASK_RESULT_VERSION_MAX && incoming + 1 === locked;
  return allowed
    ? {
        allowed: true,
        acquireMode: input.authorityState === "active"
          ? "execute-or-replay"
          : "existing-only",
        receiptAccessCount: 1
      }
    : { allowed: false, errorCode: "property-version-conflict", receiptAccessCount: 0 };
}

export function propertyTaskSourceTerminalClientKeyCanonicalBytes(
  input: PropertyTaskSourceTerminalRequestV1
): Uint8Array {
  for (const [name, value] of Object.entries(input)) {
    if (typeof value === "string") assertCanonicalField(name, value);
  }
  const expectedAction = `property.task.source-terminal.${input.terminal}`;
  if (!PROPERTY_TASK_SOURCE_TERMINALS.includes(input.terminal)
    || input.schemaVersion !== "property-task-source-terminal-v1"
    || input.actionId !== expectedAction
    || input.targetId !== input.sourceId) {
    throw new TypeError("Source terminal/action/target identity is not canonical");
  }
  if (!PROPERTY_TASK_UUID_PATTERN.test(input.terminalActorId)
    || !PROPERTY_TASK_UUID_PATTERN.test(input.sourceId)
    || !PROPERTY_TASK_UUID_PATTERN.test(input.targetId)) {
    throw new TypeError("terminalActorId, sourceId and targetId must be lowercase canonical UUIDs");
  }
  if (!PROPERTY_TASK_KEY_PATTERN.test(input.taskKey)) {
    throw new TypeError("taskKey must be 64 lowercase hexadecimal characters");
  }
  assertCanonicalPropertyTaskBusinessOccurrenceKey(input.businessOccurrenceKey);
  if (!PROPERTY_TASK_SOURCE_TYPE_PATTERN.test(input.sourceType)
    || !PROPERTY_TASK_OUTCOME_CODE_PATTERN.test(input.outcomeCode)
    || !isCanonicalUtcMillisecondIso(input.outcomeAt)
    || !Number.isInteger(input.sourceVersion)
    || input.sourceVersion <= 0
    || input.sourceVersion > PROPERTY_TASK_RESULT_VERSION_MAX
    || !Number.isInteger(input.expectedAssignmentVersion)
    || input.expectedAssignmentVersion <= 0
    || input.expectedAssignmentVersion > PROPERTY_TASK_RESULT_VERSION_MAX) {
    throw new TypeError("Source terminal input is not canonical");
  }
  return new TextEncoder().encode(
    "property-task-source-terminal-client-key-v1\n"
    + `${input.tenantId}\t${input.parkId}\t${input.terminalActorId}\t${input.sourceType}\t`
    + `${input.sourceId}\t${input.businessOccurrenceKey}\t${input.taskKey}\t${input.terminal}\t`
    + `${input.sourceVersion}\t${input.outcomeCode}\t${input.outcomeAt}\n`
  );
}

export type PropertyTaskReplacementResultRef =
  | `property-task-rebuild/${string}/${string}/v${number}`
  | `property-task/${string}/v${number}`
  | `property-task-source-terminal/${string}/${string}/${PropertyTaskSourceTerminal}/v${number}`;

export const PROPERTY_TASK_RUNTIME_ALERT_CODES = [
  "property-task-projector-failed",
  "property-task-terminal-conflict",
  "property-task-receipt-stuck",
  "property-task-control-drift"
] as const;
export type PropertyTaskRuntimeAlertCode =
  (typeof PROPERTY_TASK_RUNTIME_ALERT_CODES)[number];

export const PROPERTY_TASK_RUNTIME_RUNBOOK_KEYS = {
  "property-task-projector-failed": "property-task-projector-failed-runbook",
  "property-task-terminal-conflict": "property-task-terminal-conflict-runbook",
  "property-task-receipt-stuck": "property-task-receipt-stuck-runbook",
  "property-task-control-drift": "property-task-control-drift-runbook"
} as const satisfies Record<PropertyTaskRuntimeAlertCode, string>;

export interface PropertyRuntimeAlertV1 {
  schemaVersion: "property-runtime-alert-v1";
  alertCode: PropertyTaskRuntimeAlertCode;
  severity: "P0" | "P1" | "P2";
  tenantId: string;
  parkId: string;
  stableRef: { kind: string; id: string };
  errorCode: string;
  attempt: number | null;
  ageSeconds: number | null;
  traceId: string;
  runbookKey: (typeof PROPERTY_TASK_RUNTIME_RUNBOOK_KEYS)[PropertyTaskRuntimeAlertCode];
}

export type PropertyTaskEndpointContract = Pick<
  PropertyTrackBEndpointPermission,
  "requiredPermissions" | "authorizationAlternatives"
>;
