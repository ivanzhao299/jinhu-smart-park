import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(__dirname, "roles/page.tsx"), "utf8");

test("non-managed template instantiation is staged through an explicit allowlist", () => {
  assert.match(source, /nonManagedTemplateInstantiationAllowlist = new Set\(\["CANTEEN_ADMIN"\]\)/);
  assert.match(source, /function canOpenTemplateInstance/);
  assert.match(source, /role\.isTemplate && role\.roleScope !== "platform" && nonManagedTemplateInstantiationAllowlist\.has\(role\.code\)/);
});

test("instantiation entry points honor the allowlist gate instead of managed-template-only access", () => {
  assert.match(source, /if \(!canOpenTemplateInstance\(role\)\) \{/);
  assert.match(source, /const selectedRoleInstantiable = Boolean\(selectedRole && canOpenTemplateInstance\(selectedRole\)\)/);
  assert.match(source, /selectedRoleInstantiable && canInstantiateTemplates \? <button className="ds-button ds-button-secondary"/);
  assert.match(source, /\) : selectedRoleInstantiable \? \(/);
});

test("instantiation drawer copy distinguishes managed templates from copied templates", () => {
  assert.match(source, /templateInstanceRole\.managedTemplateCode\s*\?/);
  assert.match(source, /权限和当前园区数据范围由标准模板定义生成/);
  assert.match(source, /权限、数据范围和字段策略按来源模板当前配置复制/);
});
