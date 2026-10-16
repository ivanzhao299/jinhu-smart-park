import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {test} from "node:test";
const root=resolve(__dirname,"../../../../.."),read=(path:string)=>readFileSync(resolve(root,path),"utf8");
test("goal and work-report ledger exports are bounded, scoped, snapshot reads with required audits",()=>{
 const controller=read("apps/api/src/modules/hr/hr-goal-report.controller.ts"),service=read("apps/api/src/modules/hr/hr-goal-report.service.ts"),dto=read("apps/api/src/modules/hr/dto/hr-goal-report.dto.ts");
 for(const route of ["goals/ledger-export","goals/checkins/ledger-export","work-reports/me/ledger-export","work-reports/team/ledger-export"])assert.match(controller,new RegExp(`@Get\\("${route.replaceAll("/","\\/")}"\\)`));
 for(const name of ["HrGoalLedgerExportQueryDto","HrGoalCheckinLedgerExportQueryDto","HrWorkReportLedgerExportQueryDto"])assert.match(dto,new RegExp(`class ${name}`));
 for(const name of ["exportGoalLedger","exportGoalCheckinLedger","exportWorkReportLedger"])assert.match(service,new RegExp(`${name}[\\s\\S]{0,2600}REPEATABLE READ`));
 assert.match(service,/SET TRANSACTION READ ONLY/);assert.match(service,/LIMIT 5001/);assert.match(service,/listGoals\(s,a,q,m,5001\)/);assert.match(service,/exceeds 5000/);assert.match(service,/to_char\(now\(\) AT TIME ZONE 'UTC'/);assert.match(service,/recordHrSensitiveRead[\s\S]{0,140}导出目标台账/);assert.match(service,/recordHrSensitiveRead[\s\S]{0,160}导出目标进展台账/);assert.match(service,/recordHrSensitiveRead[\s\S]{0,180}导出团队工作汇报台账/);
});
