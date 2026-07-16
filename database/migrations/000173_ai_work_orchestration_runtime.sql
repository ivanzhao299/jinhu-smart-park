CREATE TABLE IF NOT EXISTS biz_ai_work_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  plan_code varchar(64) NOT NULL,
  raw_instruction text NOT NULL,
  normalized_goal text NOT NULL,
  planner_mode varchar(32) NOT NULL DEFAULT 'local_semantic_rules',
  planner_version varchar(32) NOT NULL DEFAULT 'v1',
  status varchar(32) NOT NULL DEFAULT 'DRAFT',
  risk_level varchar(16) NOT NULL DEFAULT 'LOW',
  location_text varchar(300),
  target_org_id uuid,
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  clarification_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  task_count integer NOT NULL DEFAULT 0,
  approved_by uuid,
  approved_at timestamptz,
  approval_comment varchar(1000),
  materialized_by uuid,
  materialized_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason varchar(1000),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_ai_work_plan_code
  ON biz_ai_work_plan (tenant_id, park_id, plan_code)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_biz_ai_work_plan_status
  ON biz_ai_work_plan (tenant_id, park_id, status, create_time DESC)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_biz_ai_work_plan_creator
  ON biz_ai_work_plan (tenant_id, park_id, create_by, create_time DESC)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS biz_ai_work_plan_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  plan_id uuid NOT NULL REFERENCES biz_ai_work_plan(id),
  task_code varchar(80) NOT NULL,
  sequence_no integer NOT NULL,
  title varchar(200) NOT NULL,
  description text NOT NULL,
  work_order_type varchar(64) NOT NULL DEFAULT 'other',
  department_id uuid,
  department_name varchar(100),
  role_code varchar(64),
  role_name varchar(100),
  suggested_assignee_id uuid,
  suggested_assignee_name varchar(100),
  confirmed_assignee_id uuid,
  confirmed_assignee_name varchar(100),
  assignment_strategy varchar(32) NOT NULL DEFAULT 'department_dispatch',
  assignment_confidence double precision NOT NULL DEFAULT 0,
  priority varchar(16) NOT NULL DEFAULT 'medium',
  urgency varchar(16) NOT NULL DEFAULT 'normal',
  due_at timestamptz,
  planned_effort_minutes integer,
  dependency_task_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  acceptance_criteria text NOT NULL,
  evidence_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  speed_weight smallint NOT NULL DEFAULT 50,
  quality_weight smallint NOT NULL DEFAULT 50,
  status varchar(32) NOT NULL DEFAULT 'PLANNED',
  work_order_id uuid,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_ai_work_plan_task_code
  ON biz_ai_work_plan_task (tenant_id, park_id, task_code)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_biz_ai_work_plan_task_plan
  ON biz_ai_work_plan_task (tenant_id, park_id, plan_id, sequence_no)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_biz_ai_work_plan_task_assignee
  ON biz_ai_work_plan_task (tenant_id, park_id, confirmed_assignee_id, status)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS biz_ai_assignment_decision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  plan_id uuid NOT NULL REFERENCES biz_ai_work_plan(id),
  task_id uuid NOT NULL REFERENCES biz_ai_work_plan_task(id),
  candidate_user_id uuid NOT NULL,
  candidate_name varchar(100) NOT NULL,
  org_id uuid,
  org_name varchar(100),
  role_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  post_name varchar(100),
  active_workload integer NOT NULL DEFAULT 0,
  score double precision NOT NULL,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_selected boolean NOT NULL DEFAULT false,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE INDEX IF NOT EXISTS idx_biz_ai_assignment_decision_task
  ON biz_ai_assignment_decision (tenant_id, park_id, task_id, score DESC)
  WHERE is_deleted = false;

WITH target_type AS (
  SELECT id, tenant_id, park_id
  FROM sys_dict_type
  WHERE dict_code = 'workorder_source_type'
    AND is_deleted = false
)
INSERT INTO sys_dict_item (
  tenant_id, park_id, dict_type_id, item_label, item_value,
  sort_order, status, tag_type, remark
)
SELECT tenant_id, park_id, id, 'AI 工作计划', 'ai_work_plan', 65, 'enabled', 'primary',
       'Natural language work orchestration source'
FROM target_type
ON CONFLICT DO NOTHING;
