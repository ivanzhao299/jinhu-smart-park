import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EmployeeLegacyState } from "./EmployeeLegacyState";

const render = (code: string | null, name: string | null) => renderToStaticMarkup(createElement(EmployeeLegacyState, {
  employee: { legacyJobstateCode: code, legacyJobstateName: name },
}));
test("source code and name render separately without becoming a mutable control", () => {
  const html = render("A", "临时人员");
  assert.match(html, /<dd>A<\/dd>/);
  assert.match(html, /<dd>临时人员<\/dd>/);
  assert.match(html, /不代表当前任职状态/);
  assert.doesNotMatch(html, /<input|<select|<form|<button/);
});
test("unknown and missing source values are explicit, not inferred", () => {
  assert.match(render("UNKNOWN", null), /未识别名称，保留原代码/);
  assert.match(render(null, null), /未保留/);
  assert.doesNotMatch(render(null, null), /<dd>在职/);
});
test("React escapes source text and the layout wraps long source values", () => {
  const html = render("<script>bad</script>", "A&B");
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /A&amp;B/);
  assert.match(html, /overflow-wrap:anywhere/);
});
