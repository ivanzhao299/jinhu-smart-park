import type { TenantParkScope } from "@jinhu/shared";
import { DEFAULT_PLATFORM_SCOPE } from "../../shared/constants/platform-scope";

export const DEFAULT_PLAN_CATALOG_SCOPE = DEFAULT_PLATFORM_SCOPE;

export interface AvailablePlanCatalogQuery {
  page: number;
  page_size: number;
  keyword?: string;
}

export function buildAvailablePlanCatalogQuery(scope: TenantParkScope, query: AvailablePlanCatalogQuery) {
  const keyword = query.keyword?.trim();
  const offset = (query.page - 1) * query.page_size;
  return {
    sql: `
      WITH ranked AS (
        SELECT
          plan.id,
          plan.plan_code,
          plan.sort_no,
          ROW_NUMBER() OVER (
            PARTITION BY plan.plan_code
            ORDER BY
              CASE WHEN plan.tenant_id = $1 AND plan.park_id = $2 THEN 0 ELSE 1 END,
              plan.create_time ASC,
              plan.id ASC
          ) AS precedence
        FROM sys_plan plan
        WHERE plan.is_deleted = false
          AND plan.status = 'enabled'
          AND (
            (plan.tenant_id = $1 AND plan.park_id = $2)
            OR (plan.tenant_id = $3 AND plan.park_id = $4)
          )
          AND ($5::text IS NULL OR plan.plan_code ILIKE $5 OR plan.plan_name ILIKE $5)
      ),
      selected AS (
        SELECT id, plan_code, sort_no
        FROM ranked
        WHERE precedence = 1
      ),
      paged AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY sort_no ASC, plan_code ASC, id ASC) AS position
        FROM selected
        OFFSET $6
        LIMIT $7
      ),
      totals AS (
        SELECT COUNT(*)::integer AS total
        FROM selected
      )
      SELECT paged.id, totals.total
      FROM totals
      LEFT JOIN paged ON TRUE
      ORDER BY paged.position ASC
    `,
    parameters: [
      scope.tenantId,
      scope.parkId,
      DEFAULT_PLAN_CATALOG_SCOPE.tenantId,
      DEFAULT_PLAN_CATALOG_SCOPE.parkId,
      keyword ? `%${keyword}%` : null,
      offset,
      query.page_size
    ]
  };
}
