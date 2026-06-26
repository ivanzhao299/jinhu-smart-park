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

export const ENGINEERING_PROJECT_TYPE_VALUES = Object.values(EngineeringProjectType);
export const ENGINEERING_PROJECT_STATUS_VALUES = Object.values(EngineeringProjectStatus);
export const ENGINEERING_PROJECT_LEVEL_VALUES = Object.values(EngineeringProjectLevel);
export const ENGINEERING_RISK_LEVEL_VALUES = Object.values(EngineeringRiskLevel);
export const ENGINEERING_TRANSFER_STATUS_VALUES = Object.values(EngineeringTransferStatus);
export const ENGINEERING_FINANCE_STATUS_VALUES = Object.values(EngineeringFinanceStatus);
export const ENGINEERING_ASSET_STATUS_VALUES = Object.values(EngineeringAssetStatus);
