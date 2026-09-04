import { BadRequestException } from "@nestjs/common";

const SCALE=10000n;
const MAX=99999999999999999999n;
const fail=(message:string):never=>{throw new BadRequestException(`PAYROLL_FORMULA_UNSAFE: ${message}`);};
const checked=(value:bigint)=>{if(value>MAX||value< -MAX)fail("decimal overflow");return value;};
const scaled=(value:string)=>{
 if(!/^-?\d+(?:\.\d{1,4})?$/u.test(value))fail("invalid decimal input");
 const negative=value.startsWith("-");
 const [whole,fraction=""]=(negative?value.slice(1):value).split(".");
 const result=BigInt(whole!)*SCALE+BigInt(fraction.padEnd(4,"0"));
 return checked(negative?-result:result);
};
const formatted=(value:bigint)=>{
 const negative=value<0n,absolute=negative?-value:value;
 return `${negative?"-":""}${absolute/SCALE}.${(absolute%SCALE).toString().padStart(4,"0")}`;
};
const roundDivide=(numerator:bigint,denominator:bigint)=>{
 if(denominator===0n)fail("division by zero");
 const negative=(numerator<0n)!==(denominator<0n),n=numerator<0n?-numerator:numerator,d=denominator<0n?-denominator:denominator,q=n/d,r=n%d;
 return negative?-(r*2n>=d?q+1n:q):(r*2n>=d?q+1n:q);
};

/**
 * Isolated u_inputjobpay candidate adapter. It never executes the legacy
 * dynamic SQL and does not assert that person._base2 is person.jobpay.
 */
export function projectLegacyPersonJobPayInput(value:string|null|undefined):string|null{
 return value==null?null:formatted(scaled(value));
}
export function projectLegacyPersonJobPayPeriodInput(input:{value:string|null|undefined;rowYear:number;rowMonth:number;targetYear:number;targetMonth:number}):{matchesPeriod:boolean;value:string|null}{
 for(const [name,value] of Object.entries({rowYear:input.rowYear,targetYear:input.targetYear}))if(!Number.isSafeInteger(value))fail(`${name} is invalid`);
 for(const [name,value] of Object.entries({rowMonth:input.rowMonth,targetMonth:input.targetMonth}))if(!Number.isSafeInteger(value)||value<1||value>12)fail(`${name} is invalid`);
 const matchesPeriod=input.rowYear===input.targetYear&&input.rowMonth===input.targetMonth;
 return {matchesPeriod,value:matchesPeriod?projectLegacyPersonJobPayInput(input.value):null};
}

export function divideLegacyPersonJobPayCandidate(value:string,divisor:number):string{
 if(!Number.isSafeInteger(divisor))fail("divisor is invalid");
 return formatted(checked(roundDivide(scaled(value),BigInt(divisor))));
}
