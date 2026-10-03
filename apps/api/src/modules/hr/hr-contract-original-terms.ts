export type OriginalContractYearFact = { value: number | null; status: "recorded" | "missing" | "unconfirmed" };

function yearFact(value: unknown): OriginalContractYearFact {
 if(value===null||value===undefined||value==="")return {value:null,status:"missing"};
 const parsed=typeof value==="number"?value:typeof value==="string"&&/^\d+$/.test(value)?Number(value):NaN;
 return Number.isInteger(parsed)&&parsed>=0&&parsed<=2147483647
  ?{value:parsed,status:"recorded"}:{value:null,status:"unconfirmed"};
}

/** Source catalogue declares years. Preserve source facts separately from modern months. */
export function projectHistoricalContractTerms(historical:boolean,snapshot:Record<string,unknown>){
 if(!historical||!["unconfirmedTerm","unconfirmedTotalTerm","unconfirmedRenewalYears"].some(key=>Object.hasOwn(snapshot,key)))return {};
 return {originalTermYears:{initial:yearFact(snapshot.unconfirmedTerm),total:yearFact(snapshot.unconfirmedTotalTerm),renewal:yearFact(snapshot.unconfirmedRenewalYears)}};
}
