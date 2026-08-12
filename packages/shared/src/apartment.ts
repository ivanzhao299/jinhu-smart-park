export const APARTMENT_ROOM_TYPES = ["talent", "executive", "employee"] as const;
export type ApartmentRoomType = (typeof APARTMENT_ROOM_TYPES)[number];

export const APARTMENT_GENDER_POLICIES = ["any", "male", "female"] as const;
export type ApartmentGenderPolicy = (typeof APARTMENT_GENDER_POLICIES)[number];

export const APARTMENT_APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "cancelled",
  "allocated",
  "checked_in",
  "checkout_pending",
  "completed"
] as const;
export type ApartmentApplicationStatus = (typeof APARTMENT_APPLICATION_STATUSES)[number];

export const APARTMENT_STAY_STATUSES = ["reserved", "active", "checkout_pending", "completed", "cancelled"] as const;
export type ApartmentStayStatus = (typeof APARTMENT_STAY_STATUSES)[number];

export const APARTMENT_PERMISSIONS = {
  APARTMENT_MENU: "apartment",
  APARTMENT_DASHBOARD_PAGE: "apartment:dashboard",
  APARTMENT_ROOMS_PAGE: "apartment:rooms",
  APARTMENT_APPLICATIONS_PAGE: "apartment:applications",
  APARTMENT_STAYS_PAGE: "apartment:stays",
  APARTMENT_CHECKOUTS_PAGE: "apartment:checkouts",
  APARTMENT_DOCUMENTS_PAGE: "apartment:documents",
  APARTMENT_READ: "apartment:read",
  APARTMENT_ROOM_MANAGE: "apartment:room_manage",
  APARTMENT_APPLY: "apartment:apply",
  APARTMENT_APPLICATION_MANAGE: "apartment:application_manage",
  APARTMENT_APPROVE: "apartment:approve",
  APARTMENT_ALLOCATE: "apartment:allocate",
  APARTMENT_CHECK_IN: "apartment:check_in",
  APARTMENT_CHECK_OUT: "apartment:check_out",
  APARTMENT_DOCUMENT_MANAGE: "apartment:document_manage",
  APARTMENT_AUDIT: "apartment:audit"
} as const;
