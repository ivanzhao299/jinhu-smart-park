/* global fetch */
import { createHash, randomUUID } from "node:crypto";
import { validateYuzhouLiveRoleUatP0Matrix } from "./yuzhou-live-role-uat-p0-matrix-lib.mjs";

const fail=(code,detail)=>{const error=new Error(`${code}: ${detail}`);error.code=code;throw error;};
const statusByOutcome={success:new Set([200,201,204]),forbidden:new Set([403]),not_found_or_forbidden:new Set([403,404]),server_failure:new Set([500,503])};
const sha256=value=>createHash("sha256").update(value).digest("hex");
const downloadHeaders=["content-disposition","accept-ranges","content-range"];
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const forbiddenNegativeKey=/(?:salary|amount|employee_?name|full_?name|mobile|id_?card|storage_?path|original_?name|file_?url|compensation_?snapshot)/iu;
const routeFor=(template,substitutions)=>template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/gu,(_match,key)=>{
  const value=substitutions?.[key]; if(typeof value!=="string"||!uuidPattern.test(value))fail("YUZHOU_UAT_P0_SUBSTITUTION_INVALID",key); return value;
});
const containsForbiddenKey=value=>{
  if(!value||typeof value!=="object")return false;
  if(Array.isArray(value))return value.some(containsForbiddenKey);
  return Object.entries(value).some(([key,nested])=>forbiddenNegativeKey.test(key)||containsForbiddenKey(nested));
};

