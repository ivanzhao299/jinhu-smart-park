import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HrEmployeeProfileSummary } from "../../app/hr/employees/components/HrEmployeeProfileSummary";
import type { HrEmployeeProfile } from "../../lib/hr-api";

const fullProfile: HrEmployeeProfile = {
  id: "synthetic-profile", version: 1, employeeId: "synthetic-employee", masked: false,
  idType: "passport", idNumberMasked: "SY****00", idNumber: "SYNTHETIC-RAW-IDENTITY",
  englishName: "Synthetic name", gender: "其他", dateOfBirth: "1990-02-03", ethnicity: "合成民族",
  nativePlace: "合成籍贯", politicalStatus: "合成政治面貌", partyJoinDate: "2010-01-01",
  heightCm: "170.25", weightKg: "60.50", maritalStatus: "合成婚姻", healthStatus: "合成健康",
  householdRegistration: "合成户口地址", highestEducation: "合成学历", major: "合成专业", degree: "合成学位",
  foreignLanguage: "合成外语", languageLevel: "合成语言级别", graduationDate: "2012-07-01",
  graduationSchool: "合成学校", homePhone: "SYN-HOME-PHONE", jobTitle: "合成职务", jobGrade: "合成职务级别",
  employeeCategory: "合成员工类别", technicalTitle: "合成职称", technicalGrade: "合成职称级别",
  personalMobile: "SYN-MOBILE", personalEmail: "synthetic@example.invalid", address: "合成联系地址",
  emergencyContactName: "合成联系人", emergencyContactMobile: "SYN-EMERGENCY", remark: "合成备注\n第二行",
};

describe("employee profile readonly summary", () => {
  it("carries every full-profile API field and keeps the identity number masked", () => {
    render(<HrEmployeeProfileSummary profile={fullProfile} />);
    const summary = screen.getByLabelText("员工档案详情");
    const expected = [
      "Synthetic name", "其他", "1990-02-03", "合成民族", "合成籍贯", "合成政治面貌", "2010-01-01",
      "170.25", "60.50", "合成婚姻", "合成健康", "合成户口地址", "合成学历", "合成专业", "合成学位",
      "合成外语", "合成语言级别", "2012-07-01", "合成学校", "合成职务", "合成职务级别", "合成员工类别",
      "合成职称", "合成职称级别", "护照", "SY****00", "SYN-MOBILE", "SYN-HOME-PHONE",
      "synthetic@example.invalid", "合成联系地址", "合成联系人", "SYN-EMERGENCY", "合成备注 第二行",
    ];
    for (const value of expected) expect(within(summary).getByText(value)).toBeVisible();
    expect(summary.querySelectorAll("dt")).toHaveLength(33);
    expect(screen.queryByText("SYNTHETIC-RAW-IDENTITY")).toBeNull();
    expect(summary.querySelector("input,textarea,select,button")).toBeNull();
  });
  it.each([true, undefined])("does not expose additional fields for masked=%s even if present in a malformed response", masked => {
    render(<HrEmployeeProfileSummary profile={{ ...fullProfile, masked: masked as boolean,
      personalMobile: "SY***", personalEmail: "s***@example.invalid", address: "***",
      customFields: [{ code: "synthetic", label: "合成自定义", valueType: "text", group: null, sortOrder: 1, value: "SENSITIVE-CUSTOM", sourceValid: true }],
    }} />);
    expect(screen.getByText("受保护档案（已脱敏）")).toBeVisible();
    expect(screen.getByText("个人手机：SY***")).toBeVisible();
    for (const value of ["1990-02-03", "合成学历", "合成籍贯", "合成联系地址", "SENSITIVE-CUSTOM", "SYNTHETIC-RAW-IDENTITY"])
      expect(screen.queryByText(value)).toBeNull();
    expect(screen.queryByText(/合成备注/)).toBeNull();
    expect(screen.queryByText("教育与语言")).toBeNull();
  });
  it("distinguishes empty values from retained numeric text and preserves source validation warnings", () => {
    render(<HrEmployeeProfileSummary profile={{ ...fullProfile, englishName: null, degree: undefined, major: "", heightCm: "0",
      customFields: [{ code: "synthetic-zero", label: "合成扩展值", valueType: "numeric", group: null, sortOrder: 1, value: "0", sourceValid: false }],
    }} />);
    for (const label of ["英文姓名", "学位", "主修专业"])
      expect(within(screen.getByText(label).parentElement!).getByText("未登记")).toBeVisible();
    expect(within(screen.getByText("身高（厘米）").parentElement!).getByText("0")).toBeVisible();
    expect(screen.getByText("0（原值类型待校正）")).toBeVisible();
  });
  it("renders source text literally without executing markup", () => {
    const text = '<img src=x onerror="synthetic">';
    const view = render(<HrEmployeeProfileSummary profile={{ ...fullProfile, remark: text }} />);
    expect(screen.getByText(text)).toBeVisible();
    expect(view.container.querySelector("img")).toBeNull();
  });
});
