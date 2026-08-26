import Link from "next/link";
import styles from "./ApartmentWorkbench.module.css";

export const APARTMENT_SECTIONS=[
 {view:"dashboard",label:"总览",description:"关键指标与快捷入口",href:"/apartments"},
 {view:"rooms",label:"房源",description:"房间与床位配置",href:"/apartments/rooms"},
 {view:"applications",label:"申请",description:"入住申请与审批",href:"/apartments/applications"},
 {view:"stays",label:"在住",description:"入住交接与在住档案",href:"/apartments/stays"},
 {view:"checkouts",label:"退房",description:"退房申请与验收",href:"/apartments/checkouts"},
 {view:"documents",label:"文书",description:"模板、签署与归档",href:"/apartments/documents"}
] as const;

export function ApartmentSectionNav({active}:{active:string}){
 const current=APARTMENT_SECTIONS.find(section=>section.view===active)??APARTMENT_SECTIONS[0];
 return <section className={`ds-panel ${styles.workspaceNav}`}>
  <div className={styles.workspaceIntro}><span className="ds-eyebrow">公寓工作区</span><strong>{current.label}</strong><span>{current.description}</span></div>
  <nav aria-label="公寓管理栏目" className={styles.nav}>{APARTMENT_SECTIONS.map(section=><Link aria-current={section.view===active?"page":undefined} href={section.href} key={section.href}><strong>{section.label}</strong><span>{section.description}</span></Link>)}</nav>
 </section>;
}
