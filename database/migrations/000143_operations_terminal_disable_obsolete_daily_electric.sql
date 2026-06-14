-- Keep the operations terminal schedule aligned with the recommended cadence.
-- 000141 created a daily electric safety plan before the cadence model was refined.
-- 000142 added the intended weekly plan, so the obsolete daily plan must be disabled
-- to avoid duplicate task generation.

UPDATE biz_safety_inspect_plan
SET status = 'disabled',
    next_generate_time = NULL,
    remark = COALESCE(NULLIF(remark, ''), '现场工作台首批每日巡检计划') || '；已由 OPS-PLAN-ELECTRIC-WEEKLY 替代。',
    update_time = now()
WHERE tenant_id = '10000001'
  AND park_id = '20000001'
  AND plan_code = 'OPS-PLAN-ELECTRIC-DAILY'
  AND is_deleted = false
  AND status <> 'disabled';
