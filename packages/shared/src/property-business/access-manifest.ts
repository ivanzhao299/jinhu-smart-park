import {
  PROPERTY_BUSINESS_LEGACY_PAGE_PERMISSIONS,
  PROPERTY_BUSINESS_PERMISSIONS
} from "./permissions";
import {
  PROPERTY_BUSINESS_COMPATIBILITY_REDIRECTS,
  PROPERTY_BUSINESS_LANDING,
  PROPERTY_BUSINESS_SURFACES,
  type PropertyBusinessModuleCode,
  type PropertyBusinessSurfaceRoute
} from "./routes";

export type PropertyDataDimension =
  | "tenant"
  | "park"
  | "building"
  | "unit"
  | "owner"
  | "assignee";
export type PropertyFieldClassification =
  | "public"
  | "internal"
  | "personal"
  | "sensitive"
  | "financial";
export type PropertyFieldProjection = "full" | "masked" | "omitted" | "readonly";
export type PropertyHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type PropertyApprovalRequirement = "not-required" | "required";
export type PropertyApprovalEnforcement = "available" | "blocked-until-track-b";

export interface PropertyApprovalPolicy {
  requirement: PropertyApprovalRequirement;
  enforcement: PropertyApprovalEnforcement;
  policyId?: string;
}

export interface PropertyAccessAction {
  actionId: string;
  method: PropertyHttpMethod;
  path: string;
  /**
   * The primary action permission. Composite selector/read prerequisites remain
   * explicit in requiredPermissions instead of being hidden in a role name.
   */
  permission: string;
  requiredPermissions?: readonly string[];
  /**
   * Permissions accepted by a controller-level "any of" guard. For
   * payload-dispatched endpoints, `permission` remains the permission for the
   * specific semantic variant while this list records the complete route gate.
   */
  anyPermissions?: readonly string[];
  variant?: string;
  variantPredicate?: {
    allEquals?: Readonly<Record<string, string>>;
    anyNonZero?: readonly string[];
  };
  idempotency: "required" | "not-required";
  approvalPolicy: PropertyApprovalPolicy;
  highRisk?: boolean;
}

export interface PropertyFieldPolicy {
  field: string;
  classification: PropertyFieldClassification;
  readPermission?: string;
  projection: PropertyFieldProjection;
}

export interface PropertyFilePolicy {
  bizTypes: readonly string[];
  readPermission: string;
  readAnyPermissions?: readonly string[];
  uploadPermission?: string;
  deletePermission?: string;
  genericReadPermission: "file:read";
  genericDownloadPermission: "file:download";
  genericUploadPermission?: "file:upload";
  genericDeletePermission?: "file:delete";
  referenceScope: "tenant-park-unit" | "tenant-park-reference" | "tenant-park-owner-pending";
}

export interface PropertyAccessManifestEntry {
  featureId: string;
  module: {
    required: PropertyBusinessModuleCode;
    dependencies: readonly ["asset"];
  };
  surface: PropertyBusinessSurfaceRoute;
  actions: readonly PropertyAccessAction[];
  data: {
    dimensions: readonly PropertyDataDimension[];
    enforcement: "repository" | "service" | "both";
  };
  fields: readonly PropertyFieldPolicy[];
  files: readonly PropertyFilePolicy[];
}

const NO_APPROVAL: PropertyApprovalPolicy = {
  requirement: "not-required",
  enforcement: "available"
};

function read(
  actionId: string,
  path: string,
  permission: string,
  options: {
    requiredPermissions?: readonly string[];
    anyPermissions?: readonly string[];
  } = {}
): PropertyAccessAction {
  return {
    actionId,
    method: "GET",
    path,
    permission,
    requiredPermissions: options.requiredPermissions,
    anyPermissions: options.anyPermissions,
    idempotency: "not-required",
    approvalPolicy: NO_APPROVAL
  };
}

function mutation(
  actionId: string,
  method: Exclude<PropertyHttpMethod, "GET">,
  path: string,
  permission: string,
  options: {
    requiredPermissions?: readonly string[];
    anyPermissions?: readonly string[];
    variant?: string;
    variantPredicate?: PropertyAccessAction["variantPredicate"];
    highRiskPolicyId?: string;
  } = {}
): PropertyAccessAction {
  const highRisk = Boolean(options.highRiskPolicyId);
  return {
    actionId,
    method,
    path,
    permission,
    requiredPermissions: options.requiredPermissions,
    anyPermissions: options.anyPermissions,
    variant: options.variant,
    variantPredicate: options.variantPredicate,
    idempotency: "required",
    approvalPolicy: highRisk
      ? {
          requirement: "required",
          enforcement: "available",
          policyId: options.highRiskPolicyId
        }
      : NO_APPROVAL,
    ...(highRisk ? { highRisk: true } : {})
  };
}

function surface(featureId: string): PropertyBusinessSurfaceRoute {
  const value = PROPERTY_BUSINESS_SURFACES.find((item) => item.featureId === featureId);
  if (!value) throw new Error(`Unknown property-business surface: ${featureId}`);
  return value;
}

const unitScopedData = {
  dimensions: ["tenant", "park", "building", "unit"] as const,
  enforcement: "both" as const
};

