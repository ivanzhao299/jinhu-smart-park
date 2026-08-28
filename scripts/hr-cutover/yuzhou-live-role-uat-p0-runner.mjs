/* global fetch */
import { createHash, randomUUID } from "node:crypto";
import { validateYuzhouLiveRoleUatP0Matrix } from "./yuzhou-live-role-uat-p0-matrix-lib.mjs";

const fail=(code,detail)=>{const error=new Error(`${code}: ${detail}`);error.code=code;throw error;};
const statusByOutcome={success:new Set([200,201,204]),forbidden:new Set([403]),not_found_or_forbidden:new Set([403,404]),server_failure:new Set([500,503])};
const sha256=value=>createHash("sha256").update(value).digest("hex");
const sensitiveHeaders=["content-disposition","content-length","content-type"];
const routeFor=(template,substitutions)=>template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/gu,(_match,key)=>{
  const value=substitutions?.[key]; if(typeof value!=="string"||!/^[0-9a-f-]{36}$/iu.test(value))fail("YUZHOU_UAT_P0_SUBSTITUTION_INVALID",key); return value;
});

export class YuzhouLiveRoleUatP0Runner {
  constructor({apiBase,tokens,matrix,request=fetch}){
    validateYuzhouLiveRoleUatP0Matrix(matrix);
    const url=new URL(apiBase); if(url.protocol!=="http:"||!["127.0.0.1","localhost","[::1]","::1"].includes(url.hostname)||url.pathname!=="/api/v1")fail("YUZHOU_UAT_P0_BASE_UNSAFE","loopback /api/v1 required");
    if(Object.keys(tokens??{}).sort().join(",")!=="employee,hr_reviewer,manager"||Object.values(tokens).some(x=>typeof x!=="string"||x.length<16))fail("YUZHOU_UAT_P0_ACTORS_INVALID","three role tokens required");
    this.apiBase=url.toString().replace(/\/$/u,"");this.tokens={...tokens};this.matrix=matrix;this.request=request;
  }
  async execute({id,substitutions={},body,assert}){
    const check=this.matrix.checks.find(x=>x.id===id); if(!check)fail("YUZHOU_UAT_P0_CHECK_UNKNOWN",id); if(typeof assert!=="function")fail("YUZHOU_UAT_P0_ASSERTION_INVALID",id);
    const route=routeFor(check.route,substitutions),headers={authorization:`Bearer ${this.tokens[check.actor]}`,"x-request-id":randomUUID()};
    if(body!==undefined){headers["content-type"]="application/json";headers["x-idempotency-key"]=`p0-${sha256(id).slice(0,24)}`;}
    const response=await this.request(`${this.apiBase}${route}`,{method:check.method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(!statusByOutcome[check.outcome].has(response.status))fail("YUZHOU_UAT_P0_STATUS_MISMATCH",`${id}:${response.status}`);
    let observed;
    if(check.responseKind==="binary"){
      const bytes=new Uint8Array(await response.arrayBuffer());
      observed={status:response.status,byteLength:bytes.byteLength,sensitiveHeaders:Object.fromEntries(sensitiveHeaders.filter(name=>response.headers.has(name)).map(name=>[name,response.headers.get(name)]))};
    }else{
      let payload=null;try{payload=await response.json();}catch{/* failed/empty JSON response remains value-free */}
      observed={status:response.status,payload};
    }
    const assertions=await assert(observed);
    if(!assertions||JSON.stringify(Object.keys(assertions))!==JSON.stringify(check.assertions)||Object.values(assertions).some(value=>value!==true))fail("YUZHOU_UAT_P0_ASSERTION_FAILED",id);
    return {id,actor:check.actor,statusCode:response.status,responseKind:check.responseKind,responseSha256:sha256(JSON.stringify(check.responseKind==="binary"?{byteLength:observed.byteLength,headerNames:Object.keys(observed.sensitiveHeaders)}:{payloadType:Array.isArray(observed.payload)?"array":typeof observed.payload})),assertions:Object.fromEntries(check.assertions.map(key=>[key,true]))};
  }
}
