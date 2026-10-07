export interface ContractSuccessorCandidate {
 id:string;
 status:string;
 isHistoricalImport:boolean;
 endDate:string|null;
}

export function isValidContractCalendarDate(value:unknown):value is string {
 return typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
}

/** Only an explicitly ended term can precede another contract; provenance does not change the rule. */
export function historicalContractPredecessors(rows:ContractSuccessorCandidate[],startDate:string|null,today:string):string[]|null {
 const predecessors:string[]=[];
 for(const row of rows){
  if(row.status!=="draft"&&row.status!=="active")continue;
  if(row.status!=="active"||!isValidContractCalendarDate(row.endDate)||!isValidContractCalendarDate(startDate)||!isValidContractCalendarDate(today)||row.endDate>=today||row.endDate>=startDate)return null;
  predecessors.push(row.id);
 }
 return predecessors.sort();
}
