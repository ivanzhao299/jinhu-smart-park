import type { HrEmploymentEvent } from "../../../../lib/hr-api";

const eventTypeLabels:Record<string,string>={created:"新建档案",profile_updated:"档案更新",start_probation:"入职试用",confirm_employment:"转正",transfer:"调动",suspend:"停职",resume:"复职",depart:"离职"};
const effectLabels:Record<NonNullable<HrEmploymentEvent["provenance"]>["effect"],string>={effective:"已生效",voided:"已作废",unconfirmed:"生效状态未确认"};
const originLabels:Record<NonNullable<HrEmploymentEvent["provenance"]>["origin"],string>={historical_import:"历史导入",modern_business:"现代业务",unclassified:"来源未提供"};

export function HrEmploymentHistory({ events, recordListClassName = "" }: {
  events: HrEmploymentEvent[];
  recordListClassName?: string;
}) {
  return <section aria-label="任职历史">
    <h3>任职历史</h3>
    <p>保留每次任职记录，按实际业务日期和状态展示。</p>
    <div className={`ds-mobile-record-list ${recordListClassName}`}>
      {events.length ? events.map(event => <article className="ds-mobile-record" key={event.id}>
        <strong>{eventTypeLabels[event.eventType]??event.eventType}</strong>
        <span>生效日期：{event.effectiveDate}</span>
        <span>{event.provenance?(effectLabels[event.provenance.effect]??event.provenance.effect):effectLabels.unconfirmed}</span>
        <span>备注：{event.reason || "无备注"}</span>
        <details><summary>资料来源与沿革</summary><span>记录来源：{event.provenance?(originLabels[event.provenance.origin]??event.provenance.origin):originLabels.unclassified}</span></details>
      </article>) : <p>暂无任职变动记录。</p>}
    </div>
  </section>;
}
