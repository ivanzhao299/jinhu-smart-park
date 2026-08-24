import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root=join(__dirname,"../..");
const read=(path:string)=>readFileSync(join(root,path),"utf8");
test("recruitment workspace is permission-aware and readable",()=>{const ui=read("app/hr/recruitment/HrRecruitmentClient.tsx");assert.match(ui,/HR_REQUISITION_TEAM_READ/);assert.match(ui,/HR_CANDIDATE_READ/);assert.match(ui,/if\(!canReq&&!canCandidates\)/);assert.match(ui,/AbortController/);assert.match(ui,/请选择/);assert.doesNotMatch(ui,/UUID/);assert.match(ui,/ds-mobile-record-list/);assert.match(ui,/type="date"/);assert.match(ui,/type="number"/);});
test("candidate sensitive detail clears and aborts on target changes and is hidden on phones",()=>{const ui=read("app/hr/recruitment/HrRecruitmentClient.tsx"),css=read("app/hr/hr-workbench.module.css");assert.match(ui,/HR_CANDIDATE_SENSITIVE_READ/);assert.match(ui,/detailAbort\.current\?\.abort\(\)/);assert.match(ui,/setSensitiveDetail\(null\)/);assert.match(ui,/recruitmentCandidateDetail/);assert.match(ui,/desktopSensitive/);assert.match(css,/@media \(max-width: 720px\)[\s\S]*?\.desktopSensitive\s*\{\s*display: none/);});
test("recruitment is connected to menu, workbench and API",()=>{assert.match(read("lib/menu.ts"),/"\/hr\/recruitment"/);assert.match(read("app/hr/HrWorkbench.tsx"),/href: "\/hr\/recruitment"/);const api=read("lib/hr-api.ts");for(const path of ["/hr/recruitment/requisitions","/hr/recruitment/candidates"])assert.match(api,new RegExp(path));assert.match(api,/signal\?:AbortSignal/);});
