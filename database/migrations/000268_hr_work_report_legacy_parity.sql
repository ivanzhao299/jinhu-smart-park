BEGIN;

ALTER TABLE hr_work_report
  ADD COLUMN title varchar(64),
  ADD COLUMN questions_and_suggestions text;

ALTER TABLE hr_work_report_action DROP CONSTRAINT ck_hr_work_report_action_type;
ALTER TABLE hr_work_report_action
  ADD CONSTRAINT ck_hr_work_report_action_type
  CHECK(action_type IN('baseline','created','updated','submitted','resubmitted','returned','confirmed','cancelled'));

CREATE OR REPLACE FUNCTION hr_work_report_state_guard_t6() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   RAISE EXCEPTION 'work report physical deletion is forbidden' USING ERRCODE='55000';
 END IF;
 IF OLD.is_deleted THEN RAISE EXCEPTION 'cancelled work report is immutable' USING ERRCODE='55000';END IF;
 IF NEW.is_deleted AND NOT OLD.is_deleted THEN
   IF OLD.status NOT IN('draft','returned') THEN RAISE EXCEPTION 'only draft or returned work report may be cancelled' USING ERRCODE='23514';END IF;
   IF ROW(NEW.employee_id,NEW.report_type,NEW.period_start,NEW.period_end,NEW.title,NEW.completed_work,NEW.next_plan,NEW.risks,NEW.questions_and_suggestions,NEW.collaboration_needs,NEW.hours,NEW.status)
      IS DISTINCT FROM
      ROW(OLD.employee_id,OLD.report_type,OLD.period_start,OLD.period_end,OLD.title,OLD.completed_work,OLD.next_plan,OLD.risks,OLD.questions_and_suggestions,OLD.collaboration_needs,OLD.hours,OLD.status)
   THEN RAISE EXCEPTION 'work report content cannot change while cancelling' USING ERRCODE='55000';END IF;
   RETURN NEW;
 END IF;
 IF OLD.status='confirmed' THEN RAISE EXCEPTION 'confirmed work report is immutable' USING ERRCODE='55000';END IF;
 IF OLD.status IN('submitted','resubmitted') THEN
   IF NEW.status NOT IN('returned','confirmed') THEN RAISE EXCEPTION 'invalid submitted work report transition' USING ERRCODE='23514';END IF;
   IF ROW(NEW.employee_id,NEW.report_type,NEW.period_start,NEW.period_end,NEW.title,NEW.completed_work,NEW.next_plan,NEW.risks,NEW.questions_and_suggestions,NEW.collaboration_needs,NEW.hours)
      IS DISTINCT FROM
      ROW(OLD.employee_id,OLD.report_type,OLD.period_start,OLD.period_end,OLD.title,OLD.completed_work,OLD.next_plan,OLD.risks,OLD.questions_and_suggestions,OLD.collaboration_needs,OLD.hours)
   THEN RAISE EXCEPTION 'submitted work report content is immutable' USING ERRCODE='55000';END IF;
 ELSIF OLD.status='draft' AND NEW.status NOT IN('draft','submitted') THEN RAISE EXCEPTION 'invalid draft work report transition' USING ERRCODE='23514';
 ELSIF OLD.status='returned' AND NEW.status NOT IN('returned','resubmitted') THEN RAISE EXCEPTION 'invalid returned work report transition' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END$$;

COMMIT;