export class YuzhouLiveRoleUatP0Runner {
  constructor({apiBase,tokens,matrix,request=fetch}){
    validateYuzhouLiveRoleUatP0Matrix(matrix);
    const url=new URL(apiBase); if(url.protocol!=="http:"||!["127.0.0.1","localhost","[::1]","::1"].includes(url.hostname)||url.pathname!=="/api/v1")fail("YUZHOU_UAT_P0_BASE_UNSAFE","loopback /api/v1 required");
    if(Object.keys(tokens??{}).sort().join(",")!=="employee,hr_reviewer,manager"||Object.values(tokens).some(x=>typeof x!=="string"||x.length<16))fail("YUZHOU_UAT_P0_ACTORS_INVALID","three role tokens required");
    this.apiBase=url.toString().replace(/\/$/u,"");this.tokens={...tokens};this.matrix=matrix;this.request=request;this.requestCount=0;
  }
  async execute({id,substitutions={},body,assert}){
    const check=this.matrix.checks.find(x=>x.id===id); if(!check)fail("YUZHOU_UAT_P0_CHECK_UNKNOWN",id); if(typeof assert!=="function")fail("YUZHOU_UAT_P0_ASSERTION_INVALID",id);
    const route=routeFor(check.route,substitutions),headers={authorization:`Bearer ${this.tokens[check.actor]}`,"x-request-id":randomUUID()};
    if(body!==undefined){headers["content-type"]="application/json";headers["x-idempotency-key"]=`p0-${sha256(id).slice(0,24)}`;}
    this.requestCount+=1;
    const response=await this.request(`${this.apiBase}${route}`,{method:check.method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(!statusByOutcome[check.outcome].has(response.status))fail("YUZHOU_UAT_P0_STATUS_MISMATCH",`${id}:${response.status}`);
    const responseBytes=new Uint8Array(await response.arrayBuffer()),responseSha256=sha256(responseBytes);
    let observed;
    if(check.responseKind==="binary"){
      const contentType=response.headers.get("content-type")??"";
      const errorEnvelope=check.outcome!=="success"&&contentType.toLowerCase().includes("application/json");
      if(errorEnvelope){
        let payload=null;try{payload=JSON.parse(new TextDecoder().decode(responseBytes));}catch{fail("YUZHOU_UAT_P0_BINARY_FAILURE_INVALID","non-JSON error envelope");}
        const raw=new TextDecoder().decode(responseBytes);
        if(containsForbiddenKey(payload)||Object.values(substitutions).some(value=>raw.includes(value)))fail("YUZHOU_UAT_P0_BINARY_FAILURE_SENSITIVE_LEAK",id);
      }
      observed={status:response.status,byteLength:errorEnvelope?0:responseBytes.byteLength,errorEnvelopeByteLength:errorEnvelope?responseBytes.byteLength:0,sensitiveHeaders:Object.fromEntries(downloadHeaders.filter(name=>response.headers.has(name)).map(name=>[name,response.headers.get(name)]))};
      if(check.outcome!=="success"&&(observed.byteLength!==0||Object.keys(observed.sensitiveHeaders).length!==0))fail("YUZHOU_UAT_P0_BINARY_FAILURE_LEAK",id);
      if(check.outcome==="success"){
        const disposition=response.headers.get("content-disposition")??"";
        if(observed.byteLength===0||contentType.toLowerCase().includes("application/json")||!disposition||/[\r\n]/u.test(disposition))fail("YUZHOU_UAT_P0_BINARY_SUCCESS_INVALID",id);
      }
    }else{
      let payload=null;try{payload=JSON.parse(new TextDecoder().decode(responseBytes));}catch{/* failed/empty JSON response remains value-free */}
      observed={status:response.status,payload};
      if(check.outcome==="success"&&(payload===null||(typeof payload==="object"&&Number(payload?.statusCode)>=400)))fail("YUZHOU_UAT_P0_JSON_SUCCESS_INVALID",id);
      if(check.outcome!=="success"){
        if(containsForbiddenKey(payload))fail("YUZHOU_UAT_P0_JSON_FAILURE_SENSITIVE_LEAK",id);
        const raw=new TextDecoder().decode(responseBytes);
        if(Object.values(substitutions).some(value=>raw.includes(value)))fail("YUZHOU_UAT_P0_JSON_FAILURE_TARGET_DISCLOSURE",id);
      }
    }
    const support=[];
    for(const item of check.supportRoutes??[]){
      this.requestCount+=1;
      const supportRoute=routeFor(item.route,substitutions),supportResponse=await this.request(`${this.apiBase}${supportRoute}`,{method:item.method,headers:{authorization:`Bearer ${this.tokens[check.actor]}`,"x-request-id":randomUUID()}});
      if(!statusByOutcome[item.outcome].has(supportResponse.status))fail("YUZHOU_UAT_P0_SUPPORT_STATUS_MISMATCH",`${id}:${supportResponse.status}`);
      const bytes=new Uint8Array(await supportResponse.arrayBuffer());let payload=null;try{payload=JSON.parse(new TextDecoder().decode(bytes));}catch{/* hash-only failed response */}
      if(item.outcome==="success"&&(payload===null||(typeof payload==="object"&&Number(payload?.statusCode)>=400)))fail("YUZHOU_UAT_P0_SUPPORT_SUCCESS_INVALID",id);
      if(item.outcome!=="success"&&(containsForbiddenKey(payload)||Object.values(substitutions).some(value=>new TextDecoder().decode(bytes).includes(value))))fail("YUZHOU_UAT_P0_SUPPORT_SENSITIVE_LEAK",id);
      support.push({status:supportResponse.status,payload,responseSha256:sha256(bytes),responseByteLength:bytes.byteLength});
    }
    observed.support=support;
    const assertions=await assert(observed);
    if(!assertions||JSON.stringify(Object.keys(assertions))!==JSON.stringify(check.assertions)||Object.values(assertions).some(value=>value!==true))fail("YUZHOU_UAT_P0_ASSERTION_FAILED",id);
    return {id,actor:check.actor,statusCode:response.status,responseKind:check.responseKind,responseSha256:sha256(JSON.stringify([responseSha256,...support.map(row=>row.responseSha256)])),responseByteLength:responseBytes.byteLength+support.reduce((sum,row)=>sum+row.responseByteLength,0),supportResponses:support.length,assertions:Object.fromEntries(check.assertions.map(key=>[key,true]))};
  }
}
