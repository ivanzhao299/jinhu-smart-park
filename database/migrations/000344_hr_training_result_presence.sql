-- Preserve immutable historical facts: generated presence derives old non-NULL values.
-- Explicit clear markers distinguish NULL from omission without updating old corrections.
ALTER TABLE hr_training_result_correction
 ADD COLUMN score_cleared boolean NOT NULL DEFAULT false,
 ADD COLUMN evaluation_cleared boolean NOT NULL DEFAULT false,
 ADD COLUMN cost_cleared boolean NOT NULL DEFAULT false,
 ADD COLUMN certificate_cleared boolean NOT NULL DEFAULT false,
 ADD COLUMN score_present boolean GENERATED ALWAYS AS (corrected_score IS NOT NULL OR score_cleared) STORED,
 ADD COLUMN evaluation_present boolean GENERATED ALWAYS AS (corrected_evaluation IS NOT NULL OR evaluation_cleared) STORED,
 ADD COLUMN cost_present boolean GENERATED ALWAYS AS (corrected_actual_cost IS NOT NULL OR cost_cleared) STORED,
 ADD COLUMN certificate_present boolean GENERATED ALWAYS AS (certificate_file_id IS NOT NULL OR certificate_cleared) STORED,
 ADD CONSTRAINT ck_hr_training_result_clear CHECK(
  (NOT score_cleared OR corrected_score IS NULL) AND
  (NOT evaluation_cleared OR corrected_evaluation IS NULL) AND
  (NOT cost_cleared OR corrected_actual_cost IS NULL) AND
  (NOT certificate_cleared OR certificate_file_id IS NULL));
ALTER TABLE hr_training_result_correction DROP CONSTRAINT ck_hr_training_correction_value;
ALTER TABLE hr_training_result_correction ADD CONSTRAINT ck_hr_training_correction_value
 CHECK(corrected_hours IS NOT NULL OR score_present OR evaluation_present OR cost_present
  OR certificate_present OR memo_present);
