import "reflect-metadata";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ApartmentUnitCandidateQueryDto } from "./dto/apartment.dto";

const service = readFileSync(resolve(process.cwd(), "src/modules/apartments/apartments.service.ts"), "utf8");
const controller = readFileSync(resolve(process.cwd(), "src/modules/apartments/apartments.controller.ts"), "utf8");

test("candidate query applies bounded integer pagination and filters", async () => {
  const valid = plainToInstance(ApartmentUnitCandidateQueryDto, { page: "2", page_size: "100", eligible_only: "true" });
  assert.equal((await validate(valid)).length, 0);
  assert.equal(valid.page, 2);
  assert.equal(valid.page_size, 100);
  assert.equal(valid.eligible_only, true);
  const invalid = plainToInstance(ApartmentUnitCandidateQueryDto, { page: "1.5", page_size: "101" });
  assert.ok((await validate(invalid)).length >= 2);
});

test("candidate endpoint returns reasons instead of hiding every unavailable unit", () => {
  assert.match(controller, /unitCandidates[\s\S]*@Query\(\)q:ApartmentUnitCandidateQueryDto/u);
  for (const reason of ["already_apartment_managed", "unit_disabled", "asset_parent_mapping_incomplete", "operating_config_disabled", "operating_mode_conflict", "occupied_by_other_domain"]) {
    assert.match(service, new RegExp(reason));
  }
  assert.match(service, /count\(\*\) OVER\(\)::int AS total/u);
  assert.doesNotMatch(service, /ORDER BY u\.unit_code LIMIT 500/u);
});

test("create, disable, restore, and shrink revalidate authoritative state", () => {
  assert.match(service, /lock_property_unit_scope/u);
  assert.match(service, /loadCandidate\(manager,scope,dto\.unit_id\)/u);
  assert.match(service, /apartment-room-disabled/u);
  assert.match(service, /loadCandidate\(manager,scope,room\.unit_id,id\)/u);
  assert.match(service, /NOT EXISTS\(SELECT 1 FROM biz_apartment_stay stay WHERE stay\.bed_id=bed\.id\)/u);
  assert.match(service, /status='disabled'/u);
  assert.doesNotMatch(service, /DELETE FROM biz_apartment_bed/u);
});

test("room projections only expose active housing units", () => {
  assert.match(service, /summary\(scope: TenantParkScope\)[\s\S]*JOIN biz_unit u ON u\.id=r\.unit_id AND u\.tenant_id=r\.tenant_id AND u\.park_id=r\.park_id AND u\.is_deleted=false AND u\.usage_type=\$3/u);
  assert.match(service, /summary\(scope: TenantParkScope\)[\s\S]*\[\.\.\.this\.scope\(scope\), UNIT_USAGE_HOUSING\]/u);
  assert.match(service, /SELECT count\(\*\)::int FROM biz_apartment_stay s JOIN biz_apartment_room r[\s\S]*JOIN biz_unit u[\s\S]*s\.status='active'/u);
  assert.match(service, /SELECT count\(\*\)::int FROM biz_apartment_stay s JOIN biz_apartment_room r[\s\S]*JOIN biz_unit u[\s\S]*s\.status='checkout_pending'/u);
  assert.match(service, /listRooms\(scope: TenantParkScope[\s\S]*JOIN biz_unit u ON u\.id=r\.unit_id AND u\.tenant_id=r\.tenant_id AND u\.park_id=r\.park_id AND u\.is_deleted=false AND u\.usage_type=\$5/u);
  assert.match(service, /listRooms\(scope: TenantParkScope[\s\S]*query\.keyword\?\.trim\(\) \|\| null, UNIT_USAGE_HOUSING\]/u);
});

test("allocation enforces room gender policy against applicant gender", () => {
  assert.match(service, /bed\.room_type!==app\.requested_room_type[\s\S]*?bed\.gender_policy!=="any"&&\(!app\.gender\|\|app\.gender==="unspecified"\)/u);
  assert.match(service, /bed\.gender_policy!=="any"&&app\.gender!==bed\.gender_policy/u);
  assert.match(service, /该房源仅限男性入住，申请人性别不符/u);
  assert.match(service, /该房源仅限女性入住，申请人性别不符/u);
  assert.match(service, /请先在申请中登记申请人性别/u);
});

test("document variables render chinese labels and formatted dates", () => {
  assert.match(service, /applicant_type:this\.documentEnumLabel\("applicant_type",row\.applicant_type\)/u);
  assert.match(service, /requested_room_type:this\.documentEnumLabel\("room_type",row\.requested_room_type\)/u);
  assert.match(service, /requested_start_date:this\.formatDateDisplay\(row\.requested_start_date\)/u);
  assert.match(service, /checkout_time:row\.actual_check_out_at\?this\.formatDateTimeDisplay\(row\.actual_check_out_at\)/u);
  assert.match(service, /internal_employee:"集团员工"/u);
  assert.match(service, /talent:"人才公寓",executive:"高管宿舍",employee:"员工宿舍"/u);
  assert.match(service, /approve:"通过",reject:"驳回"/u);
  assert.match(service, /formatSnapshot[\s\S]*?conditionLabels\[String\(record\.condition\)\]/u);
});
