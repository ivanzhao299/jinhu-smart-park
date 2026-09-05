import type { HrEmployeeRecords } from "../../../../lib/hr-api";

export interface HrFamilyRecordsProps {
  records: Pick<HrEmployeeRecords, "family" | "fieldAccess">;
  canReadFull: boolean;
}

const hasRegisteredValue = (value: string | null | undefined): value is string =>
  typeof value === "string" && value.length > 0;

const registeredValue = (value: string | null | undefined): string =>
  hasRegisteredValue(value) ? value : "未登记";

export function HrFamilyRecords({ records, canReadFull }: HrFamilyRecordsProps) {
  if (records.fieldAccess.family !== true) {
    return <p role="status">无家庭成员档案查看权限。</p>;
  }

  if (records.family.length === 0) {
    return <p>暂无家庭成员档案。</p>;
  }

  return (
    <>
      {records.family.map((record) => {
        const fullName = canReadFull && hasRegisteredValue(record.fullName)
          ? record.fullName
          : record.fullNameMasked;
        const contact = canReadFull && hasRegisteredValue(record.contact)
          ? record.contact
          : record.contactMasked;

        return (
          <article
            className="ds-mobile-record"
            key={record.id}
            style={{ minWidth: 0, overflowWrap: "anywhere" }}
          >
            <strong>姓名：{registeredValue(fullName)}</strong>
            <span>关系：{registeredValue(record.relationship)}</span>
            <span>出生日期：{registeredValue(record.birthDate)}</span>
            <span>工作单位：{registeredValue(record.workUnit)}</span>
            <span>职务：{registeredValue(record.jobTitle)}</span>
            <span>政治面貌：{registeredValue(record.politicalStatus)}</span>
            <span>联系方式：{registeredValue(contact)}</span>
          </article>
        );
      })}
    </>
  );
}
