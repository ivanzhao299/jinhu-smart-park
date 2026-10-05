-- Formal training notes are separate from assessment. Completed originals stay frozen.
ALTER TABLE hr_training_participant ADD COLUMN memo varchar(2000);
ALTER TABLE hr_training_result_correction
  ADD COLUMN corrected_memo varchar(2000),
  ADD COLUMN memo_present boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT ck_hr_training_correction_memo_presence CHECK(memo_present OR corrected_memo IS NULL);
ALTER TABLE hr_training_result_correction DROP CONSTRAINT ck_hr_training_correction_value;
ALTER TABLE hr_training_result_correction ADD CONSTRAINT ck_hr_training_correction_value
 CHECK(corrected_hours IS NOT NULL OR corrected_score IS NOT NULL OR corrected_evaluation IS NOT NULL
  OR corrected_actual_cost IS NOT NULL OR certificate_file_id IS NOT NULL OR memo_present);

CREATE FUNCTION fn_hr_training_memo_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status='completed' AND NEW.memo IS DISTINCT FROM OLD.memo THEN
  RAISE EXCEPTION 'completed training memo requires correction';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_hr_training_memo_guard BEFORE UPDATE OF memo ON hr_training_participant
 FOR EACH ROW EXECUTE FUNCTION fn_hr_training_memo_guard();
