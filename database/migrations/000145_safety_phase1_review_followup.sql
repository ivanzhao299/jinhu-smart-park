-- Safety module full-open phase 1 review follow-up:
-- Correct emergency/work-permit statistics permission API metadata.
-- This patch does not change role grants or business data.

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
)
UPDATE sys_permission permission
SET api_path = '/api/v1/safety/emergency-work-permit-statistics',
    frontend_route = '/safety/emergency-dashboard',
    update_time = now(),
    remark = 'Safety phase 1 review follow-up: align statistics API path metadata'
FROM seed_scope
WHERE permission.tenant_id = seed_scope.tenant_id
  AND permission.park_id = seed_scope.park_id
  AND permission.code IN ('safety_emergency_statistics:read', 'safety_work_permit_statistics:read')
  AND permission.is_deleted = false;
