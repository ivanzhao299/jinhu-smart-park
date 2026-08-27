import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(fileURLToPath(new URL("../..",import.meta.url))),read=(path:string)=>readFileSync(resolve(root,path),"utf8");

test("lifecycle page exposes the Yuzhou probation application workflow",()=>{
 const page=read("app/hr/lifecycle/HrLifecycleClient.tsx"),panel=read("app/hr/lifecycle/ProbationApplicationsPanel.tsx"),api=read("lib/hr-api.ts");
 assert.match(page,/ProbationApplicationsPanel/);
 assert.match(panel,/员工转正申请/);
 assert.match(panel,/HR_LIFECYCLE_ASSIGN/);assert.match(panel,/HR_LIFECYCLE_REVIEW/);assert.match(panel,/HR_EMPLOYMENT_TRANSITION/);
 for(const action of ["submit","resubmit","cancel","approve","return","confirm"])assert.match(panel,new RegExp(`\\"${action}\\"`));
 assert.match(api,/\/hr\/probation-applications/);
 assert.match(api,/updateProbationApplication/);assert.match(panel,/保存修改/);
});

test("probation employee selection stays mobile safe and requires per-employee dates",()=>{
 const panel=read("app/hr/lifecycle/ProbationApplicationsPanel.tsx"),css=read("app/hr/hr-workbench.module.css");
 assert.match(panel,/plannedConfirmationDate/);assert.match(panel,/请填写所有已选员工的计划转正日期/);
 assert.match(panel,/ds-mobile-record-list/);assert.match(panel,/profileGroup/);
 assert.match(css,/@media[\s\S]*\.inlineFields\s*\{[\s\S]*grid-template-columns:\s*1fr/);
});
