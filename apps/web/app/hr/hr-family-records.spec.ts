import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { HrEmployeeFamilyRecord } from "../../lib/hr-api";
import { HrFamilyRecords } from "./employees/components/HrFamilyRecords";

const familyRecord = (
  overrides: Partial<HrEmployeeFamilyRecord> = {},
): HrEmployeeFamilyRecord => ({
  id: "00000000-0000-4000-8000-000000000001",
  relationship: "合成关系",
  fullNameMasked: "合***甲",
  fullName: "合成人员甲",
  identityMasked: null,
  contactMasked: "13*******01",
  contact: "synthetic-contact-01",
  isEmergencyContact: false,
  birthDate: "2000-02-29",
  workUnit: "合成单位",
  jobTitle: "合成职务",
  politicalStatus: "合成状态",
  ...overrides,
});

const render = ({
  family = [familyRecord()],
  familyAccess = true,
  canReadFull = false,
}: {
  family?: HrEmployeeFamilyRecord[];
  familyAccess?: boolean;
  canReadFull?: boolean;
} = {}) => renderToStaticMarkup(createElement(HrFamilyRecords, {
  records: {
    family,
    fieldAccess: { family: familyAccess, credential: false },
  },
  canReadFull,
}));

test("exact full permission renders all seven labels with full sensitive values", () => {
  const html = render({ canReadFull: true });
  for (const label of ["姓名", "关系", "出生日期", "工作单位", "职务", "政治面貌", "联系方式"]) {
    assert.match(html, new RegExp(`${label}：`, "u"));
  }
  assert.match(html, /姓名：合成人员甲/u);
  assert.match(html, /联系方式：synthetic-contact-01/u);
  assert.doesNotMatch(html, /合\*\*\*甲|13\*{7}01/u);
  assert.match(html, /出生日期：2000-02-29/u);
  assert.doesNotMatch(html, /T00:00|\/2000/u);
  assert.doesNotMatch(html, /ds-mobile-record-list/u);
});

test("multiple family records render as sibling cards in the existing parent grid", () => {
  const html = render({
    family: [
      familyRecord(),
      familyRecord({
        id: "00000000-0000-4000-8000-000000000002",
        fullNameMasked: "合***乙",
        relationship: "合成关系乙",
      }),
    ],
  });
  assert.equal(html.match(/class="ds-mobile-record"/gu)?.length, 2);
  assert.match(html, /姓名：合\*\*\*甲/u);
  assert.match(html, /姓名：合\*\*\*乙/u);
  assert.doesNotMatch(html, /ds-mobile-record-list/u);
});

test("masked reader sees only masked sensitive fields", () => {
  const html = render();
  assert.match(html, /姓名：合\*\*\*甲/u);
  assert.match(html, /联系方式：13\*{7}01/u);
  assert.doesNotMatch(html, /合成人员甲|synthetic-contact-01/u);
});

test("unexpected full fields in a masked response never override masks", () => {
  const html = render({
    canReadFull: false,
    family: [familyRecord({ fullName: "UNEXPECTED-FULL-NAME", contact: "UNEXPECTED-FULL-CONTACT" })],
  });
  assert.doesNotMatch(html, /UNEXPECTED-FULL/u);
  assert.match(html, /合\*\*\*甲|13\*{7}01/u);
});

test("denied family field access shows a visible denial and renders no records", () => {
  const html = render({
    familyAccess: false,
    canReadFull: true,
    family: [familyRecord({ fullName: "DENIED-FULL-VALUE", fullNameMasked: "DENIED-MASK" })],
  });
  assert.match(html, /无家庭成员档案查看权限/u);
  assert.match(html, /role="status"/u);
  assert.doesNotMatch(html, /ds-mobile-record|DENIED-/u);
});

test("allowed empty family records have a clear empty label", () => {
  const html = render({ family: [] });
  assert.match(html, /暂无家庭成员档案/u);
  assert.doesNotMatch(html, /ds-mobile-record/u);
});

test("null optional values fall back to masks or the common unregistered label", () => {
  const html = render({
    canReadFull: true,
    family: [familyRecord({
      fullName: null,
      contact: null,
      birthDate: null,
      workUnit: null,
      jobTitle: null,
      politicalStatus: null,
    })],
  });
  assert.match(html, /姓名：合\*\*\*甲/u);
  assert.match(html, /联系方式：13\*{7}01/u);
  assert.equal(html.match(/未登记/gu)?.length, 4);
});

test("Unicode is preserved and React escapes HTML-shaped response text", () => {
  const html = render({
    canReadFull: true,
    family: [familyRecord({
      fullName: "示例<家庭成员>&甲",
      relationship: "亲属<关系>",
      contact: "联络&方式",
    })],
  });
  assert.match(html, /示例&lt;家庭成员&gt;&amp;甲/u);
  assert.match(html, /亲属&lt;关系&gt;/u);
  assert.match(html, /联络&amp;方式/u);
  assert.doesNotMatch(html, /<家庭成员>|<关系>/u);
});
