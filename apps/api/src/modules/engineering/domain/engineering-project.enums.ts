export enum EngineeringProjectType {
  NEW_BUILD = "NEW_BUILD",
  RENOVATION = "RENOVATION",
  DECORATION = "DECORATION",
  INSTALLATION = "INSTALLATION",
  REPAIR = "REPAIR",
  MUNICIPAL = "MUNICIPAL",
  LANDSCAPE = "LANDSCAPE",
  ELECTRICAL = "ELECTRICAL",
  WEAK_CURRENT = "WEAK_CURRENT",
  FIRE_PROTECTION = "FIRE_PROTECTION",
  HVAC = "HVAC",
  OTHER = "OTHER"
}

export enum EngineeringProjectStatus {
  DRAFT = "DRAFT",
  SUBMITTED = "SUBMITTED",
  APPROVED = "APPROVED",
  PLANNING = "PLANNING",
  EXECUTING = "EXECUTING",
  INSPECTING = "INSPECTING",
  RECTIFYING = "RECTIFYING",
  ACCEPTING = "ACCEPTING",
  ACCEPTED = "ACCEPTED",
  TRANSFER_READY = "TRANSFER_READY",
  SETTLEMENT_READY = "SETTLEMENT_READY",
  CLOSED = "CLOSED",
  ARCHIVED = "ARCHIVED",
  CANCELLED = "CANCELLED"
}

export enum EngineeringProjectLevel {
  NORMAL = "NORMAL",
  IMPORTANT = "IMPORTANT",
  MAJOR = "MAJOR"
}

export enum EngineeringRiskLevel {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL"
}

export enum EngineeringTransferStatus {
  NOT_READY = "NOT_READY",
  READY = "READY",
  TRANSFER_PENDING = "TRANSFER_PENDING",
  TRANSFERRED = "TRANSFERRED",
  REJECTED = "REJECTED"
}

export enum EngineeringFinanceStatus {
  NOT_REQUIRED = "NOT_REQUIRED",
  PENDING = "PENDING",
  PARTIAL = "PARTIAL",
  COMPLETED = "COMPLETED"
}

export enum EngineeringAssetStatus {
  NOT_REQUIRED = "NOT_REQUIRED",
  PENDING = "PENDING",
  GENERATED = "GENERATED"
}

export enum EngineeringPlanType {
  MASTER = "MASTER",
  PHASE = "PHASE",
  WEEKLY = "WEEKLY",
  DAILY = "DAILY",
  SPECIAL = "SPECIAL",
  MILESTONE = "MILESTONE"
}

export enum EngineeringPlanStatus {
  DRAFT = "DRAFT",
  SUBMITTED = "SUBMITTED",
  APPROVED = "APPROVED",
  IN_PROGRESS = "IN_PROGRESS",
  DELAYED = "DELAYED",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED"
}

export enum EngineeringPlanLevel {
  L1 = "L1",
  L2 = "L2",
  L3 = "L3",
  L4 = "L4"
}

export enum EngineeringDailyReportStatus {
  DRAFT = "DRAFT",
  SUBMITTED = "SUBMITTED",
  REVIEWED = "REVIEWED",
  REJECTED = "REJECTED",
  ARCHIVED = "ARCHIVED"
}

export enum EngineeringWeatherType {
  SUNNY = "SUNNY",
  CLOUDY = "CLOUDY",
  OVERCAST = "OVERCAST",
  RAIN = "RAIN",
  SNOW = "SNOW",
  WINDY = "WINDY",
  FOG = "FOG",
  OTHER = "OTHER"
}

export enum EngineeringInspectionType {
  ROUTINE = "ROUTINE",
  QUALITY = "QUALITY",
  SAFETY = "SAFETY",
  PROGRESS = "PROGRESS",
  MATERIAL = "MATERIAL",
  HIDDEN_WORK = "HIDDEN_WORK",
  SPECIAL = "SPECIAL",
  ACCEPTANCE_PRECHECK = "ACCEPTANCE_PRECHECK",
  OTHER = "OTHER"
}

export enum EngineeringInspectionStatus {
  DRAFT = "DRAFT",
  SUBMITTED = "SUBMITTED",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED"
}

export enum EngineeringIssueType {
  QUALITY = "QUALITY",
  SAFETY = "SAFETY",
  PROGRESS = "PROGRESS",
  DESIGN = "DESIGN",
  MATERIAL = "MATERIAL",
  ENVIRONMENT = "ENVIRONMENT",
  CIVILIZED_CONSTRUCTION = "CIVILIZED_CONSTRUCTION",
  OTHER = "OTHER"
}

export enum EngineeringIssueSeverity {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL"
}

export enum EngineeringIssueStatus {
  OPEN = "OPEN",
  RECTIFICATION_PENDING = "RECTIFICATION_PENDING",
  RECTIFYING = "RECTIFYING",
  RECHECKING = "RECHECKING",
  CLOSED = "CLOSED",
  CANCELLED = "CANCELLED"
}

export enum EngineeringIssueSourceType {
  INSPECTION = "INSPECTION",
  DAILY_REPORT = "DAILY_REPORT",
  MANUAL = "MANUAL",
  OTHER = "OTHER"
}

export enum EngineeringRectificationStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  SUBMITTED = "SUBMITTED",
  RECHECKING = "RECHECKING",
  PASSED = "PASSED",
  REJECTED = "REJECTED",
  OVERDUE = "OVERDUE",
  CLOSED = "CLOSED"
}

export const ENGINEERING_PROJECT_TYPE_VALUES = Object.values(EngineeringProjectType);
export const ENGINEERING_PROJECT_STATUS_VALUES = Object.values(EngineeringProjectStatus);
export const ENGINEERING_PROJECT_LEVEL_VALUES = Object.values(EngineeringProjectLevel);
export const ENGINEERING_RISK_LEVEL_VALUES = Object.values(EngineeringRiskLevel);
export const ENGINEERING_TRANSFER_STATUS_VALUES = Object.values(EngineeringTransferStatus);
export const ENGINEERING_FINANCE_STATUS_VALUES = Object.values(EngineeringFinanceStatus);
export const ENGINEERING_ASSET_STATUS_VALUES = Object.values(EngineeringAssetStatus);
export const ENGINEERING_PLAN_TYPE_VALUES = Object.values(EngineeringPlanType);
export const ENGINEERING_PLAN_STATUS_VALUES = Object.values(EngineeringPlanStatus);
export const ENGINEERING_PLAN_LEVEL_VALUES = Object.values(EngineeringPlanLevel);
export const ENGINEERING_DAILY_REPORT_STATUS_VALUES = Object.values(EngineeringDailyReportStatus);
export const ENGINEERING_WEATHER_TYPE_VALUES = Object.values(EngineeringWeatherType);
export const ENGINEERING_INSPECTION_TYPE_VALUES = Object.values(EngineeringInspectionType);
export const ENGINEERING_INSPECTION_STATUS_VALUES = Object.values(EngineeringInspectionStatus);
export const ENGINEERING_ISSUE_TYPE_VALUES = Object.values(EngineeringIssueType);
export const ENGINEERING_ISSUE_SEVERITY_VALUES = Object.values(EngineeringIssueSeverity);
export const ENGINEERING_ISSUE_STATUS_VALUES = Object.values(EngineeringIssueStatus);
export const ENGINEERING_ISSUE_SOURCE_TYPE_VALUES = Object.values(EngineeringIssueSourceType);
export const ENGINEERING_RECTIFICATION_STATUS_VALUES = Object.values(EngineeringRectificationStatus);
