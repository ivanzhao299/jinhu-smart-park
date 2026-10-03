export type HrEmploymentDateFactStatus="recorded"|"planned"|"multiple"|"none"|"unclassified";

export interface HrEmployeeEmploymentDateDetails {
  unclassifiedRecordedDate:{date:string|null;status:"unclassified"|"missing"};
  plannedConfirmation:{dates:string[];status:HrEmploymentDateFactStatus};
  confirmedEmployment:{dates:string[];status:HrEmploymentDateFactStatus};
}

const datePattern=/^\d{4}-\d{2}-\d{2}$/u;

function normalizedDate(value:unknown):string|null {
  if(typeof value!=="string"||!datePattern.test(value))return null;
  const year=Number(value.slice(0,4)),month=Number(value.slice(5,7)),day=Number(value.slice(8,10));
  if(year<1000)return null;
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?value:null;
}

/**
 * Carries the legacy-compatible aggregate only as explicitly unclassified. The
 * planned and confirmed facts come only from the modern probation workflow and
 * effective modern employment events; callers must not infer a meaning from the
 * aggregate or from matching date values.
 */
export function projectHrEmployeeEmploymentDates(input:{recordedDate:unknown;plannedConfirmationDates:unknown[];confirmedEmploymentDates:unknown[]}):HrEmployeeEmploymentDateDetails {
  const planned=input.plannedConfirmationDates.map(normalizedDate);
  const confirmed=input.confirmedEmploymentDates.map(normalizedDate);
  const recordedDate=normalizedDate(input.recordedDate);
  const recordedMissing=input.recordedDate===null||input.recordedDate===undefined;
  const plannedInvalid=planned.some(date=>date===null),confirmedInvalid=confirmed.some(date=>date===null);
  const plannedDates=planned.filter((date):date is string=>date!==null).sort();
  const confirmedDates=confirmed.filter((date):date is string=>date!==null).sort();
  return {
    unclassifiedRecordedDate:{date:recordedDate,status:recordedMissing?"missing":"unclassified"},
    plannedConfirmation:plannedInvalid?{dates:plannedDates,status:"unclassified"}:plannedDates.length===1?{dates:plannedDates,status:"planned"}:plannedDates.length===0?{dates:[],status:"none"}:{dates:plannedDates,status:"multiple"},
    confirmedEmployment:confirmedInvalid?{dates:confirmedDates,status:"unclassified"}:confirmedDates.length===1?{dates:confirmedDates,status:"recorded"}:confirmedDates.length===0?{dates:[],status:"none"}: {dates:confirmedDates,status:"multiple"},
  };
}
