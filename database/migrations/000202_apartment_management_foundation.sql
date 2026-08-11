BEGIN;

ALTER TABLE biz_property_occupancy DROP CONSTRAINT IF EXISTS ck_property_occupancy_domain;
ALTER TABLE biz_property_occupancy ADD CONSTRAINT ck_property_occupancy_domain CHECK (
  source_domain IN ('commercial_leasing', 'homestay', 'housing_rental', 'apartment', 'maintenance', 'operations')
);

ALTER TABLE biz_party DROP CONSTRAINT IF EXISTS ck_biz_party_source_domain;
ALTER TABLE biz_party ADD CONSTRAINT ck_biz_party_source_domain CHECK (
  source_domain IS NULL OR source_domain IN (
    'commercial_leasing', 'homestay', 'housing_rental', 'apartment', 'maintenance', 'operations'
  )
);

CREATE TABLE biz_apartment_room (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  unit_id uuid NOT NULL REFERENCES biz_unit(id),
  occupancy_id uuid REFERENCES biz_property_occupancy(id),
  room_type varchar(32) NOT NULL,
  gender_policy varchar(16) NOT NULL DEFAULT 'any',
  capacity integer NOT NULL DEFAULT 1,
  facilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  management_status varchar(24) NOT NULL DEFAULT 'draft',
  effective_from date,
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_apartment_room_type CHECK (room_type IN ('talent', 'executive', 'employee')),
  CONSTRAINT ck_apartment_room_gender CHECK (gender_policy IN ('any', 'male', 'female')),
  CONSTRAINT ck_apartment_room_capacity CHECK (capacity BETWEEN 1 AND 20),
  CONSTRAINT ck_apartment_room_status CHECK (management_status IN ('draft', 'enabled', 'maintenance', 'disabled'))
);
CREATE UNIQUE INDEX uq_apartment_room_scope_unit
  ON biz_apartment_room (tenant_id, park_id, unit_id) WHERE is_deleted = false;
CREATE UNIQUE INDEX uq_apartment_room_scope_occupancy
  ON biz_apartment_room (tenant_id, park_id, occupancy_id) WHERE is_deleted = false AND occupancy_id IS NOT NULL;

CREATE TABLE biz_apartment_bed (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  room_id uuid NOT NULL REFERENCES biz_apartment_room(id),
  bed_code varchar(32) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'enabled',
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_apartment_bed_status CHECK (status IN ('enabled', 'maintenance', 'disabled'))
);
CREATE UNIQUE INDEX uq_apartment_bed_scope_code
  ON biz_apartment_bed (tenant_id, park_id, room_id, bed_code) WHERE is_deleted = false;

CREATE TABLE biz_apartment_application (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  application_code varchar(64) NOT NULL,
  applicant_party_id uuid REFERENCES biz_party(id),
  applicant_user_id uuid REFERENCES sys_user(id),
  applicant_name varchar(100) NOT NULL,
  applicant_type varchar(32) NOT NULL,
  organization_name varchar(200), department_name varchar(200), job_title varchar(100),
  mobile_masked varchar(32), identity_number_masked varchar(64),
  requested_room_type varchar(32) NOT NULL,
  requested_start_date date NOT NULL, requested_end_date date,
  reason varchar(1000) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'draft',
  submitted_at timestamptz, decided_at timestamptz,
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_apartment_application_person CHECK (applicant_party_id IS NOT NULL OR applicant_user_id IS NOT NULL),
  CONSTRAINT ck_apartment_applicant_type CHECK (applicant_type IN ('internal_employee', 'subsidiary_employee', 'executive', 'external_talent')),
  CONSTRAINT ck_apartment_application_room_type CHECK (requested_room_type IN ('talent', 'executive', 'employee')),
  CONSTRAINT ck_apartment_application_period CHECK (requested_end_date IS NULL OR requested_start_date < requested_end_date),
  CONSTRAINT ck_apartment_application_status CHECK (status IN ('draft','submitted','approved','rejected','cancelled','allocated','checked_in','checkout_pending','completed'))
);
CREATE UNIQUE INDEX uq_apartment_application_scope_code
  ON biz_apartment_application (tenant_id, park_id, application_code) WHERE is_deleted = false;
CREATE INDEX idx_apartment_application_scope_status
  ON biz_apartment_application (tenant_id, park_id, status, create_time DESC) WHERE is_deleted = false;

CREATE TABLE biz_apartment_approval (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  application_id uuid NOT NULL REFERENCES biz_apartment_application(id),
  application_version integer NOT NULL,
  decision varchar(16) NOT NULL,
  decided_by uuid NOT NULL REFERENCES sys_user(id),
  decided_at timestamptz NOT NULL DEFAULT now(),
  opinion varchar(1000),
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_apartment_approval_decision CHECK (decision IN ('approve', 'reject'))
);
CREATE UNIQUE INDEX uq_apartment_approval_application_version
  ON biz_apartment_approval (tenant_id, park_id, application_id, application_version) WHERE is_deleted = false;

