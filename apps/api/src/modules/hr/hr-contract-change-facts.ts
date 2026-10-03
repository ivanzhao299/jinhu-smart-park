import { BadRequestException } from "@nestjs/common";

export interface ModernContractChangeFacts {contractTermMonths?:number;signatureDate?:string;}

export function validateModernContractChangeFacts(input:{contractTermMonths?:unknown;signatureDate?:unknown}):ModernContractChangeFacts {
 const result:ModernContractChangeFacts={};
 if(input.contractTermMonths!==undefined){
  if(typeof input.contractTermMonths!=="number"||!Number.isInteger(input.contractTermMonths)||input.contractTermMonths<0||input.contractTermMonths>1200)throw new BadRequestException("Contract change term must be an explicit integer from 0 to 1200");
  result.contractTermMonths=input.contractTermMonths;
 }
 if(input.signatureDate!==undefined){
  const value=input.signatureDate;
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number(value.slice(0,4))===0)throw new BadRequestException("Contract change signature date must be an explicit valid date");
  const date=new Date(`${value}T00:00:00Z`);
  if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==value)throw new BadRequestException("Contract change signature date must be an explicit valid date");
  result.signatureDate=value;
 }
 return result;
}

export function readModernContractChangeFacts(snapshot:Record<string,unknown>):ModernContractChangeFacts {
 if(!Object.hasOwn(snapshot,"modernContractFacts"))return {};
 const value=snapshot.modernContractFacts;
 if(!value||typeof value!=="object"||Array.isArray(value)||Reflect.get(value,"version")!==1)throw new BadRequestException("Stored modern contract change facts are invalid");
 return validateModernContractChangeFacts({contractTermMonths:Reflect.get(value,"contractTermMonths"),signatureDate:Reflect.get(value,"signatureDate")});
}

export function nextContractSegmentTerm(current:{startDate:string|null;endDate:string|null;contractTermMonths:number|null},next:{changeType:string;newStartDate:string;newEndDate:string|null},facts:ModernContractChangeFacts){
 if(facts.contractTermMonths!==undefined)return facts.contractTermMonths;
 return next.changeType!=="renewal"&&current.startDate===next.newStartDate&&current.endDate===next.newEndDate?current.contractTermMonths:null;
}
