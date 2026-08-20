import {
  encodeReturnContext,
  resolveReturnHref,
  type ReturnContextPolicy
} from "../../features/property-shared/detail/return-context";

const PROPERTY_APPROVAL_RETURN_POLICY: ReturnContextPolicy = {
  origin: "https://workbench.local",
  fallbackHref: "/property/approvals",
  routes: {
    propertyApprovals: {
      pathTemplate: "/property/approvals",
      allowedQueryKeys: ["page"]
    },
    tasks: {
      pathTemplate: "/homestay/tasks",
      allowedQueryKeys: [
        "page", "page_size", "status", "source_type", "business_date", "sort",
        "taskId", "requestId"
      ]
    },
    "/housing/tasks": {
      pathTemplate: "/housing/tasks",
      allowedQueryKeys: [
        "page", "keyword", "status", "source_type", "approval_status", "sort", "order",
        "taskId", "requestId"
      ]
    }
  }
};

export function propertyApprovalReturnHref(encoded: string | null | undefined): string {
  return resolveReturnHref(encoded, PROPERTY_APPROVAL_RETURN_POLICY);
}

export function propertyApprovalListDetailHref(requestId: string, page: number): string {
  const returnTo = encodeReturnContext({
    route: "propertyApprovals",
    query: { page: String(page) }
  });
  return `/property/approvals/${encodeURIComponent(requestId)}?returnTo=${returnTo}`;
}