const tenantParkData = {
  dimensions: ["tenant", "park"] as const,
  enforcement: "both" as const
};

const financial = (field: string, readPermission: string): PropertyFieldPolicy => ({
  field,
  classification: "financial",
  readPermission,
  projection: "full"
});

const readonlyReference = (
  field: string,
  readPermission: string
): PropertyFieldPolicy => ({
  field,
  classification: "internal",
  readPermission,
  projection: "readonly"
});

const protectedFiles = (
  bizType: string,
  readPermission: string,
  writePermission: string,
  options: {
    readAnyPermissions?: readonly string[];
    referenceScope?: PropertyFilePolicy["referenceScope"];
  } = {}
): PropertyFilePolicy => ({
  bizTypes: [bizType],
  readPermission,
  readAnyPermissions: options.readAnyPermissions,
  uploadPermission: writePermission,
  deletePermission: writePermission,
  genericReadPermission: "file:read",
  genericDownloadPermission: "file:download",
  genericUploadPermission: "file:upload",
  genericDeletePermission: "file:delete",
  referenceScope: options.referenceScope ?? "tenant-park-unit"
});

export const PROPERTY_BUSINESS_PROTECTED_BIZ_TYPES = [
  "housing_lease_signature",
  "housing_handover",
  "housing_handover_move_in",
  "housing_handover_move_out",
  "housing_repair",
  "housing_purchase",
  "homestay_turnover"
] as const;

