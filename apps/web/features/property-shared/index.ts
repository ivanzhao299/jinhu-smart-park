export {
  projectPropertyCapabilities,
  resolvePropertyRoute
} from "./access/capability-adapter";
export type {
  PropertyActionCapability,
  PropertyCapabilityProjection,
  PropertyFileCapability,
  PropertyRouteResolution
} from "./access/capability-adapter";

export { RemoteEntityPicker } from "./picker/RemoteEntityPicker";
export type { RemoteEntityPickerProps } from "./picker/RemoteEntityPicker";
export type {
  RemoteEntityLoader,
  RemoteEntityLoadInput,
  RemoteEntityOption,
  RemoteEntityPage
} from "./picker/types";

export { CanonicalDetailShell } from "./detail/CanonicalDetailShell";
export type {
  CanonicalDetailShellProps,
  CanonicalDetailState
} from "./detail/CanonicalDetailShell";
export {
  createReturnHref,
  decodeReturnContext,
  encodeReturnContext,
  resolveReturnHref,
  resolveSameOriginReturnHref
} from "./detail/return-context";
export type {
  ReturnContextPolicy,
  ReturnRouteDefinition,
  StructuredReturnContext
} from "./detail/return-context";

export { ConsequenceDialog } from "./dialog/ConsequenceDialog";
export type {
  ConsequenceDialogProps,
  ConsequenceReasonPolicy,
  ConsequenceTarget
} from "./dialog/ConsequenceDialog";

export {
  PropertyPageSurface,
  PropertyPanelSurface,
  PropertyResponsiveRecords,
  propertyAccessibleControlClassName
} from "./ds/PropertyPageSurfaces";
export type {
  PropertyFieldDescriptor,
  PropertyPageSurfaceProps,
  PropertyPanelSurfaceProps,
  PropertyRecordPresentation,
  PropertyResponsiveRecordsProps
} from "./ds/PropertyPageSurfaces";

export { LiveRegion } from "./states/LiveRegion";
export type { LiveRegionProps } from "./states/LiveRegion";
export { PageState } from "./states/PageState";
export type { PageStateProps } from "./states/PageState";
export type {
  PageState as PropertyPageState,
  PageStateKind
} from "./states/page-state";

export { TaskPresentation } from "./tasks/TaskPresentation";
export type { TaskPresentationProps } from "./tasks/TaskPresentation";
export type {
  TaskFilterChip,
  TaskLightAction,
  TaskStaleProjection
} from "./tasks/task-presentation";
