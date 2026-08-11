import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const root=new URL("../../",import.meta.url);
const read=(path)=>readFile(new URL(path,root),"utf8");
const [migration,seed,atomicRbac,controller,service,menu,shared,layout,workbench,userImport]=await Promise.all([
 read("database/migrations/000202_apartment_management_foundation.sql"),read("database/seeds/production/000011_apartment_management_rbac.sql"),read("database/seeds/production/000012_wu_enguo_atomic_rbac.sql"),read("apps/api/src/modules/apartments/apartments.controller.ts"),read("apps/api/src/modules/apartments/apartments.service.ts"),read("apps/web/lib/menu.ts"),read("packages/shared/src/apartment.ts"),read("apps/web/app/apartments/layout.tsx"),read("apps/web/app/apartments/ApartmentWorkbench.tsx"),read("scripts/generate_jinhu_2026_user_import.py")
]);
for(const table of ["biz_apartment_room","biz_apartment_bed","biz_apartment_application","biz_apartment_approval","biz_apartment_stay","biz_apartment_handover","biz_apartment_document_template","biz_apartment_document"])assert.match(migration,new RegExp(`CREATE TABLE ${table}\\b`));
assert.match(migration,/ex_apartment_stay_bed_period/);
assert.match(migration,/source_domain IN \([^)]*'apartment'/s);
assert.match(seed,/APARTMENT_MANAGER/);assert.match(seed,/wu_enguo/);assert.doesNotMatch(seed,/INSERT INTO sys_user/i);
assert.match(controller,/@RequireModule\("apartment"\)/);assert.match(controller,/IdempotencyInterceptor/g);assert.match(controller,/AuditLog/g);
for(const state of ["submitted","approved","allocated","active","checkout_pending","completed"])assert.match(service,new RegExp(`["]${state}["]|[']${state}[']`));
for(const route of ["/apartments","/apartments/rooms","/apartments/applications","/apartments/stays","/apartments/checkouts","/apartments/documents"])assert.ok(menu.includes(route),`missing menu route ${route}`);
assert.equal((shared.match(/APARTMENT_[A-Z_]+:/g)||[]).length,17);
assert.match(layout,/DashboardLayout/);
assert.match(workbench,/fallback=\{forbidden\}/);
assert.match(workbench,/无权访问公寓管理/);
assert.match(atomicRbac,/JH_HR_ADMIN_MANAGER/);
assert.match(atomicRbac,/APARTMENT_MANAGER/);
assert.match(atomicRbac,/NOT EXISTS\(SELECT 1 FROM wu_expected_roles/);
assert.match(atomicRbac,/username IN \('wu_enguo','wuenguo'\)/);
assert.doesNotMatch(userImport,/User\("wuenguo"[^\n]+\("SYSTEM_ADMIN"/);
console.log("apartment-management-contract: PASS");
