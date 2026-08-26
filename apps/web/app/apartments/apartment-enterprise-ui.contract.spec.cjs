const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");

const root="apps/web/app/apartments";
const read=name=>fs.readFileSync(path.join(root,name),"utf8");

test("all apartment workbenches share the enterprise section navigation",()=>{
 const workbench=read("ApartmentWorkbench.tsx"),documents=read("ApartmentDocumentsWorkbench.tsx"),nav=read("ApartmentSectionNav.tsx");
 assert.match(workbench,/ApartmentSectionNav active=\{view\}/);
 assert.match(documents,/ApartmentSectionNav active="documents"/);
 for(const label of ["总览","房源","申请","在住","退房","文书"])assert.match(nav,new RegExp(`label:"${label}"`));
 assert.match(workbench,/APARTMENT_SECTIONS\.slice\(1\)/);
 assert.match(nav,/ds-panel \$\{styles\.workspaceNav\}/);
});

test("apartment workflow order and responsive spacing follow the production design system",()=>{
 const workbench=read("ApartmentWorkbench.tsx"),create=read("ApartmentCreatePanel.tsx"),css=read("ApartmentWorkbench.module.css");
 assert.ok(workbench.indexOf("ds-kpi-grid")<workbench.indexOf("<ApartmentCreatePanel"));
 assert.match(create,/styles\.checkboxField/);
 assert.match(css,/\.workspaceNav \{[^}]*grid-template-columns:/s);
 assert.match(css,/@media \(max-width: 720px\)[\s\S]*\.nav \{ grid-template-columns: repeat\(2,/);
 assert.match(css,/@media \(max-width: 420px\)[\s\S]*\.nav \{ grid-template-columns: minmax\(0, 1fr\)/);
 assert.doesNotMatch(css,/border-radius:\s*999px/);
});
