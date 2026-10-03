import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const directory=__dirname;
const component=readFileSync(join(directory,"HrEmployeesClient.tsx"),"utf8");
const css=readFileSync(join(directory,"employees.module.css"),"utf8");

test("manager candidate transfer field owns a full-width, wrapping pager layout",()=>{
 assert.match(component,/form-field \$\{employeeStyles\.managerCandidates\}/);
 assert.match(component,/className=\{employeeStyles\.managerCandidatesPager\}/);
 assert.match(component,/className=\{employeeStyles\.managerCandidatesPageStatus\}/);
 assert.doesNotMatch(component,/直属上级候选分页" className=\{styles\.heroActions\}/);
 assert.match(css,/\.managerCandidates \{[\s\S]*grid-column: 1 \/ -1;[\s\S]*min-width: 0;/);
 assert.match(css,/\.managerCandidatesPager \{[\s\S]*flex-wrap: wrap;/);
 assert.match(css,/\.managerCandidatesPager :global\(\.ds-button\),[\s\S]*white-space: nowrap;/);
});
