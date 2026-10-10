"use client";
import {ScopedLedgerExport} from "../ScopedLedgerExport";
import {hrApi,type HrPerformanceReviewV2} from "../../../lib/hr-api";
import {performanceDimensionLedgerCsv,performanceResultLedgerCsv,type PerformanceResultExportAccess} from "./performance-result-export";

type Props={contextKey:string;enabled:boolean;cycleId:string;status:string;access:PerformanceResultExportAccess};

function reviewPage(cycleId:string,status:string){
 return (page:number,pageSize:number,signal:AbortSignal,token?:string)=>hrApi.performanceReviewPageV2({page,pageSize,cycleId,status},token,signal).then(result=>({items:result.items,page:result.page,page_size:result.pageSize,total:result.total}));
}

/** Two independent exports use the same live, scoped page reader as the workbench. */
export function PerformanceResultExports({contextKey,enabled,cycleId,status,access}:Props){
 const fetchPage=reviewPage(cycleId,status);
 return <div className="ds-command-grid" aria-label="绩效台账导出">
  <ScopedLedgerExport<HrPerformanceReviewV2> contextKey={`${contextKey}:summary`} enabled={enabled} label="绩效评价" fileName="绩效评价台账.csv" fetchPage={fetchPage} serialize={rows=>performanceResultLedgerCsv(rows,access)}/>
  <ScopedLedgerExport<HrPerformanceReviewV2> contextKey={`${contextKey}:dimension`} enabled={enabled} label="绩效维度" fileName="绩效维度明细.csv" fetchPage={fetchPage} serialize={rows=>performanceDimensionLedgerCsv(rows,access)} successMessage={rows=>`已导出 ${rows.length} 条评价的 ${rows.reduce((count,row)=>count+row.dimensions.length,0)} 条维度明细。`}/>
 </div>;
}
