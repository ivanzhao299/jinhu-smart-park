// Pure shared owner extracted from the legacy staging transformer; no I/O.
export const T2_CONTRACT_SEMANTIC_FIELDS = Object.freeze([
  "derivedContractTermMonths", "legacyRenewalCount", "contractTermDecision",
  "signatureDateDecision", "renewalCountDecision",
]);
const isoDate=value=>{
  const text=String(value??"").trim();
  if(!text)return null;
  const parsed=new Date(`${text}T00:00:00Z`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==text)throw Error(`dbo.compact invalid ISO date`);
  return text;
};
const nonNegativeInteger=(value,label)=>{
  const text=String(value??"").trim();
  if(!text)return null;
  if(!/^\d+$/.test(text))throw Error(`dbo.compact invalid ${label}`);
  const parsed=Number(text);
  if(!Number.isSafeInteger(parsed))throw Error(`dbo.compact invalid ${label}`);
  return parsed;
};
const inclusiveMonths=(startDate,endDate)=>{
  if(!startDate||!endDate)return null;
  const start=new Date(`${startDate}T00:00:00Z`),end=new Date(`${endDate}T00:00:00Z`);
  if(end<start)throw Error("dbo.compact invalid contract date range");
  const months=(end.getUTCFullYear()-start.getUTCFullYear())*12+end.getUTCMonth()-start.getUTCMonth()+(end.getUTCDate()>=start.getUTCDate()?1:0);
  return months;
};
export const materializeContractSemantics=source=>{
  const startDate=isoDate(source.startDate),endDate=isoDate(source.endDate),signedDate=isoDate(source.signedDate);
  const derivedContractTermMonths=inclusiveMonths(startDate,endDate),legacyRenewalCount=nonNegativeInteger(source.continuetimes,"continuetimes");
  return {...source,derivedContractTermMonths,legacyRenewalCount,contractTermDecision:derivedContractTermMonths===null?"NO_FIXED_DATE_BOUNDARY":"DERIVED_FROM_DATE_BOUNDARY",signatureDateDecision:signedDate===null?"ABSENT":"DIRECT_LEGACY_DATE",renewalCountDecision:legacyRenewalCount===null?"ABSENT_DEFAULT_ZERO":"DIRECT_NONNEGATIVE_LEGACY_COUNT"};
};
