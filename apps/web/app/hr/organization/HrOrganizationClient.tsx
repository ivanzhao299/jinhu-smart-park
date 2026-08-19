"use client";
import { useCallback,useEffect,useState } from "react";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { getAccessToken } from "../../../lib/authz";
import { hrApi,type HrPosition } from "../../../lib/hr-api";
import styles from "../hr-workbench.module.css";
export function HrOrganizationClient(){const[rows,setRows]=useState<HrPosition[]>([]),[message,setMessage]=useState("");const load=useCallback(async()=>{try{setRows(await hrApi.positions(getAccessToken()))}catch(e){setMessage(e instanceof Error?e.message:"加载岗位失败")}},[]);useEffect(()=>{void load()},[load]);return <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_ORGANIZATION_PAGE} fallback={<main className="content ds-page"><section className="ds-panel"><h1>无权访问组织与岗位</h1></section></main>}><main className={`content ds-page ${styles.page}`}><section className="ds-hero"><div className="ds-hero-copy"><span className="ds-eyebrow">人力资源管理</span><h1>组织与岗位</h1><p>复用系统组织树，在其上维护岗位、职族、职级与编制。</p></div></section>{message?<p className="form-error" role="alert">{message}</p>:null}<section className="ds-panel"><div className="ds-mobile-record-list">{rows.length?rows.map(row=><article className="ds-mobile-record" key={row.id}><strong>{row.positionName}</strong><span>{row.positionCode}</span><span>{row.jobFamily||"未设置职族"} · {row.jobLevel||"未设置职级"}</span><span>编制：{row.headcountLimit??"未限制"}</span></article>):<p>暂无岗位。岗位创建将在组织候选接口完成接入后开放。</p>}</div></section></main></PermissionGuard>}
