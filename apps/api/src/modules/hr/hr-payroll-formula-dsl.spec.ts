import assert from "node:assert/strict";
import test from "node:test";
import { assertAcyclicFormulaDependencies, assertFormulaEvaluationOrder, evaluatePayrollFormula, parsePayrollFormula } from "./hr-payroll-formula-dsl";

test("restricted payroll DSL parses allowlisted arithmetic, comparison and conditional",()=>{
 const parsed=parsePayrollFormula("[BASE] + ([DAYS] >= 20 ? 125.50 : -10)");
 assert.equal(parsed.status,"parsed");assert.deepEqual(parsed.dependencies,["payroll:BASE","payroll:DAYS"]);
 assert.equal(evaluatePayrollFormula(parsed.ast!,{"payroll:BASE":"1000.0000","payroll:DAYS":"20.0000"}),"1125.5000");
});
test("decimal evaluator rounds half away from zero without JavaScript number",()=>{
 const parsed=parsePayrollFormula("[A] / 3");
 assert.equal(evaluatePayrollFormula(parsed.ast!,{"payroll:A":"1.0000"}),"0.3333");
 const negative=parsePayrollFormula("-[A] / 6");
 assert.equal(evaluatePayrollFormula(negative.ast!,{"payroll:A":"1.0000"}),"-0.1667");
});
test("SQL, calls, properties, unknown tokens, excessive scale and division by zero fail closed",()=>{
 for(const expression of ["SELECT 1","round([A])","[A].constructor","a=1","1.00001","[A];DROP TABLE x"]){assert.equal(parsePayrollFormula(expression).status,"rejected",expression);}
 assert.equal(parsePayrollFormula("[人事系统.未登记字段]+1").status,"rejected");
 const divide=parsePayrollFormula("[A]/[B]");assert.throws(()=>evaluatePayrollFormula(divide.ast!,{"payroll:A":"1","payroll:B":"0"}),/division by zero/u);
 assert.throws(()=>evaluatePayrollFormula(divide.ast!,{"payroll:A":"1"}),/unknown reference/u);
 const literalOverflow=parsePayrollFormula("10000000000000000");
 assert.throws(()=>evaluatePayrollFormula(literalOverflow.ast!,{}),/decimal overflow/u);
 const inputOverflow=parsePayrollFormula("[A]");
 assert.throws(()=>evaluatePayrollFormula(inputOverflow.ast!,{"payroll:A":"10000000000000000.0000"}),/decimal overflow/u);
});
test("legacy cit and HR references require review and dependency cycles are rejected",()=>{
 assert.equal(parsePayrollFormula("[A]+1","legacy cit").status,"manual_review");
 assert.equal(parsePayrollFormula("[人事系统.基本工资]+1").status,"manual_review");
 assert.throws(()=>assertAcyclicFormulaDependencies([{itemCode:"A",dependencies:["payroll:B"]},{itemCode:"B",dependencies:["payroll:A"]}]),/cycle/u);
 assert.throws(()=>assertFormulaEvaluationOrder([{itemCode:"A",dependencies:["payroll:B"]},{itemCode:"B",dependencies:[]}]),/not available/u);
 assert.doesNotThrow(()=>assertFormulaEvaluationOrder([{itemCode:"B",dependencies:[]},{itemCode:"A",dependencies:["payroll:B"]}]));
});
