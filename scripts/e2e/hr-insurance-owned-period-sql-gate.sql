\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE e uuid; p uuid; preview uuid; correction_preview uuid; revision uuid; corrected uuid;
  actor uuid:=uuid_generate_v4(); factors jsonb; items jsonb; bases jsonb; definition jsonb;
  snapshot jsonb; result jsonb; statement text; reject_count integer:=0;
BEGIN
  INSERT INTO hr_employee(tenant_id,park_id,employee_code,full_name,employment_status)
    VALUES('owned-period-fixture','owned-period-fixture','SYNTHETIC-1','合成测试人员','active') RETURNING id INTO e;
  factors:='{"base":{"rate":"0.010000","fixedAmount":null},"employer":{"rate":"0.010000","fixedAmount":null},"employee":{"rate":"0.010000","fixedAmount":null},"supplement":{"rate":"0.010000","fixedAmount":null}}';
  SELECT jsonb_agg(jsonb_build_object('insuranceKind',kind,'factors',factors)) INTO items
    FROM unnest(ARRAY['oldage','remedy','losework','wound','bear','fund']) kind;
  definition:=jsonb_build_object('formatVersion',1,'engineVersion','jinhu-insurance-decimal-v1',
    'tenantId','owned-period-fixture','parkId','owned-period-fixture','createdBy',actor,
    'policyCode','SYNTHETIC','policyName','合成测试政策','variantNo',1,'versionNo',1,
    'effectiveFrom','2026-01','effectiveThrough','2026-12','reason','合成规则测试',
    'origin',jsonb_build_object('kind','manual'),'items',items);
  INSERT INTO hr_insurance_policy_version(tenant_id,park_id,request_id,request_sha256,policy_code,policy_name,
    variant_no,version_no,effective_from,effective_through,created_by,definition)
    VALUES('owned-period-fixture','owned-period-fixture',uuid_generate_v4(),repeat('a',64),'SYNTHETIC','合成测试政策',
      1,1,'2026-01-01','2026-12-01',actor,definition) RETURNING id INTO p;
  SELECT jsonb_agg(jsonb_build_object('insuranceKind',kind,'contributionBase','10.00')) INTO bases
    FROM unnest(ARRAY['oldage','remedy','losework','wound','bear','fund']) kind;
  snapshot:=jsonb_build_object('formatVersion',1,'employeeId',e,'employeeVersion',1,'policyVersionId',p,
    'definitionHash',(SELECT definition_sha256 FROM hr_insurance_policy_version WHERE id=p),
    'periodMonth','2026-10','includeFund',false,'bases',bases);
  SELECT jsonb_agg(jsonb_build_object('insuranceKind',kind,'contributionBase','10.00',
    'amounts',jsonb_build_object('base','0.10','employer','0.10','employee','0.10','supplement','0.10'))) INTO items
    FROM unnest(ARRAY['oldage','remedy','losework','wound','bear','fund']) kind;
  result:=jsonb_build_object('engineVersion','jinhu-insurance-decimal-v1','policyVersion',1,'includeFund',false,
    'items',items,'totals',jsonb_build_object('base','0.50','employer','0.50','employee','0.50','supplement','0.50'));
  INSERT INTO hr_insurance_owned_preview(tenant_id,park_id,request_id,request_sha256,employee_id,employee_version,
    policy_version_id,policy_definition_sha256,period_month,include_fund,created_by,input_snapshot,result)
    VALUES('owned-period-fixture','owned-period-fixture',uuid_generate_v4(),repeat('a',64),e,1,p,
      snapshot->>'definitionHash','2026-10-01',false,actor,snapshot,result) RETURNING id INTO preview;
  IF (SELECT snapshot_sha256 FROM hr_insurance_owned_preview WHERE id=preview) !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'SNAPSHOT_HASH_MISSING';
  END IF;
  -- Mutated exact amounts must fail before any preview persists.
  BEGIN
    INSERT INTO hr_insurance_owned_preview(tenant_id,park_id,request_id,request_sha256,employee_id,employee_version,
      policy_version_id,policy_definition_sha256,period_month,include_fund,created_by,input_snapshot,result)
      VALUES('owned-period-fixture','owned-period-fixture',uuid_generate_v4(),repeat('a',64),e,1,p,
        snapshot->>'definitionHash','2026-10-01',false,actor,snapshot,jsonb_set(result,'{items,0,amounts,employee}','"0.11"'));
    RAISE EXCEPTION 'EXPECTED_AMOUNT_REJECTION';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'HR_INSURANCE_OWNED_AMOUNT_INVALID' THEN RAISE; END IF; reject_count:=reject_count+1;
  END;
  INSERT INTO hr_insurance_owned_revision(tenant_id,park_id,employee_id,period_month,revision_no,preview_id,
    request_id,request_sha256,created_by,reason)
    VALUES('owned-period-fixture','owned-period-fixture',e,'2026-10-01',1,preview,uuid_generate_v4(),repeat('a',64),actor,'合成确认') RETURNING id INTO revision;
  INSERT INTO hr_insurance_owned_preview(tenant_id,park_id,request_id,request_sha256,employee_id,employee_version,
    policy_version_id,policy_definition_sha256,period_month,include_fund,created_by,input_snapshot,result)
    VALUES('owned-period-fixture','owned-period-fixture',uuid_generate_v4(),repeat('b',64),e,1,p,
      snapshot->>'definitionHash','2026-10-01',false,actor,snapshot,result) RETURNING id INTO correction_preview;
  BEGIN
    INSERT INTO hr_insurance_owned_revision(tenant_id,park_id,employee_id,period_month,revision_no,preview_id,
      previous_revision_id,request_id,request_sha256,created_by,reason)
      VALUES('owned-period-fixture','owned-period-fixture',e,'2026-10-01',2,correction_preview,revision,
        uuid_generate_v4(),repeat('b',64),actor,'未关账更正拒绝');
    RAISE EXCEPTION 'EXPECTED_UNCLOSED_REJECTION';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'HR_INSURANCE_OWNED_CORRECTION_REQUIRES_LATEST_CLOSED_REVISION' THEN RAISE; END IF; reject_count:=reject_count+1;
  END;
  INSERT INTO hr_insurance_owned_close(tenant_id,park_id,revision_id,request_id,request_sha256,created_by,reason)
    VALUES('owned-period-fixture','owned-period-fixture',revision,uuid_generate_v4(),repeat('a',64),actor,'合成关账');
  INSERT INTO hr_insurance_owned_revision(tenant_id,park_id,employee_id,period_month,revision_no,preview_id,
    previous_revision_id,request_id,request_sha256,created_by,reason)
    VALUES('owned-period-fixture','owned-period-fixture',e,'2026-10-01',2,correction_preview,revision,
      uuid_generate_v4(),repeat('b',64),actor,'合成更正') RETURNING id INTO corrected;
  BEGIN
    INSERT INTO hr_insurance_owned_close(tenant_id,park_id,revision_id,request_id,request_sha256,created_by,reason)
      VALUES('owned-period-fixture','owned-period-fixture',revision,uuid_generate_v4(),repeat('c',64),actor,'过期版本关账拒绝');
    RAISE EXCEPTION 'EXPECTED_STALE_CLOSE_REJECTION';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'HR_INSURANCE_OWNED_CLOSE_REQUIRES_CURRENT_REVISION' THEN RAISE; END IF; reject_count:=reject_count+1;
  END;
  FOR statement IN SELECT unnest(ARRAY[
    format('UPDATE hr_insurance_owned_preview SET result=%L::jsonb WHERE id=%L',result,preview),
    format('DELETE FROM hr_insurance_owned_revision WHERE id=%L',corrected),
    'TRUNCATE hr_insurance_owned_close']) LOOP
    BEGIN
      EXECUTE statement; RAISE EXCEPTION 'EXPECTED_IMMUTABLE_REJECTION';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM<>'HR_INSURANCE_OWNED_FACT_IMMUTABLE' THEN RAISE; END IF; reject_count:=reject_count+1;
    END;
  END LOOP;
  IF reject_count<>6 OR (SELECT count(*) FROM hr_insurance_owned_revision WHERE employee_id=e)<>2
    OR (SELECT count(*) FROM hr_insurance_owned_preview WHERE employee_id=e)<>2
    OR (SELECT count(*) FROM hr_employee_insurance_period WHERE employee_id=e)<>0 THEN
    RAISE EXCEPTION 'OWNED_PERIOD_STATE_OR_HISTORY_CONSERVATION_FAILED';
  END IF;
  RAISE NOTICE 'OWNED_PERIOD_SQL_GATE_PASS: six rejection cases, exact arithmetic, confirmation-close-correction and history conservation';
END $$;
ROLLBACK;