export const PROPERTY_ACCESS_MANIFEST: readonly PropertyAccessManifestEntry[] = [
  {
    featureId: "homestay.dashboard",
    module: { required: "homestay", dependencies: ["asset"] },
    surface: surface("homestay.dashboard"),
    actions: [
      read("homestay.dashboard.read", "/homestay/dashboard", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_DASHBOARD_READ)
    ],
    data: unitScopedData,
    fields: [
      financial("average_daily_rate", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_RATE_READ),
      financial("revenue", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_FINANCE_READ)
    ],
    files: []
  },
  {
    featureId: "homestay.tasks",
    module: { required: "homestay", dependencies: ["asset"] },
    surface: surface("homestay.tasks"),
    actions: [
      read(
        "homestay.tasks.list",
        "/homestay/tasks",
        PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_TASK_READ
      )
    ],
    data: { dimensions: ["tenant", "park", "unit", "assignee"], enforcement: "both" },
    fields: [],
    files: []
  },
  {
    featureId: "homestay.availability",
    module: { required: "homestay", dependencies: ["asset"] },
    surface: surface("homestay.availability"),
    actions: [
      read("homestay.availability.read", "/homestay/availability", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ)
    ],
    data: unitScopedData,
    fields: [],
    files: []
  },
  {
    featureId: "homestay.rates",
    module: { required: "homestay", dependencies: ["asset"] },
    surface: surface("homestay.rates"),
    actions: [
      read(
        "homestay.rates.unit-candidates",
        "/homestay/unit-candidates",
        PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_RATE_READ,
        {
          anyPermissions: [
            PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_RATE_READ,
            PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_RATE_MANAGE,
            PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ,
            PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_CREATE
          ]
        }
      ),
      read("homestay.rates.read", "/homestay/rates/:unitId", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_RATE_READ),
      mutation("homestay.rates.upsert", "PUT", "/homestay/rates/:unitId", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_RATE_MANAGE),
      mutation("homestay.rates.override", "POST", "/homestay/rates/:unitId/overrides", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_RATE_MANAGE)
    ],
    data: unitScopedData,
    fields: [
      financial("base_daily_rate", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_RATE_READ),
      financial("override_rate", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_RATE_READ),
      financial("final_rate", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_RATE_READ)
    ],
    files: []
  },
  {
    featureId: "homestay.bookings",
    module: { required: "homestay", dependencies: ["asset"] },
    surface: surface("homestay.bookings"),
    actions: [
      read("homestay.bookings.list", "/homestay/bookings", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ),
      read("homestay.bookings.detail", "/homestay/bookings/:id", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ),
      read(
        "homestay.bookings.guest-candidates",
        "/homestay/guest-candidates",
        PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ
      ),
      mutation("homestay.bookings.create", "POST", "/homestay/bookings", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_CREATE),
      mutation("homestay.bookings.confirm", "POST", "/homestay/bookings/:id/confirm", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_CONFIRM, {
        requiredPermissions: [PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ]
      }),
      mutation("homestay.bookings.cancel", "POST", "/homestay/bookings/:id/cancel", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_CANCEL, {
        requiredPermissions: [
          PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ,
          PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_CREATE
        ],
        highRiskPolicyId: "homestay.booking.cancel"
      }),
      mutation("homestay.bookings.reschedule", "POST", "/homestay/bookings/:id/reschedule", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_RESCHEDULE, {
        requiredPermissions: [PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ]
      })
    ],
    data: unitScopedData,
    fields: [
      financial("booking.room_amount", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_FINANCE_READ),
      financial("booking.adjustment_amount", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_FINANCE_READ),
      financial("booking.total_amount", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_FINANCE_READ),
      {
        field: "guests.identity_number_masked",
        classification: "sensitive",
        readPermission: PROPERTY_BUSINESS_PERMISSIONS.PARTY_SENSITIVE_READ,
        projection: "masked"
      }
    ],
    files: []
  },
  {
    featureId: "homestay.stays",
    module: { required: "homestay", dependencies: ["asset"] },
    surface: surface("homestay.stays"),
    actions: [
      read(
        "homestay.stays.list",
        "/homestay/stays",
        PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_STAY_READ
      ),
      read(
        "homestay.stays.detail",
        "/homestay/stays/:stayId",
        PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_STAY_READ
      ),
      mutation("homestay.stays.no-show", "POST", "/homestay/bookings/:id/no-show", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_STAY_MANAGE, {
        requiredPermissions: [PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ]
      }),
      mutation("homestay.stays.add-guest", "POST", "/homestay/bookings/:id/guests", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_STAY_MANAGE, {
        requiredPermissions: [PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ]
      }),
      mutation("homestay.stays.issue-credential", "POST", "/homestay/bookings/:id/credentials", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_STAY_MANAGE, {
        requiredPermissions: [PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ]
      }),
      mutation("homestay.stays.return-credential", "POST", "/homestay/bookings/:id/credentials/:credentialId/return", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_STAY_MANAGE, {
        requiredPermissions: [PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ]
      }),
      mutation("homestay.stays.check-in", "POST", "/homestay/bookings/:id/check-in", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_STAY_MANAGE, {
        requiredPermissions: [PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ]
      }),
      mutation("homestay.stays.check-out", "POST", "/homestay/bookings/:id/check-out", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_STAY_MANAGE, {
        requiredPermissions: [PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ]
      })
    ],
    data: unitScopedData,
    fields: [
      {
        field: "credentials.credential_reference",
        classification: "sensitive",
        readPermission: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_STAY_MANAGE,
        projection: "masked"
      }
    ],
    files: []
  },
  {
    featureId: "homestay.turnovers",
    module: { required: "homestay", dependencies: ["asset"] },
    surface: surface("homestay.turnovers"),
    actions: [
      read("homestay.turnovers.list", "/homestay/turnovers", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_TURNOVER_READ),
      read(
        "homestay.turnovers.detail",
        "/homestay/turnovers/:id",
        PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_TURNOVER_READ
      ),
      read(
        "homestay.turnovers.work-order-candidates",
        "/homestay/work-order-candidates",
        PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_TURNOVER_READ
      ),
      mutation("homestay.turnovers.execute", "POST", "/homestay/turnovers/:id/actions/:action", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_TURNOVER_EXECUTE)
    ],
    data: { dimensions: ["tenant", "park", "unit", "assignee"], enforcement: "both" },
    fields: [
      readonlyReference(
        "turnover.evidence_file_ids",
        PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_TURNOVER_READ
      )
    ],
    files: [
      protectedFiles(
        "homestay_turnover",
        PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_TURNOVER_READ,
        PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_TURNOVER_EXECUTE
      )
    ]
  },
  {
    featureId: "homestay.finance",
    module: { required: "homestay", dependencies: ["asset"] },
    surface: surface("homestay.finance"),
    actions: [
      read(
        "homestay.finance.list",
        "/homestay/finance",
        PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_FINANCE_READ
      ),
      mutation("homestay.finance.register", "POST", "/homestay/bookings/:id/ledger", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_FINANCE_REGISTER, {
        requiredPermissions: [PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ],
        anyPermissions: [
          PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_FINANCE_REGISTER,
          PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_FINANCE_WAIVE
        ],
        variant: "charge-or-payment"
      }),
      mutation("homestay.finance.refund-or-waive", "POST", "/homestay/bookings/:id/ledger", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_FINANCE_WAIVE, {
        requiredPermissions: [PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ],
        anyPermissions: [
          PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_FINANCE_REGISTER,
          PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_FINANCE_WAIVE
        ],
        variant: "refund-or-waiver",
        highRiskPolicyId: "homestay.finance.refund-or-waiver"
      })
    ],
    data: unitScopedData,
    fields: [
      financial("ledger.amount", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_FINANCE_READ),
      financial("ledger_summary", PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_FINANCE_READ)
    ],
    files: []
  },
  {
    featureId: "housing.dashboard",
    module: { required: "housing_rental", dependencies: ["asset"] },
    surface: surface("housing.dashboard"),
    actions: [
      read("housing.dashboard.read", "/housing/dashboard", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_DASHBOARD_READ)
    ],
    data: unitScopedData,
    fields: [
      financial("receivable_amount", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_READ),
      financial("collected_amount", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_READ),
      financial("outstanding_amount", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_READ),
      financial("approved_purchase_cost", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_READ)
    ],
    files: []
  },
  {
    featureId: "housing.tasks",
    module: { required: "housing_rental", dependencies: ["asset"] },
    surface: surface("housing.tasks"),
    actions: [
      read(
        "housing.tasks.list",
        "/housing/tasks",
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TASK_READ
      )
    ],
    data: { dimensions: ["tenant", "park", "unit", "assignee"], enforcement: "both" },
    fields: [],
    files: []
  },
  {
    featureId: "housing.tenants",
    module: { required: "housing_rental", dependencies: ["asset"] },
    surface: surface("housing.tenants"),
    actions: [
      read("housing.tenants.list", "/housing/tenants", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANT_READ),
      mutation("housing.tenants.create", "POST", "/housing/tenants", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANT_MANAGE)
    ],
    data: tenantParkData,
    fields: [
      {
        field: "tenant.mobile",
        classification: "personal",
        readPermission: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANT_MANAGE,
        projection: "masked"
      },
      {
        field: "tenant.email",
        classification: "personal",
        readPermission: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANT_MANAGE,
        projection: "masked"
      },
      {
        field: "tenant.identity_number_masked",
        classification: "sensitive",
        readPermission: PROPERTY_BUSINESS_PERMISSIONS.PARTY_SENSITIVE_READ,
        projection: "masked"
      }
    ],
    files: []
  },
  {
    featureId: "housing.leases",
    module: { required: "housing_rental", dependencies: ["asset"] },
    surface: surface("housing.leases"),
    actions: [
      read("housing.leases.list", "/housing/leases", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_READ, {
        anyPermissions: [
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_READ,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_CREATE,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_APPROVE,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_SIGN,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_ACTIVATE,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_CHECKOUT,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANT_MANAGE,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVER_MANAGE,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_REPAIR_MANAGE,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_BILLING_GENERATE,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_READ,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_REGISTER,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_WAIVE,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_TRANSFER
        ]
      }),
      read("housing.leases.detail", "/housing/leases/:id", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_READ, {
        anyPermissions: [
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_READ,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_CREATE,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_APPROVE,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_SIGN,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_ACTIVATE,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_CHECKOUT,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANT_MANAGE,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVER_MANAGE,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_REPAIR_MANAGE,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_BILLING_GENERATE,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_READ,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_REGISTER,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_WAIVE,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_TRANSFER
        ]
      }),
      read(
        "housing.leases.unit-candidates",
        "/housing/unit-candidates",
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_CREATE,
        {
          anyPermissions: [
            PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_CREATE,
            PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_MANAGE
          ]
        }
      ),
      mutation("housing.leases.create", "POST", "/housing/leases", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_CREATE, {
        requiredPermissions: [
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANT_MANAGE,
          "unit:read"
        ]
      }),
      mutation("housing.leases.submit", "POST", "/housing/leases/:id/submit", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_CREATE),
      mutation("housing.leases.approve", "POST", "/housing/leases/:id/approve", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_APPROVE, {
        requiredPermissions: [PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_CREATE],
        highRiskPolicyId: "housing.lease.approve"
      }),
      mutation("housing.leases.sign", "POST", "/housing/leases/:id/sign", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_SIGN),
      mutation("housing.leases.activate", "POST", "/housing/leases/:id/activate", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_ACTIVATE),
      mutation("housing.leases.void", "POST", "/housing/leases/:id/void", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_CREATE, {
        requiredPermissions: [PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_CREATE],
        highRiskPolicyId: "housing.lease.void"
      }),
      mutation("housing.leases.add-occupant", "POST", "/housing/leases/:id/occupants", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANT_MANAGE),
      mutation("housing.leases.checkout", "POST", "/housing/leases/:id/checkout", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_CHECKOUT, {
        requiredPermissions: [PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_CREATE],
        highRiskPolicyId: "housing.lease.early-checkout"
      })
    ],
    data: unitScopedData,
    fields: [
      financial("lease.monthly_rent", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_READ),
      financial("lease.deposit_amount", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_READ),
      {
        field: "tenant.identity_number_masked",
        classification: "sensitive",
        readPermission: PROPERTY_BUSINESS_PERMISSIONS.PARTY_SENSITIVE_READ,
        projection: "masked"
      }
    ],
    files: [
      protectedFiles(
        "housing_lease_signature",
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_READ,
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_SIGN,
        {
          readAnyPermissions: [
            PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_READ,
            PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_SIGN
          ]
        }
      )
    ]
  },
  {
    featureId: "housing.handovers",
    module: { required: "housing_rental", dependencies: ["asset"] },
    surface: surface("housing.handovers"),
    actions: [
      read(
        "housing.handovers.list",
        "/housing/handovers",
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVER_READ
      ),
      read(
        "housing.handovers.detail",
        "/housing/handovers/:id",
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVER_READ
      ),
      mutation(
        "housing.handovers.complete",
        "POST",
        "/housing/leases/:id/handovers",
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVER_MANAGE,
        { variant: "move-in-or-zero-financial-move-out" }
      ),
      mutation(
        "housing.handovers.complete-move-out-financial",
        "POST",
        "/housing/leases/:id/handovers",
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVER_MANAGE,
        {
          variant: "move-out-and-any-of-damage-unsettled-deposit-deduction-non-zero",
          variantPredicate: {
            allEquals: { handover_type: "move_out" },
            anyNonZero: [
              "damage_amount",
              "unsettled_amount",
              "deposit_deduction_amount"
            ]
          },
          highRiskPolicyId: "housing.handover.move-out-financial"
        }
      )
    ],
    data: unitScopedData,
    fields: [
      {
        field: "handover.credentials",
        classification: "sensitive",
        readPermission: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVER_MANAGE,
        projection: "masked"
      },
      financial("handover.damage_amount", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_READ),
      financial("handover.unsettled_amount", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_READ),
      financial("handover.deposit_deduction_amount", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_READ),
      readonlyReference(
        "handover.photo_file_ids",
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVER_READ
      )
    ],
    files: [
      ...["housing_handover", "housing_handover_move_in", "housing_handover_move_out"]
        .map((bizType) => protectedFiles(
          bizType,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVER_READ,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVER_MANAGE,
          {
            readAnyPermissions: [
              PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_READ,
              PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVER_READ,
              PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVER_MANAGE
            ]
          }
        ))
    ]
  },
  {
    featureId: "housing.billing",
    module: { required: "housing_rental", dependencies: ["asset"] },
    surface: surface("housing.billing"),
    actions: [
      read(
        "housing.billing.list",
        "/housing/billing",
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_BILLING_READ
      ),
      read(
        "housing.billing.energy-meter-candidates",
        "/housing/leases/:id/energy-meter-candidates",
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_CREATE,
        {
          requiredPermissions: ["energy_meter:read"],
          anyPermissions: [
            PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_CREATE,
            PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVER_MANAGE,
            PROPERTY_BUSINESS_PERMISSIONS.HOUSING_BILLING_GENERATE
          ]
        }
      ),
      mutation("housing.billing.save-plan", "PUT", "/housing/leases/:id/charge-plans", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_CREATE),
      mutation("housing.billing.generate", "POST", "/housing/leases/:id/generate-bills", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_BILLING_GENERATE)
    ],
    data: unitScopedData,
    fields: [
      financial("charge_plan.amount", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_READ),
      financial("receivable.amount", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_READ)
    ],
    files: []
  },
  {
    featureId: "housing.finance",
    module: { required: "housing_rental", dependencies: ["asset"] },
    surface: surface("housing.finance"),
    actions: [
      read(
        "housing.finance.list",
        "/housing/finance",
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_READ
      ),
      mutation("housing.finance.register", "POST", "/housing/leases/:id/ledger", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_REGISTER, {
        anyPermissions: [
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_REGISTER,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_WAIVE
        ],
        variant: "charge-or-payment"
      }),
      mutation("housing.finance.refund-waive-or-deposit-refund", "POST", "/housing/leases/:id/ledger", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_WAIVE, {
        anyPermissions: [
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_REGISTER,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_WAIVE
        ],
        variant: "refund-waiver-or-deposit-refund",
        highRiskPolicyId: "housing.finance.refund-waiver-or-deposit-refund"
      })
    ],
    data: unitScopedData,
    fields: [
      financial("ledger.amount", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_READ),
      financial("receivable.paid_amount", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_READ),
      financial("receivable.waived_amount", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_READ)
    ],
    files: []
  },
  {
    featureId: "housing.repairs",
    module: { required: "housing_rental", dependencies: ["asset"] },
    surface: surface("housing.repairs"),
    actions: [
      read(
        "housing.repairs.list",
        "/housing/repairs",
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_REPAIR_READ
      ),
      read(
        "housing.repairs.detail",
        "/housing/repairs/:id",
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_REPAIR_READ
      ),
      mutation("housing.repairs.create", "POST", "/housing/leases/:id/repairs", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_REPAIR_MANAGE)
    ],
    data: unitScopedData,
    fields: [
      readonlyReference(
        "repair.image_file_ids",
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_REPAIR_READ
      )
    ],
    files: [
      protectedFiles(
        "housing_repair",
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_REPAIR_READ,
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_REPAIR_MANAGE,
        {
          readAnyPermissions: [
            PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_READ,
            PROPERTY_BUSINESS_PERMISSIONS.HOUSING_REPAIR_READ,
            PROPERTY_BUSINESS_PERMISSIONS.HOUSING_REPAIR_MANAGE
          ]
        }
      )
    ]
  },
  {
    featureId: "housing.purchases",
    module: { required: "housing_rental", dependencies: ["asset"] },
    surface: surface("housing.purchases"),
    actions: [
      read("housing.purchases.list", "/housing/purchases", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_READ, {
        anyPermissions: [
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_READ,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_MANAGE,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_TRANSFER
        ]
      }),
      read("housing.purchases.detail", "/housing/purchases/:id", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_READ, {
        anyPermissions: [
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_READ,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_MANAGE,
          PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_TRANSFER
        ]
      }),
      mutation("housing.purchases.create", "POST", "/housing/purchases", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_MANAGE, {
        requiredPermissions: ["unit:read"]
      }),
      mutation("housing.purchases.lifecycle", "POST", "/housing/purchases/:id/actions", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_MANAGE, {
        requiredPermissions: [PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_CREATE],
        highRiskPolicyId: "housing.purchase.approve-pay-refund-or-void"
      }),
      mutation("housing.purchases.transfer", "POST", "/housing/purchases/:id/transfer", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_TRANSFER, {
        requiredPermissions: [PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_CREATE],
        highRiskPolicyId: "housing.purchase.transfer-to-tenant-charge"
      })
    ],
    data: unitScopedData,
    fields: [
      financial("purchase.total_amount", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_READ),
      financial("purchase.items.amount", PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_READ),
      readonlyReference(
        "purchase.receipt_file_ids",
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_READ
      )
    ],
    files: [
      protectedFiles(
        "housing_purchase",
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_READ,
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_MANAGE,
        {
          readAnyPermissions: [
            PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_READ,
            PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_MANAGE
          ],
          referenceScope: "tenant-park-owner-pending"
        }
      )
    ]
  }
] as const;

