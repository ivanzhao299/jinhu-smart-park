import type { HrEmploymentEvent } from "../../../../lib/hr-api";

export function HrEmploymentHistory({ events, recordListClassName = "" }: {
  events: HrEmploymentEvent[];
  recordListClassName?: string;
}) {
  return <section aria-label="任职历史">
    <h3>任职历史</h3>
    <p>保留每次任职记录，历史导入与现代业务分别标明来源和生效状态。</p>
    <div className={`ds-mobile-record-list ${recordListClassName}`}>
      {events.length ? events.map(event => <article className="ds-mobile-record" key={event.id}>
        <strong>{event.eventType}</strong>
        <span>{event.effectiveDate}</span>
        <span>{event.provenance?.origin === "historical_import" ? "历史导入" : event.provenance?.origin === "modern_business" ? "现代业务" : "来源未提供"}</span>
        <span>{event.provenance?.effect === "effective" ? "已生效" : event.provenance?.effect === "voided" ? "已作废" : "生效状态未确认"}</span>
        <span>{event.reason || "无备注"}</span>
      </article>) : <p>暂无任职变动记录。</p>}
    </div>
  </section>;
}
