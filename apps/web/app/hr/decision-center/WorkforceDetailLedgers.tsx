"use client";

import { useEffect,useState } from "react";
import type { HrWorkforceDecisionSnapshot } from "../../../lib/hr-api";
import { downloadCsv } from "../../../lib/scoped-csv-export";
import styles from "../hr-workbench.module.css";
import { workforceDepartmentLedgerCsv,workforceOrganizationStatusLabel,workforcePositionLedgerCsv } from "./workforce-detail-ledger";

const pageSize=50;
const display=(value:number|null)=>value==null?"未设置":String(value);

function Pager({page,total,onChange}:{page:number;total:number;onChange:(next:number)=>void}){
 if(total<=pageSize)return null;
 return <div className={`${styles.actionRow} ${styles.ledgerPager}`}><button type="button" className="ds-button ds-button-secondary" disabled={page===1} onClick={()=>onChange(page-1)}>上一页</button><span>第 {page} 页，共 {Math.ceil(total/pageSize)} 页</span><button type="button" className="ds-button ds-button-secondary" disabled={page*pageSize>=total} onClick={()=>onChange(page+1)}>下一页</button></div>;
}

export function WorkforceDetailLedgers({snapshot,enabled}:{snapshot:HrWorkforceDecisionSnapshot;enabled:boolean}){
 const [departmentPage,setDepartmentPage]=useState(1),[positionPage,setPositionPage]=useState(1);
 useEffect(()=>{setDepartmentPage(1);setPositionPage(1);},[snapshot]);
 const departments=snapshot.departments??[],positions=snapshot.positions??[];
 const visibleDepartments=departments.slice((departmentPage-1)*pageSize,departmentPage*pageSize),visiblePositions=positions.slice((positionPage-1)*pageSize,positionPage*pageSize);
 return <section className={`${styles.businessGroups} ${styles.ledgerPanels}`} aria-label="人员明细台账">
  <section className={`ds-panel ${styles.section} ${styles.businessGroup}`}><header className={styles.sectionHeader}><div><span className="ds-eyebrow">组织人员台账</span><h2>部门直接归属</h2><p>人员和编制均为当前快照；按员工当前主组织直接统计，组织编制来自组织维护；未归属员工单列。</p></div><button type="button" className={`ds-button ds-button-secondary ${styles.ledgerExport}`} disabled={!enabled} onClick={()=>downloadCsv(workforceDepartmentLedgerCsv(departments),"部门人员结构台账.csv")}>导出全部部门台账</button></header>
   <div className="ds-mobile-record-list">{visibleDepartments.map(row=><article className="ds-mobile-record" key={row.code??"unassigned"}><strong>{row.name}</strong><span>{row.code??"未归属"} · {workforceOrganizationStatusLabel(row.status)}</span><span>员工 {row.employeeTotal} · 在职 {row.activeCount} · 试用 {row.probationCount}</span><span>待入职 {row.preboardingCount} · 停职 {row.suspendedCount} · 离职 {row.departedCount}</span><span>组织编制：{display(row.plannedHeadcount)}</span></article>)}{!visibleDepartments.length?<p>当前没有可见组织记录。</p>:null}</div><Pager page={departmentPage} total={departments.length} onChange={setDepartmentPage}/>
  </section>
  <section className={`ds-panel ${styles.section} ${styles.businessGroup}`}><header className={styles.sectionHeader}><div><span className="ds-eyebrow">岗位人员台账</span><h2>启用岗位编制</h2><p>岗位归属按岗位维护，可能不同于员工当前主组织；仅统计已启用岗位，未设置岗位编制不会按零处理。</p></div><button type="button" className={`ds-button ds-button-secondary ${styles.ledgerExport}`} disabled={!enabled} onClick={()=>downloadCsv(workforcePositionLedgerCsv(positions),"岗位编制与在岗台账.csv")}>导出全部岗位台账</button></header>
   <div className="ds-mobile-record-list">{visiblePositions.map(row=><article className="ds-mobile-record" key={`${row.orgCode??"unassigned"}:${row.positionCode}`}><strong>{row.positionName}</strong><span>{row.orgName}（{row.orgCode??"未归属"}）· {row.positionCode}</span><span>岗位编制：{display(row.headcountLimit)} · 在职及试用 {row.activeHeadcount}</span><span>可补编制：{display(row.vacancyCount)} · 超编人数：{display(row.overCapacityCount)}</span></article>)}{!visiblePositions.length?<p>当前没有可见启用岗位。</p>:null}</div><Pager page={positionPage} total={positions.length} onChange={setPositionPage}/>
  </section>
 </section>;
}
