export interface ContractSuccessorCandidate {
 id:string;
 status:string;
 isHistoricalImport:boolean;
 endDate:string|null;
}

/** Historical status remains a source fact; only an explicitly ended term can precede online work. */
export function historicalContractPredecessors(rows:ContractSuccessorCandidate[],startDate:string|null,today:string):string[]|null {
 const validDate=(value:string|null):value is string=>!!value&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
 const predecessors:string[]=[];
 for(const row of rows){
  if(row.status!=="draft"&&row.status!=="active")continue;
  if(!row.isHistoricalImport||row.status!=="active"||!validDate(row.endDate)||!validDate(startDate)||!validDate(today)||row.endDate>=today||row.endDate>=startDate)return null;
  predecessors.push(row.id);
 }
 return predecessors.sort();
}
