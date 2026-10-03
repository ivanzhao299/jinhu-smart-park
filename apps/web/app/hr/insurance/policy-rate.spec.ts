import assert from "node:assert/strict";
import test from "node:test";
import { insurancePercentFromRate,insuranceRateFromPercent } from "./policy-rate";
test("insurance percentage transport remains exact through maximum storage bounds",()=>{
  for(const [percentage,rate] of [["8","0.080000"],["0.0001","0.000001"],["12.3456","0.123456"],["99999999999999.9999","999999999999.999999"]]){
    assert.equal(insuranceRateFromPercent(percentage!),rate);assert.equal(insuranceRateFromPercent(insurancePercentFromRate(rate!)!),rate);
  }
  for(const value of ["","-1","8e-2","1.00001","100000000000000.0000"])assert.equal(insuranceRateFromPercent(value),null);
  assert.equal(insurancePercentFromRate("0.1234567"),null);
});
