import type {HrPayrollPreparationCohort,HrPayrollPreparationEmployee,HrPayrollPreparationCounts} from "../../../lib/hr-api";
import {csvDocument} from "../../../lib/scoped-csv-export";

const countKeys=["recordCount","sourceRowCount","itemCount","mappedRecordCount","unmappedRecordCount","duplicateSourceCount","quarantinedCount","unavailableReferenceCount","unavailableEmployeeCount","unresolvedItemCount","duplicateEmployeeExtraCount"] as const;
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==="object"&&!Array.isArray(value);
const count=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=0;
const text=(value:unknown):value is string=>typeof value==="string"&&value.length>0;
const counts=(value:unknown):value is HrPayrollPreparationCounts=>object(value)&&countKeys.every(key=>count(value[key]));
const conserved=(value:HrPayrollPreparationCounts)=>
  value.mappedRecordCount+value.unmappedRecordCount+value.duplicateSourceCount+value.quarantinedCount===value.recordCount&&
  value.sourceRowCount>=value.recordCount&&value.unavailableReferenceCount<=value.recordCount&&
  value.unavailableEmployeeCount<=value.mappedRecordCount&&value.unresolvedItemCount<=value.itemCount&&
  value.duplicateEmployeeExtraCount<=value.mappedRecordCount;
export function assertPreparationCohort(value:unknown,query:{legacyBatchId:string;periodMonth:string},page:number,size:number):asserts value is HrPayrollPreparationCohort {
  if(!object(value)||value.legacyBatchId!==query.legacyBatchId||value.periodMonth!==query.periodMonth||value.preparationOnly!==true||!["staged","published"].includes(value.sourceStatus as string)||!count(value.total)||value.page!==page||value.page_size!==size||!counts(value.totals)||!object(value.totals)||value.totals.employeeCount!==value.total||!count(value.totals.bookCount)||!Array.isArray(value.books)||value.books.length!==value.totals.bookCount||!Array.isArray(value.items)||value.items.length!==Math.min(size,Math.max(0,value.total-(page-1)*size))) throw new Error("人员准备清单响应无效，请重新查询。");
  if(!conserved(value.totals)||value.total>value.totals.mappedRecordCount)throw new Error("来源记录数量不一致，请重新查询。");
  const books=new Set<string>(),employees=new Set<string>();
  for(const book of value.books){
    if(!object(book)||!text(book.bookId)||books.has(book.bookId)||typeof book.bookName!=="string"||!count(book.legacyScheme)||typeof book.available!=="boolean"||!counts(book)||!count(book.approvedFormulaCandidateCount)||!(book.currentNetPolicy===null||(object(book.currentNetPolicy)&&text(book.currentNetPolicy.id)&&count(book.currentNetPolicy.versionNo)&&typeof book.currentNetPolicy.status==="string"&&text(book.currentNetPolicy.netItemVersionId))))throw new Error("账套准备信息无效，请重新查询。");
    if(!conserved(book))throw new Error("账套来源记录数量不一致，请重新查询。");
    books.add(book.bookId);
  }
  for(const key of countKeys){
    if(value.books.reduce((sum,book)=>sum+book[key],0)!==value.totals[key])throw new Error("账套合计与来源总数不一致，请重新查询。");
  }
  for(const item of value.items){
    if(!object(item)||!text(item.employeeId)||employees.has(item.employeeId)||typeof item.employeeCode!=="string"||typeof item.fullName!=="string"||!count(item.recordCount)||!Array.isArray(item.books)||!item.books.length||typeof item.historicalInsuranceNeedsReview!=="boolean"||!["attendanceInputCount","historicalInsurancePeriodCount","historicalInsuranceSourceCount","modernInsuranceSourceCount"].every(key=>count(item[key])))throw new Error("人员准备信息无效，请重新查询。");
    const seen=new Set<string>();let records=0;
    for(const book of item.books){if(!object(book)||!text(book.bookId)||!books.has(book.bookId)||seen.has(book.bookId)||!count(book.recordCount)||book.recordCount===0)throw new Error("人员账套归属无效，请重新查询。");seen.add(book.bookId);records+=book.recordCount;}
    if(records!==item.recordCount)throw new Error("人员来源记录数量不一致，请重新查询。");
    if(item.historicalInsuranceSourceCount!==(item.historicalInsurancePeriodCount===1&&!item.historicalInsuranceNeedsReview?1:0))throw new Error("社保来源数量不一致，请重新查询。");
    employees.add(item.employeeId);
  }
}
export function attendancePreparationLabel(item:HrPayrollPreparationEmployee){return item.attendanceInputCount===0?"缺少本月已关账考勤":`有 ${item.attendanceInputCount} 份已关账考勤输入，需核对有效版本与明细`;}
export function insurancePreparationLabel(item:HrPayrollPreparationEmployee){
  const notes:string[]=[`历史社保 ${item.historicalInsurancePeriodCount} 期，可选 ${item.historicalInsuranceSourceCount} 份；现代社保可选 ${item.modernInsuranceSourceCount} 份`];
  if(item.historicalInsurancePeriodCount>1)notes.push("历史社保期间有歧义");
  if(item.historicalInsuranceNeedsReview)notes.push("历史社保来源待复核");
  if(item.modernInsuranceSourceCount>1)notes.push("现代社保来源有歧义");
  notes.push(item.historicalInsuranceSourceCount+item.modernInsuranceSourceCount>0?"有可选社保来源，需明确选择并核对金额":"缺少可选的本月社保来源");
  return notes.join("；");
}
export type PreparationExportRow=HrPayrollPreparationEmployee & {id:string;periodMonth:string;bookLabels:string};
export function preparationExportRows(data:HrPayrollPreparationCohort):PreparationExportRow[]{
  const books=new Map(data.books.map(book=>[book.bookId,book.bookName||`账套 ${book.legacyScheme}`]));
  return data.items.map(item=>({...item,id:item.employeeId,periodMonth:data.periodMonth.slice(0,7),bookLabels:item.books.map(book=>`${books.get(book.bookId)}：${book.recordCount} 条`).join("；")}));
}
export function preparationCohortCsv(rows:readonly PreparationExportRow[]):string {
  return csvDocument([["员工编号","姓名","月份","来源记录数","账套及记录数","已关账考勤份数","考勤准备说明","历史社保期间数","历史社保需复核","历史可选来源数","现代可选来源数","社保准备说明"],...rows.map(row=>[row.employeeCode,row.fullName,row.periodMonth,row.recordCount,row.bookLabels,row.attendanceInputCount,attendancePreparationLabel(row),row.historicalInsurancePeriodCount,row.historicalInsuranceNeedsReview?"是":"否",row.historicalInsuranceSourceCount,row.modernInsuranceSourceCount,insurancePreparationLabel(row)])]);
}
