import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(__dirname,"../..");
const read=(path:string)=>readFileSync(resolve(root,path),"utf8");

test("legacy archive resets rows and details across identity and query changes",()=>{
 const client=read("app/hr/employees/legacy/LegacyArchivePageClient.tsx");
 assert.match(client,/<LegacyArchiveContent key=\{JSON\.stringify\(\[user,unclaimed\]\)\}/);
 assert.match(client,/listAbort\.current\?\.abort\(\);detailAbort\.current\?\.abort\(\);setSelected\(null\);setRows\(\[\]\);setLoading\(true\);const timer=window\.setTimeout/);
 assert.match(client,/window\.clearTimeout\(timer\);listAbort\.current\?\.abort\(\);detailAbort\.current\?\.abort\(\)/);
});

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
 assert.equal(client.match(/ds-mobile-record-list \$\{styles\.recordList\}/g)?.length,2);
 assert.match(css,/\.recordList:global\(\.ds-mobile-record-list\)\s*\{\s*display:grid;/);
 for(const contract of ["ds-page","ds-hero","ds-panel","ds-mobile-record-list","ds-mobile-record"])assert.match(client,new RegExp(contract));
 assert.match(css,/@media \(max-width:520px\)/);
 assert.match(css,/\.filters \{ grid-template-columns:1fr/);
 assert.match(css,/\.projection \{ grid-template-columns:1fr/);
 assert.match(css,/width:100%; min-height:44px/);
 assert.match(client,/aria-label="旧系统资料分页"/);
 assert.match(client,/Math\.ceil\(total\/PAGE_SIZE\)/);
 assert.match(client,/兼容异常/);
 assert.match(client,/兼容关系/);
 assert.match(client,/sourceRelation/);
 assert.match(client,/targetRelation/);
 assert.match(css,/\.pagination \{ align-items:stretch; flex-direction:column/);
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
