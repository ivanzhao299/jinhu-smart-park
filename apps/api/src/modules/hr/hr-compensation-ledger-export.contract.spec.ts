import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {test} from "node:test";
const root=resolve(__dirname,"../../../../../"),read=(p:string)=>readFileSync(resolve(root,p),"utf8");
test("compensation export is a scoped bounded audited snapshot",()=>{const service=read("apps/api/src/modules/hr/hr.service.ts"),controller=read("apps/api/src/modules/hr/hr.controller.ts"),dto=read("apps/api/src/modules/hr/dto/hr.dto.ts");assert.match(controller,/@Get\("compensation\/assignments\/export"\)[\s\S]{0,180}HR_COMPENSATION_READ/);assert.match(dto,/class HrCompensationAssignmentExportDto[\s\S]{0,220}employeeId/);assert.match(service,/exportCompensationAssignments[\s\S]{0,5000}REPEATABLE READ/);assert.match(service,/LIMIT 5001/);assert.match(service,/exceeds 5000/);assert.match(service,/to_char\(now\(\) AT TIME ZONE 'UTC'/);assert.match(service,/assignments\/export[\s\S]{0,180}"financial","compensation"/);});