export const PROPERTY_WORKBENCH_REQUIRED_GET_ACTION_IDS = [
  "homestay.dashboard.read",
  "homestay.tasks.list",
  "homestay.availability.read",
  "homestay.rates.unit-candidates",
  "homestay.rates.read",
  "homestay.bookings.list",
  "homestay.bookings.detail",
  "homestay.bookings.guest-candidates",
  "homestay.stays.list",
  "homestay.stays.detail",
  "homestay.turnovers.list",
  "homestay.turnovers.detail",
  "homestay.turnovers.work-order-candidates",
  "homestay.finance.list",
  "housing.dashboard.read",
  "housing.tasks.list",
  "housing.tenants.list",
  "housing.leases.list",
  "housing.leases.detail",
  "housing.leases.unit-candidates",
  "housing.handovers.list",
  "housing.handovers.detail",
  "housing.billing.list",
  "housing.billing.energy-meter-candidates",
  "housing.finance.list",
  "housing.repairs.list",
  "housing.repairs.detail",
  "housing.purchases.list",
  "housing.purchases.detail"
] as const;

export const TRACK_A_HIGH_RISK_ACTION_IDS = [
  "homestay.bookings.cancel",
  "homestay.finance.refund-or-waive",
  "housing.leases.approve",
  "housing.leases.void",
  "housing.leases.checkout",
  "housing.finance.refund-waive-or-deposit-refund",
  "housing.handovers.complete-move-out-financial",
  "housing.purchases.lifecycle",
  "housing.purchases.transfer"
] as const;

