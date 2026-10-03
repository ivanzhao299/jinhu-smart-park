import type { HrEmployeeProfile } from "../../../../lib/hr-api";
import styles from "./hr-employee-profile-summary.module.css";

type ProfileField = readonly [keyof HrEmployeeProfile, string];
const fullProfileGroups: ReadonlyArray<{ title: string; fields: ReadonlyArray<ProfileField> }> = [
  { title: "身份与个人信息", fields: [
    ["englishName", "英文姓名"], ["gender", "性别"], ["dateOfBirth", "出生日期"],
    ["ethnicity", "民族"], ["nativePlace", "籍贯"], ["politicalStatus", "政治面貌"],
    ["partyJoinDate", "参加党派时间"], ["heightCm", "身高（厘米）"], ["weightKg", "体重（公斤）"],
    ["maritalStatus", "婚姻状况"], ["healthStatus", "健康状况"], ["householdRegistration", "户口所在地"],
  ] },
  { title: "教育与语言", fields: [
    ["highestEducation", "最高学历"], ["major", "主修专业"], ["degree", "学位"],
    ["foreignLanguage", "外语"], ["languageLevel", "外语水平"],
    ["graduationDate", "毕业日期"], ["graduationSchool", "毕业学校"],
  ] },
  { title: "职务与专业资格", fields: [
    ["jobTitle", "职务"], ["jobGrade", "职务级别"], ["employeeCategory", "员工类别"],
    ["technicalTitle", "技术职称"], ["technicalGrade", "职称级别"],
  ] },
  { title: "证件与联系方式", fields: [
    ["idType", "证件类型"], ["idNumberMasked", "证件号（掩码）"],
    ["personalMobile", "个人手机"], ["homePhone", "家庭电话"], ["personalEmail", "个人邮箱"],
    ["address", "联系地址"], ["emergencyContactName", "紧急联系人"],
    ["emergencyContactMobile", "紧急联系电话"],
  ] },
  { title: "档案备注", fields: [["remark", "档案备注"]] },
];
const identityTypes: Record<string, string> = { resident_id: "居民身份证", passport: "护照", other: "其他" };

function displayValue(profile: HrEmployeeProfile, key: keyof HrEmployeeProfile) {
  const value = profile[key];
  if (value === null || value === undefined || value === "") return "未登记";
  return key === "idType" ? identityTypes[String(value)] ?? String(value) : String(value);
}

export function HrEmployeeProfileSummary({ profile }: { profile: HrEmployeeProfile }) {
  // Only an explicit full API projection admits the additional sensitive fields.
  const full = profile.masked === false;
  const customGroups = new Map<string, NonNullable<HrEmployeeProfile["customFields"]>>();
  if (full) for (const field of profile.customFields ?? []) {
    const group = field.group || "玉舟扩展档案";
    const fields = customGroups.get(group) ?? [];
    fields.push(field);
    customGroups.set(group, fields);
  }
  return <div className={`ds-mobile-record-list ${styles.groups}`} aria-label="员工档案详情">
    {full ? fullProfileGroups.map(group => <article className={`ds-mobile-record ${styles.group}`} key={group.title}>
      <strong>{group.title}</strong>
      <dl>{group.fields.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{displayValue(profile, key)}</dd></div>)}</dl>
    </article>) : <article className={`ds-mobile-record ${styles.group}`}>
      <strong>受保护档案（已脱敏）</strong>
      <span>证件：{profile.idNumberMasked || "未登记"}</span>
      <span>个人手机：{profile.personalMobile || "未登记"}</span>
      <span>个人邮箱：{profile.personalEmail || "未登记"}</span>
      <span>紧急联系人：{profile.emergencyContactName || "未登记"} · {profile.emergencyContactMobile || "未登记"}</span>
      <span>职务/职级：{profile.jobTitle || "未登记"} · {profile.jobGrade || "未登记"}</span>
    </article>}
    {[...customGroups].map(([group, fields]) => <article className={`ds-mobile-record ${styles.group}`} key={group}>
      <strong>{group}</strong>
      <dl>{fields.map(field => <div key={field.code}><dt>{field.label || field.code}</dt>
        <dd>{field.value ?? "未登记"}{field.sourceValid ? null : "（原值类型待校正）"}</dd>
      </div>)}</dl>
    </article>)}
  </div>;
}
