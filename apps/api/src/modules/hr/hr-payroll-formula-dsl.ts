import { BadRequestException } from "@nestjs/common";
import { createHash } from "node:crypto";

export const HR_PAYROLL_DSL_PARSER_VERSION="jinhu-payroll-dsl-v1";
export const HR_PAYROLL_DSL_ENGINE_VERSION="jinhu-payroll-decimal-v1";
const SCALE=10000n,MAX=99999999999999999999n;
const LIMITS={expression:2000,tokens:256,depth:24,dependencies:64};
const FORBIDDEN=/\b(?:select|insert|update|delete|drop|alter|create|exec|execute|union|from|where|while|for|function|return|prototype|constructor|__proto__)\b|--|\/\*|\*\/|;|:=|=>|\$\{|,/iu;
const HR_REFERENCE_CODES=new Set(["基本工资","津贴","浮动目标","工作分钟","迟到分钟","早退分钟","缺勤天数","缺卡天数"]);

export type PayrollAst=
 |{type:"decimal";value:string}
 |{type:"reference";code:string;domain:"payroll"|"hr"}
 |{type:"unary";operator:"+"|"-";operand:PayrollAst}
 |{type:"binary";operator:"+"|"-"|"*"|"/"|"=="|"!="|"<"|"<="|">"|">=";left:PayrollAst;right:PayrollAst}
 |{type:"conditional";condition:PayrollAst;whenTrue:PayrollAst;whenFalse:PayrollAst};
type Token={kind:"number"|"reference"|"operator"|"lparen"|"rparen"|"question"|"colon"|"eof";value:string;position:number};
export type PayrollFormulaParseResult={status:"parsed"|"manual_review"|"rejected";parserVersion:string;ast:PayrollAst|null;dependencies:string[];requiresManualReview:boolean;reason:string|null;astHash:string|null};

function fail(message:string):never{throw new BadRequestException(`PAYROLL_FORMULA_UNSAFE: ${message}`);}
function lex(expression:string):Token[]{
 if(!expression.trim())fail("expression is empty");if(expression.length>LIMITS.expression)fail("expression length limit exceeded");if(FORBIDDEN.test(expression))fail("forbidden token");
 const out:Token[]=[];let i=0;
 const push=(kind:Token["kind"],value:string,position:number)=>{out.push({kind,value,position});if(out.length>LIMITS.tokens)fail("token limit exceeded");};
 while(i<expression.length){const c=expression[i]!;if(/\s/u.test(c)){i++;continue;}const start=i;
  if(/[0-9]/u.test(c)){i++;while(i<expression.length&&/[0-9]/u.test(expression[i]!))i++;if(expression[i]==="."){i++;const decimalStart=i;while(i<expression.length&&/[0-9]/u.test(expression[i]!))i++;if(decimalStart===i)fail("invalid decimal");}push("number",expression.slice(start,i),start);continue;}
  if(c==="["){const end=expression.indexOf("]",i+1);if(end<0)fail("unterminated reference");const value=expression.slice(i+1,end).trim(),valid=/^[\p{L}\p{N}_ -]{1,96}$/u.test(value)||/^人事系统\.[\p{L}\p{N}_ -]{1,80}$/u.test(value);if(!valid)fail("invalid reference");push("reference",value,start);i=end+1;continue;}
  const pair=expression.slice(i,i+2);if(["==","!=","<=",">="].includes(pair)){push("operator",pair,start);i+=2;continue;}
  const map:Record<string,Token["kind"]>={"+":"operator","-":"operator","*":"operator","/":"operator","<":"operator",">":"operator","(":"lparen",")":"rparen","?":"question",":":"colon"};
  const kind=map[c];if(!kind)fail(`unknown token at ${start}`);push(kind,c,start);i++;
 }
 out.push({kind:"eof",value:"",position:i});return out;
}

class Parser{private index=0;constructor(private readonly tokens:Token[]){}private peek(){return this.tokens[this.index]!;}private take(){return this.tokens[this.index++]!;}private match(kind:Token["kind"],value?:string){const t=this.peek();if(t.kind===kind&&(value===undefined||t.value===value)){this.index++;return true;}return false;}
 parse(){const ast=this.conditional(1);if(this.peek().kind!=="eof")fail(`unexpected token at ${this.peek().position}`);return ast;}
 private depth(depth:number){if(depth>LIMITS.depth)fail("AST depth limit exceeded");}
 private conditional(d:number):PayrollAst{this.depth(d);const condition=this.comparison(d+1);if(!this.match("question"))return condition;const whenTrue=this.conditional(d+1);if(!this.match("colon"))fail("conditional is missing colon");return{type:"conditional",condition,whenTrue,whenFalse:this.conditional(d+1)};}
 private comparison(d:number):PayrollAst{let left=this.add(d+1);while(this.peek().kind==="operator"&&["==","!=","<","<=",">",">="].includes(this.peek().value)){const operator=this.take().value as "==";left={type:"binary",operator,left,right:this.add(d+1)};}return left;}
 private add(d:number):PayrollAst{let left=this.multiply(d+1);while(this.peek().kind==="operator"&&["+","-"].includes(this.peek().value)){const operator=this.take().value as "+";left={type:"binary",operator,left,right:this.multiply(d+1)};}return left;}
 private multiply(d:number):PayrollAst{let left=this.unary(d+1);while(this.peek().kind==="operator"&&["*","/"].includes(this.peek().value)){const operator=this.take().value as "*";left={type:"binary",operator,left,right:this.unary(d+1)};}return left;}
 private unary(d:number):PayrollAst{this.depth(d);if(this.peek().kind==="operator"&&["+","-"].includes(this.peek().value)){const operator=this.take().value as "+"|"-";return{type:"unary",operator,operand:this.unary(d+1)};}return this.primary(d+1);}
 private primary(d:number):PayrollAst{this.depth(d);const t=this.take();if(t.kind==="number")return{type:"decimal",value:canonicalDecimal(t.value)};if(t.kind==="reference"){const hr=t.value.startsWith("人事系统."),code=hr?t.value.slice(5):t.value;if(hr&&!HR_REFERENCE_CODES.has(code))fail("unknown HR reference");return{type:"reference",domain:hr?"hr":"payroll",code};}if(t.kind==="lparen"){const ast=this.conditional(d+1);if(!this.match("rparen"))fail("unclosed parenthesis");return ast;}fail(`expected value at ${t.position}`);}
}
function canonicalDecimal(value:string){const match=value.match(/^(\d+)(?:\.(\d+))?$/u);if(!match)fail("invalid decimal");const fraction=(match[2]??"");if(fraction.length>4)fail("decimal scale exceeds four");return `${BigInt(match[1]!).toString()}.${fraction.padEnd(4,"0")}`;}
function dependencies(ast:PayrollAst,result=new Set<string>()):Set<string>{if(ast.type==="reference")result.add(`${ast.domain}:${ast.code}`);else if(ast.type==="unary")dependencies(ast.operand,result);else if(ast.type==="binary"){dependencies(ast.left,result);dependencies(ast.right,result);}else if(ast.type==="conditional"){dependencies(ast.condition,result);dependencies(ast.whenTrue,result);dependencies(ast.whenFalse,result);}return result;}
export function parsePayrollFormula(expression:string,condition?:string|null):PayrollFormulaParseResult{try{const ast=new Parser(lex(expression)).parse(),deps=[...dependencies(ast)].sort();if(deps.length>LIMITS.dependencies)fail("dependency limit exceeded");const manual=Boolean(condition?.trim())||deps.some(x=>x.startsWith("hr:"));const canonical=JSON.stringify(ast);return{status:manual?"manual_review":"parsed",parserVersion:HR_PAYROLL_DSL_PARSER_VERSION,ast,dependencies:deps,requiresManualReview:manual,reason:manual?(condition?.trim()?"legacy condition requires manual review":"cross-domain HR reference requires manual review"):null,astHash:createHash("sha256").update(canonical).digest("hex")};}catch(error){return{status:"rejected",parserVersion:HR_PAYROLL_DSL_PARSER_VERSION,ast:null,dependencies:[],requiresManualReview:true,reason:error instanceof Error?error.message:"unsafe formula",astHash:null};}}
export function assertAcyclicFormulaDependencies(formulas:Array<{itemCode:string;dependencies:string[]}>){const graph=new Map(formulas.map(f=>[f.itemCode,f.dependencies.filter(x=>x.startsWith("payroll:")).map(x=>x.slice(8))]));const visiting=new Set<string>(),done=new Set<string>();const visit=(code:string)=>{if(visiting.has(code))fail("formula dependency cycle");if(done.has(code))return;visiting.add(code);for(const next of graph.get(code)??[])if(graph.has(next))visit(next);visiting.delete(code);done.add(code);};for(const code of graph.keys())visit(code);}
export function assertFormulaEvaluationOrder(formulas:Array<{itemCode:string;dependencies:string[]}>){const produced=new Set(formulas.map(formula=>formula.itemCode)),available=new Set<string>();for(const formula of formulas){for(const dependency of formula.dependencies){if(!dependency.startsWith("payroll:"))continue;const code=dependency.slice(8);if(produced.has(code)&&!available.has(code))fail(`formula dependency ${code} is not available before ${formula.itemCode}`);}available.add(formula.itemCode);}}
function scaled(value:string):bigint{if(!/^-?\d+(?:\.\d{1,4})?$/u.test(value))fail("invalid decimal input");const negative=value.startsWith("-");const [whole,fraction=""]=(negative?value.slice(1):value).split(".");const result=BigInt(whole!)*SCALE+BigInt(fraction.padEnd(4,"0"));return negative?-result:result;}
function checked(value:bigint){if(value>MAX||value< -MAX)fail("decimal overflow");return value;}
function roundDivide(numerator:bigint,denominator:bigint){if(denominator===0n)fail("division by zero");const negative=(numerator<0n)!==(denominator<0n),n=numerator<0n?-numerator:numerator,d=denominator<0n?-denominator:denominator,q=n/d,r=n%d,rounded=r*2n>=d?q+1n:q;return negative?-rounded:rounded;}
export function formatPayrollDecimal(value:bigint){const negative=value<0n,absolute=negative?-value:value;return `${negative?"-":""}${absolute/SCALE}.${(absolute%SCALE).toString().padStart(4,"0")}`;}
/**
 * Canonicalizes the legacy u_inputbasepay value without executing its dynamic
 * table/column update. A missing legacy person/value remains null; callers must
 * review or reject it instead of silently substituting zero.
 */
export function projectLegacyPersonBasePayInput(value:string|null|undefined):string|null{
 if(value==null)return null;
 return formatPayrollDecimal(checked(scaled(value)));
}
export function projectLegacyPersonBasePayPeriodInput(input:{value:string|null|undefined;rowYear:number;rowMonth:number;targetYear:number;targetMonth:number}):{matchesPeriod:boolean;value:string|null}{
 for(const [name,value] of Object.entries({rowYear:input.rowYear,targetYear:input.targetYear}))if(!Number.isSafeInteger(value))fail(`${name} is invalid`);
 for(const [name,value] of Object.entries({rowMonth:input.rowMonth,targetMonth:input.targetMonth}))if(!Number.isSafeInteger(value)||value<1||value>12)fail(`${name} is invalid`);
 const matchesPeriod=input.rowYear===input.targetYear&&input.rowMonth===input.targetMonth;
 return {matchesPeriod,value:matchesPeriod?projectLegacyPersonBasePayInput(input.value):null};
}
export function evaluatePayrollFormula(ast:PayrollAst,inputs:Readonly<Record<string,string>>):string{let budget=512;const run=(node:PayrollAst):bigint=>{if(--budget<0)fail("evaluation resource limit exceeded");if(node.type==="decimal")return checked(scaled(node.value));if(node.type==="reference"){const value=inputs[`${node.domain}:${node.code}`];if(value===undefined)fail(`unknown reference ${node.domain}:${node.code}`);return checked(scaled(value));}if(node.type==="unary"){const value=run(node.operand);return node.operator==="-"?checked(-value):value;}if(node.type==="conditional")return run(node.condition)!==0n?run(node.whenTrue):run(node.whenFalse);const left=run(node.left),right=run(node.right);if(["==","!=","<","<=",">",">="].includes(node.operator)){const ok=node.operator==="=="?left===right:node.operator==="!="?left!==right:node.operator==="<"?left<right:node.operator==="<="?left<=right:node.operator===">"?left>right:left>=right;return ok?SCALE:0n;}if(node.operator==="+")return checked(left+right);if(node.operator==="-")return checked(left-right);if(node.operator==="*")return checked(roundDivide(left*right,SCALE));return checked(roundDivide(left*SCALE,right));};return formatPayrollDecimal(run(ast));}