export interface PropertyAccessManifestValidationResult {
  valid: boolean;
  issues: string[];
}

const permissionPattern = /^[a-z0-9_]+(?::[a-z0-9_-]+)+$/;

function addDuplicateIssues(values: readonly string[], label: string, issues: string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) issues.push(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

export function validatePropertyAccessManifest(
  manifest: readonly PropertyAccessManifestEntry[] = PROPERTY_ACCESS_MANIFEST
): PropertyAccessManifestValidationResult {
  const issues: string[] = [];
  addDuplicateIssues(manifest.map((entry) => entry.featureId), "featureId", issues);
  addDuplicateIssues(manifest.map((entry) => entry.surface.route), "canonical route", issues);
  addDuplicateIssues(manifest.map((entry) => entry.surface.pageCode), "page permission", issues);

  const allRoutes = manifest.flatMap((entry) => [
    entry.surface.route,
    ...entry.surface.detailRoutes
  ]);
  addDuplicateIssues(allRoutes, "route", issues);

  const actionIds = manifest.flatMap((entry) => entry.actions.map((action) => action.actionId));
  addDuplicateIssues(actionIds, "actionId", issues);
  const actionsById = new Map(
    manifest.flatMap((entry) => entry.actions).map((action) => [action.actionId, action])
  );
  const actionEndpoints = manifest.flatMap((entry) =>
    entry.actions.map((action) =>
      `${action.method} ${action.path}${action.variant ? `#${action.variant}` : ""}`
    )
  );
  addDuplicateIssues(actionEndpoints, "action endpoint", issues);

  const pageCodes = new Set(manifest.map((entry) => entry.surface.pageCode));
  const legacyCodes = new Set<string>(PROPERTY_BUSINESS_LEGACY_PAGE_PERMISSIONS);
  const canonicalSurfaces = new Map<string, PropertyBusinessSurfaceRoute>(
    PROPERTY_BUSINESS_SURFACES.map((item) => [item.featureId, item])
  );
  const knownPropertyPermissions = new Set<string>(Object.values(PROPERTY_BUSINESS_PERMISSIONS));
  const allowedExternalPermissions = new Set([
    "unit:read",
    "energy_meter:read",
    "file:read",
    "file:download",
    "file:upload",
    "file:delete"
  ]);
  const validatePermission = (
    permission: string,
    label: string,
    allowExternal = false
  ): void => {
    if (!permissionPattern.test(permission)) {
      issues.push(`Invalid ${label}: ${permission}`);
      return;
    }
    if (
      !knownPropertyPermissions.has(permission)
      && !(allowExternal && allowedExternalPermissions.has(permission))
    ) {
      issues.push(`Unknown ${label}: ${permission}`);
    }
    if (legacyCodes.has(permission) || pageCodes.has(permission)) {
      issues.push(`Invalid ${label} authorization source: ${permission}`);
    }
  };
  for (const entry of manifest) {
    const canonicalSurface = canonicalSurfaces.get(entry.featureId);
    if (!canonicalSurface) {
      issues.push(`Unknown canonical surface: ${entry.featureId}`);
    } else if (
      canonicalSurface.moduleCode !== entry.surface.moduleCode
      || canonicalSurface.menuCode !== entry.surface.menuCode
      || canonicalSurface.pageCode !== entry.surface.pageCode
      || canonicalSurface.route !== entry.surface.route
      || canonicalSurface.detailRoutes.length !== entry.surface.detailRoutes.length
      || canonicalSurface.detailRoutes.some(
        (route, index) => route !== entry.surface.detailRoutes[index]
      )
    ) {
      issues.push(`Canonical surface contract drift: ${entry.featureId}`);
    }
    if (entry.featureId !== entry.surface.featureId) {
      issues.push(`Feature/surface mismatch: ${entry.featureId}`);
    }
    if (entry.module.required !== entry.surface.moduleCode) {
      issues.push(`Module/surface mismatch: ${entry.featureId}`);
    }
    if (!entry.module.dependencies.includes("asset")) {
      issues.push(`Missing asset dependency: ${entry.featureId}`);
    }
    if (!permissionPattern.test(entry.surface.pageCode)) {
      issues.push(`Invalid page permission: ${entry.surface.pageCode}`);
    }
    if (legacyCodes.has(entry.surface.pageCode)) {
      issues.push(`Legacy permission cannot authorize canonical page: ${entry.surface.pageCode}`);
    }
    for (const action of entry.actions) {
      validatePermission(action.permission, `action permission for ${action.actionId}`);
      for (const permission of action.requiredPermissions ?? []) {
        validatePermission(permission, `required permission for ${action.actionId}`, true);
      }
      for (const permission of action.anyPermissions ?? []) {
        validatePermission(permission, `any permission for ${action.actionId}`);
      }
      addDuplicateIssues(
        action.requiredPermissions ?? [],
        `required permission for ${action.actionId}`,
        issues
      );
      addDuplicateIssues(
        action.anyPermissions ?? [],
        `any permission for ${action.actionId}`,
        issues
      );
      if (
        action.anyPermissions
        && !action.anyPermissions.includes(action.permission)
      ) {
        issues.push(`Primary action permission is absent from anyPermissions: ${action.actionId}`);
      }
      if (action.method !== "GET" && action.idempotency !== "required") {
        issues.push(`Mutation lacks idempotency policy: ${action.actionId}`);
      }
      if (!action.approvalPolicy) {
        issues.push(`Action lacks approval policy: ${action.actionId}`);
      } else if (
        action.approvalPolicy.requirement === "not-required"
        && (
          action.approvalPolicy.enforcement !== "available"
          || action.approvalPolicy.policyId !== undefined
        )
      ) {
        issues.push(`Non-approval action has an inconsistent approval policy: ${action.actionId}`);
      } else if (
        action.approvalPolicy.requirement === "required"
        && (
          action.approvalPolicy.enforcement !== "available"
          || !action.approvalPolicy.policyId
        )
      ) {
        issues.push(`Approval-required action is not available through Track B: ${action.actionId}`);
      }
      if (
        action.highRisk
        && (
          action.approvalPolicy.requirement !== "required"
          || action.approvalPolicy.enforcement !== "available"
          || !action.approvalPolicy.policyId
        )
      ) {
        issues.push(`High-risk action is not routed through Track B: ${action.actionId}`);
      }
      if (
        action.approvalPolicy?.requirement === "required"
        && !action.highRisk
      ) {
        issues.push(`Approval-required action is not marked high-risk: ${action.actionId}`);
      }
    }
    addDuplicateIssues(
      entry.fields.map((field) => field.field),
      `field policy for ${entry.featureId}`,
      issues
    );
    for (const field of entry.fields) {
      if (
        (field.classification === "sensitive" || field.classification === "financial")
        && !field.readPermission
      ) {
        issues.push(`Protected field lacks read permission: ${entry.featureId}.${field.field}`);
      }
      if (field.classification === "sensitive" && field.projection === "full") {
        issues.push(`Sensitive field cannot use an unqualified full projection: ${entry.featureId}.${field.field}`);
      }
      if (field.readPermission) {
        validatePermission(
          field.readPermission,
          `field read permission for ${entry.featureId}.${field.field}`
        );
      }
    }
  }

  const protectedBizTypes = manifest.flatMap((entry) =>
    entry.files.flatMap((policy) => policy.bizTypes)
  );
  addDuplicateIssues(protectedBizTypes, "protected biz_type", issues);
  const expectedBizTypes = new Set<string>(PROPERTY_BUSINESS_PROTECTED_BIZ_TYPES);
  for (const bizType of protectedBizTypes) expectedBizTypes.delete(bizType);
  for (const bizType of expectedBizTypes) issues.push(`Missing protected biz_type policy: ${bizType}`);
  for (const entry of manifest) {
    for (const policy of entry.files) {
      if (policy.bizTypes.length !== 1) {
        issues.push(`Protected file policy must declare exactly one biz_type: ${entry.featureId}`);
      }
      validatePermission(
        policy.readPermission,
        `file read permission for ${entry.featureId}`
      );
      for (const permission of policy.readAnyPermissions ?? []) {
        validatePermission(
          permission,
          `file read-any permission for ${entry.featureId}`
        );
      }
      addDuplicateIssues(
        policy.readAnyPermissions ?? [],
        `file read-any permission for ${entry.featureId}`,
        issues
      );
      if (
        policy.readAnyPermissions
        && !policy.readAnyPermissions.includes(policy.readPermission)
      ) {
        issues.push(`Primary file read permission is absent from readAnyPermissions: ${entry.featureId}`);
      }
      if (policy.uploadPermission) {
        validatePermission(
          policy.uploadPermission,
          `file upload permission for ${entry.featureId}`
        );
      }
      if (policy.deletePermission) {
        validatePermission(
          policy.deletePermission,
          `file delete permission for ${entry.featureId}`
        );
      }
      if (
        policy.genericReadPermission !== "file:read"
        || policy.genericDownloadPermission !== "file:download"
      ) {
        issues.push(`Protected file read/download policy is incomplete: ${entry.featureId}`);
      }
      if (
        policy.uploadPermission
        && policy.genericUploadPermission !== "file:upload"
      ) {
        issues.push(`Protected file upload policy is incomplete: ${entry.featureId}`);
      }
      if (
        policy.deletePermission
        && policy.genericDeletePermission !== "file:delete"
      ) {
        issues.push(`Protected file delete policy is incomplete: ${entry.featureId}`);
      }
      for (const bizType of policy.bizTypes) {
        if (!(PROPERTY_BUSINESS_PROTECTED_BIZ_TYPES as readonly string[]).includes(bizType)) {
          issues.push(`Unknown protected biz_type policy: ${bizType}`);
        }
      }
    }
  }

  const featureIds = new Set(manifest.map((entry) => entry.featureId));
  for (const featureId of canonicalSurfaces.keys()) {
    if (!featureIds.has(featureId)) issues.push(`Missing canonical surface: ${featureId}`);
  }
  for (const landing of Object.values(PROPERTY_BUSINESS_LANDING)) {
    addDuplicateIssues(landing.orderedFeatureIds, `${landing.moduleCode} landing feature`, issues);
    for (const featureId of landing.orderedFeatureIds) {
      if (!featureIds.has(featureId)) issues.push(`Unknown landing feature: ${featureId}`);
    }
    const expected = manifest
      .filter((entry) => entry.module.required === landing.moduleCode)
      .map((entry) => entry.featureId);
    if (
      expected.length !== landing.orderedFeatureIds.length
      || expected.some((featureId, index) => featureId !== landing.orderedFeatureIds[index])
    ) {
      issues.push(`Landing priority does not match manifest order: ${landing.moduleCode}`);
    }
  }

  const canonicalRoutes = new Set(allRoutes);
  for (const landing of Object.values(PROPERTY_BUSINESS_LANDING)) {
    if (canonicalRoutes.has(landing.legacyAlias)) {
      issues.push(`Legacy landing alias cannot be canonical: ${landing.legacyAlias}`);
    }
    if (!legacyCodes.has(landing.legacyPermission)) {
      issues.push(`Landing alias lacks a legacy-only permission: ${landing.legacyAlias}`);
    }
  }
  for (const redirect of PROPERTY_BUSINESS_COMPATIBILITY_REDIRECTS) {
    if (canonicalRoutes.has(redirect.source)) {
      issues.push(`Compatibility redirect cannot be canonical: ${redirect.source}`);
    }
    if (redirect.targetAuthorization !== "module-page-read") {
      issues.push(`Compatibility redirect must re-authorize its target: ${redirect.source}`);
    }
    if (!pageCodes.has(redirect.sourcePagePermission)) {
      issues.push(`Compatibility redirect lacks a canonical source page permission: ${redirect.source}`);
    }
  }
  for (const actionId of TRACK_A_HIGH_RISK_ACTION_IDS) {
    const action = actionsById.get(actionId);
    if (!action) {
      issues.push(`Missing Track A high-risk action: ${actionId}`);
    } else if (!action.highRisk) {
      issues.push(`Track A high-risk action is not marked high-risk: ${actionId}`);
    }
  }
  for (const actionId of PROPERTY_WORKBENCH_REQUIRED_GET_ACTION_IDS) {
    const action = actionsById.get(actionId);
    if (!action) {
      issues.push(`Missing workbench GET action: ${actionId}`);
    } else if (action.method !== "GET") {
      issues.push(`Workbench read action is not GET: ${actionId}`);
    }
  }
  const moveOutFinancial = actionsById.get(
    "housing.handovers.complete-move-out-financial"
  );
  if (
    moveOutFinancial?.variantPredicate?.allEquals?.handover_type !== "move_out"
    || JSON.stringify(moveOutFinancial.variantPredicate.anyNonZero) !== JSON.stringify([
      "damage_amount",
      "unsettled_amount",
      "deposit_deduction_amount"
    ])
  ) {
    issues.push("Housing move-out financial discriminator is incomplete");
  }
  const expectedHighRisk = new Set<string>(TRACK_A_HIGH_RISK_ACTION_IDS);
  for (const action of actionsById.values()) {
    if (action.highRisk && !expectedHighRisk.has(action.actionId)) {
      issues.push(`Unexpected Track A high-risk action: ${action.actionId}`);
    }
  }

  return { valid: issues.length === 0, issues };
}
