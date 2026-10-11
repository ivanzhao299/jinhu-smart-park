import type {HrApprovedIntervalQuantities} from "../../../lib/hr-api";

export const MAX_ATTENDANCE_MONTH_MS=31*24*60*60*1000;
export type NormalizedIntervalQuantity={availability:"known";durationMs:number}|{availability:"unknown";durationMs:null};
export type NormalizedIntervalQuantities={overtime:NormalizedIntervalQuantity;businessTrip:NormalizedIntervalQuantity};

function object(value:unknown):Record<string,unknown>|null{return value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;}
function expectedShanghaiWindow(workDate:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(workDate))return null;const base=Date.parse(`${workDate}T00:00:00.000Z`);if(!Number.isFinite(base)||new Date(base).toISOString().slice(0,10)!==workDate)return null;const start=new Date(base-8*3600000);return [start.toISOString(),new Date(start.getTime()+86400000).toISOString()] as const;}
function normalizeOne(value:unknown,maxMs:number):NormalizedIntervalQuantity|null{
 const row=object(value);if(!row||!Array.isArray(row.sources)||!Array.isArray(row.unknownSources)||!(row.availability==="known"||row.availability==="unknown"))return null;
 if(row.availability==="unknown")return row.durationMs===null&&row.unknownSources.length>0?{availability:"unknown",durationMs:null}:null;
 if(typeof row.durationMs!=="number"||!Number.isSafeInteger(row.durationMs)||row.durationMs<0||row.durationMs>maxMs||row.unknownSources.length>0||row.durationMs===0&&row.sources.length>0||row.durationMs>0&&row.sources.length===0)return null;
 return {availability:"known",durationMs:row.durationMs};
}
export function normalizeDailyIntervalQuantities(value:unknown,workDate:string):NormalizedIntervalQuantities|null{
 const row=object(value),window=expectedShanghaiWindow(workDate);if(!row||!window||row.basis!=="shanghai-calendar-interval-v1"||row.windowStart!==window[0]||row.windowEnd!==window[1])return null;
 const overtime=normalizeOne(row.overtime,24*60*60*1000),businessTrip=normalizeOne(row.businessTrip,24*60*60*1000);return overtime&&businessTrip?{overtime,businessTrip}:null;
}
export function normalizeMonthlyIntervalQuantity(value:unknown):NormalizedIntervalQuantity|null{
 if(value===null)return {availability:"unknown",durationMs:null};
 if(typeof value!=="string"||!/^(0|[1-9]\d*)$/.test(value))return null;
 const ms=Number(value);return Number.isSafeInteger(ms)&&ms<=MAX_ATTENDANCE_MONTH_MS?{availability:"known",durationMs:ms}:null;
}
export function formatMonthlyIntervalQuantity(value:unknown){return value===undefined?"未提供":formatIntervalQuantity(normalizeMonthlyIntervalQuantity(value));}
export function formatBusinessTripDeclaredDays(value:unknown){if(value===undefined)return "未提供";if(value===null)return "待核对";if(typeof value!=="string"||!/^(0|[1-9]\d*)$/.test(value))return "数量待核对";return `${value} 天`;}
export function formatIntervalQuantity(value:NormalizedIntervalQuantity|null,missingLabel="未提供"){
 if(value===null)return "数量待核对";
 if(value.availability==="unknown")return "待核对";
 const ms=value.durationMs,hours=Math.floor(ms/3600000),minutes=Math.floor(ms%3600000/60000),seconds=Math.floor(ms%60000/1000),millis=ms%1000;
 if(ms===0)return "0 秒";
 const parts:string[]=[];if(hours)parts.push(`${hours} 小时`);if(minutes)parts.push(`${minutes} 分钟`);if(seconds||millis)parts.push(`${seconds}${millis?`.${String(millis).padStart(3,"0").replace(/0+$/g,"")}`:""} 秒`);return parts.join(" ")||missingLabel;
}
export function dailyQuantityForDisplay(value:unknown,workDate:string){if(value===undefined||value===null)return null as NormalizedIntervalQuantities|null;return normalizeDailyIntervalQuantities(value,workDate);}
export type DailyQuantityContract=HrApprovedIntervalQuantities;
