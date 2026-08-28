import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(__dirname,"../../../../..");
const read=(path:string)=>readFileSync(resolve(root,path),"utf8");

test("Yuzhou basic profile fields have typed persistence and privacy controls",()=>{
 const migration=read("database/migrations/000270_hr_employee_basic_profile_parity.sql");
 for(const token of ["id_number_encrypted","id_number_fingerprint","date_of_birth","highest_education","graduation_school","technical_title","uq_hr_employee_profile_identity_fingerprint","ck_hr_employee_profile_height","ck_hr_employee_profile_weight"])assert.match(migration,new RegExp(token));
 const service=read("apps/api/src/modules/hr/hr.service.ts");
 assert.match(service,/identityProfile\(dto\.idNumber/);
 assert.match(service,/sensitiveData\.decrypt/);
 assert.match(service,/projectHrEmployeeProfile\(saved,"full"\)/);
 assert.doesNotMatch(service,/return await repo\.save\(row\)/);
});

test("profile API and UI cover the legacy field groups without leaking source values",()=>{
 const dto=read("apps/api/src/modules/hr/dto/hr.dto.ts"),ui=read("apps/web/app/hr/employees/HrEmployeesClient.tsx");
 for(const field of ["englishName","gender","dateOfBirth","ethnicity","nativePlace","politicalStatus","heightCm","weightKg","highestEducation","major","degree","foreignLanguage","graduationSchool","homePhone","jobTitle","employeeCategory","technicalTitle"])assert.match(dto,new RegExp(field));
 assert.match(ui,/YuzhouBasicProfileFields/);
 assert.match(ui,/证件号（加密保存）/);
 assert.match(ui,/type="number"/);
 const evidence=JSON.parse(read("scripts/hr-cutover/contracts/yuzhou-employee-basic-profile-source-evidence-v1.json")) as {legacyId:number;legacyFieldEvidenceHash:string;personalValuesRecorded:boolean;credentialsRecorded:boolean;targetControls:{productionImport:string}};
 assert.equal(evidence.legacyId,35);
 assert.equal(evidence.legacyFieldEvidenceHash,"61b79273ffb92aa27bd4e4efc137f6c0676384d7ccee0c6362001ddd51fa1622");
 assert.equal(evidence.personalValuesRecorded,false);
 assert.equal(evidence.credentialsRecorded,false);
 assert.equal(evidence.targetControls.productionImport,"HOLD");
});
