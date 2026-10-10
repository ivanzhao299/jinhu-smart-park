import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root=resolve(__dirname,"../../../../../"),read=(file:string)=>readFileSync(resolve(root,file),"utf8");
test("compensation assignment ledger keeps its exact scoped and audited read contract",()=>{
 const controller=read("apps/api/src/modules/hr/hr.controller.ts"),service=read("apps/api/src/modules/hr/hr.service.ts"),dto=read("apps/api/src/modules/hr/dto/hr.dto.ts");
 assert.match(controller,/@Get\("compensation\/assignments"\)[\s\S]{0,160}HR_COMPENSATION_READ/);
 assert.match(dto,/class HrCompensationAssignmentListDto[\s\S]{0,300}page_size/);
 assert.match(service,/actor\.tenantId!==scope\.tenantId[\s\S]{0,220}HR_COMPENSATION_READ/);
 assert.match(service,/employee\.tenant_id=assignment\.tenant_id[\s\S]{0,160}employee\.is_deleted=false[\s\S]{0,220}plan\.is_deleted=false/);
 assert.match(service,/ILIKE \$3 ESCAPE[\s\S]{0,1200}assignment\.is_deleted=false/);
 assert.match(service,/effective_from DESC,assignment\.id DESC/);
 assert.match(service,/recordHrSensitiveRead[\s\S]{0,340}hr\.employee_compensation[\s\S]{0,300}"financial","compensation"/);
});