CREATE TABLE biz_apartment_stay (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  stay_code varchar(64) NOT NULL,
  application_id uuid NOT NULL REFERENCES biz_apartment_application(id),
  room_id uuid NOT NULL REFERENCES biz_apartment_room(id),
  bed_id uuid NOT NULL REFERENCES biz_apartment_bed(id),
  occupant_party_id uuid REFERENCES biz_party(id),
  occupant_user_id uuid REFERENCES sys_user(id),
  occupant_name varchar(100) NOT NULL,
  planned_start_date date NOT NULL, planned_end_date date,
  actual_check_in_at timestamptz, checkout_requested_at timestamptz, actual_check_out_at timestamptz,
  status varchar(32) NOT NULL DEFAULT 'reserved',
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_apartment_stay_person CHECK (occupant_party_id IS NOT NULL OR occupant_user_id IS NOT NULL),
  CONSTRAINT ck_apartment_stay_period CHECK (planned_end_date IS NULL OR planned_start_date < planned_end_date),
  CONSTRAINT ck_apartment_stay_status CHECK (status IN ('reserved','active','checkout_pending','completed','cancelled'))
);
CREATE UNIQUE INDEX uq_apartment_stay_scope_code
  ON biz_apartment_stay (tenant_id, park_id, stay_code) WHERE is_deleted = false;
CREATE INDEX idx_apartment_stay_bed_period
  ON biz_apartment_stay (tenant_id, park_id, bed_id, planned_start_date, planned_end_date)
  WHERE is_deleted = false AND status IN ('reserved', 'active', 'checkout_pending');
ALTER TABLE biz_apartment_stay ADD CONSTRAINT ex_apartment_stay_bed_period
  EXCLUDE USING gist (
    tenant_id WITH =,
    park_id WITH =,
    bed_id WITH =,
    daterange(planned_start_date, COALESCE(planned_end_date, 'infinity'::date), '[)') WITH &&
  ) WHERE (is_deleted = false AND status IN ('reserved', 'active', 'checkout_pending'));

CREATE TABLE biz_apartment_handover (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  stay_id uuid NOT NULL REFERENCES biz_apartment_stay(id),
  handover_type varchar(16) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'draft',
  item_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  key_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  photo_file_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  exception_note varchar(1000), confirmed_at timestamptz,
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_apartment_handover_type CHECK (handover_type IN ('move_in', 'move_out')),
  CONSTRAINT ck_apartment_handover_status CHECK (status IN ('draft', 'confirmed', 'void'))
);
CREATE UNIQUE INDEX uq_apartment_handover_stay_type
  ON biz_apartment_handover (tenant_id, park_id, stay_id, handover_type) WHERE is_deleted = false;

CREATE TABLE biz_apartment_document_template (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  document_type varchar(40) NOT NULL,
  version_no integer NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'draft',
  template_file_id uuid REFERENCES sys_file(id),
  variable_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_apartment_template_type CHECK (document_type IN ('application','approval','fire_commitment','move_in_handover','move_out_acceptance')),
  CONSTRAINT ck_apartment_template_status CHECK (status IN ('draft', 'published', 'retired')),
  CONSTRAINT ck_apartment_template_version CHECK (version_no > 0)
);
CREATE UNIQUE INDEX uq_apartment_template_type_version
  ON biz_apartment_document_template (tenant_id, park_id, document_type, version_no) WHERE is_deleted = false;

CREATE TABLE biz_apartment_document (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  stay_id uuid REFERENCES biz_apartment_stay(id),
  application_id uuid REFERENCES biz_apartment_application(id),
  template_id uuid NOT NULL REFERENCES biz_apartment_document_template(id),
  document_type varchar(40) NOT NULL,
  template_version integer NOT NULL,
  variable_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_file_id uuid REFERENCES sys_file(id),
  signed_file_id uuid REFERENCES sys_file(id),
  signed_sha256 char(64), signed_at timestamptz, voided_at timestamptz, void_reason varchar(500),
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_apartment_document_owner CHECK (stay_id IS NOT NULL OR application_id IS NOT NULL),
  CONSTRAINT ck_apartment_document_signature CHECK (
    (signed_file_id IS NULL AND signed_sha256 IS NULL AND signed_at IS NULL)
    OR (signed_file_id IS NOT NULL AND signed_sha256 IS NOT NULL AND signed_at IS NOT NULL)
  )
);
CREATE INDEX idx_apartment_document_stay ON biz_apartment_document (tenant_id, park_id, stay_id) WHERE is_deleted = false;
CREATE INDEX idx_apartment_document_application ON biz_apartment_document (tenant_id, park_id, application_id) WHERE is_deleted = false;

COMMIT;
