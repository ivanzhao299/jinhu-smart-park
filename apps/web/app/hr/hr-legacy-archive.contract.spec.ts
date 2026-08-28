import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(__dirname,"../..");
const read=(path:string)=>readFileSync(resolve(root,path),"utf8");

test("legacy and unclaimed pages use separate page and API permission atoms",()=>{
 const client=read("app/hr/employees/legacy/LegacyArchivePageClient.tsx");
 const legacyPage=read("app/hr/employees/legacy/page.tsx");
 const unclaimedPage=read("app/hr/employees/unclaimed/page.tsx");
 assert.match(client,/HR_LEGACY_ARCHIVE_PAGE/);
 assert.match(client,/HR_LEGACY_UNCLAIMED_PAGE/);
 assert.match(client,/HR_LEGACY_ARCHIVE_UNCLAIMED_READ/);
 assert.match(legacyPage,/<LegacyArchivePageClient\/>/);
 assert.match(unclaimedPage,/<LegacyArchivePageClient unclaimed\/>/);
 assert.match(client,/原始敏感内容继续保存在加密对象中/);
 assert.match(client,/不按姓名猜测、不自动创建账号/);
 assert.doesNotMatch(client,/encryptedSourceObjectRef|encryptedBlobRef|sourceIdentitySha256/);
});

test("legacy archive page is design-system based and 390px safe",()=>{
 const client=read("app/hr/employees/legacy/LegacyArchivePageClient.tsx");
 const css=read("app/hr/employees/legacy/legacy-archive.module.css");
 for(const contract of ["ds-page","ds-hero","ds-panel","ds-mobile-record-list","ds-mobile-record"])assert.match(client,new RegExp(contract));
 assert.match(css,/@media \(max-width:520px\)/);
 assert.match(css,/\.filters \{ grid-template-columns:1fr/);
 assert.match(css,/\.projection \{ grid-template-columns:1fr/);
 assert.match(css,/width:100%; min-height:44px/);
 const rules=css.slice(0,css.indexOf("@media"));
 assert.doesNotMatch(rules,/min-width:\s*[4-9][0-9]{2}px|width:\s*[4-9][0-9]{2}px/);
});

test("employee page exposes scoped history and HR-only unclaimed navigation",()=>{
 const employees=read("app/hr/employees/HrEmployeesClient.tsx");
 assert.match(employees,/canReadLegacyArchive=hasAnyPermission/);
 assert.match(employees,/canReadUnclaimedArchive=hasPermission\(user,HR_PERMISSIONS\.HR_LEGACY_ARCHIVE_UNCLAIMED_READ\)/);
 assert.match(employees,/href="\/hr\/employees\/legacy"/);
 assert.match(employees,/href="\/hr\/employees\/unclaimed"/);
 assert.match(employees,/employee_id=\$\{selected\.id\}/);
});
