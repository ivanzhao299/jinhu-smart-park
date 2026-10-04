import type { HrEmployeeRecords } from "../../../../lib/hr-api";
const levels:Record<string,string>={basic:"基础",intermediate:"熟练",advanced:"高级",expert:"专家"};
export function HrExtendedRecords({records}:{records:HrEmployeeRecords}){
 return <>{records.experiences.map(row=><article className="ds-mobile-record" key={row.id}><strong>{row.organizationName}</strong><span>{row.type==="education"?"教育经历":"工作经历"} · {row.title||"未登记专业或职务"}</span><span>{row.endDate?`${row.startDate} 至 ${row.endDate}`:`${row.startDate} 起`}</span>{row.summary?<p>{row.summary}</p>:null}</article>)}
 {records.skills.map(row=><article className="ds-mobile-record" key={row.id}><strong>{row.skillName}</strong><span>熟练程度：{row.proficiency?levels[row.proficiency]??row.proficiency:"未评级"}</span>{row.legacyGrade?<span>业务等级：{row.legacyGrade}</span>:null}{row.acquiredDate?<span>获得日期：{row.acquiredDate}</span>:null}{row.note?<p>{row.note}</p>:null}</article>)}
 {records.credentials.map(row=><article className="ds-mobile-record" key={row.id}><strong>{row.credentialName}</strong><span>类别：{row.credentialType}</span><span>编号：{row.credentialNumber??row.numberMasked??"未登记"}</span>{row.issuingAuthority?<span>发证机关：{row.issuingAuthority}</span>:null}{row.acquiredDate?<span>取得日期：{row.acquiredDate}</span>:null}<span>{row.validTo?`有效至 ${row.validTo}`:"未登记有效期"}</span>{row.note?<p>{row.note}</p>:null}</article>)}</>;
}
