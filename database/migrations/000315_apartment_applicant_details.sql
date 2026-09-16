ALTER TABLE biz_apartment_application
  ADD COLUMN gender varchar(16),
  ADD COLUMN native_place varchar(200),
  ADD COLUMN home_address varchar(500),
  ADD COLUMN health_status varchar(500),
  ADD COLUMN emergency_contact_relationship varchar(100),
  ADD CONSTRAINT ck_apartment_application_gender CHECK (gender IS NULL OR gender IN ('male','female','unspecified'));

-- Keep identity ciphertext out of application SELECT/RETURNING * responses.
CREATE TABLE biz_apartment_application_identity (
  application_id uuid PRIMARY KEY REFERENCES biz_apartment_application(id),
  identity_number_encrypted text NOT NULL,
  encryption_key_id varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
