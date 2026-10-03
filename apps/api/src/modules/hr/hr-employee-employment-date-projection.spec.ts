import assert from "node:assert/strict";
import test from "node:test";
import { projectHrEmployeeEmploymentDates } from "./hr-employee-employment-date-projection";

test("modern employment date projection preserves the unclassified aggregate alongside planned and effective confirmation semantics",()=>{
 assert.deepEqual(projectHrEmployeeEmploymentDates({recordedDate:"2026-10-30",plannedConfirmationDates:["2026-10-30"],confirmedEmploymentDates:["2026-10-30"]}),{
  unclassifiedRecordedDate:{date:"2026-10-30",status:"unclassified"},plannedConfirmation:{dates:["2026-10-30"],status:"planned"},confirmedEmployment:{dates:["2026-10-30"],status:"recorded"},
 });
});

test("modern employment date projection does not infer dates and exposes multiple or malformed facts",()=>{
 assert.deepEqual(projectHrEmployeeEmploymentDates({recordedDate:null,plannedConfirmationDates:[],confirmedEmploymentDates:[]}),{
  unclassifiedRecordedDate:{date:null,status:"missing"},plannedConfirmation:{dates:[],status:"none"},confirmedEmployment:{dates:[],status:"none"},
 });
 assert.deepEqual(projectHrEmployeeEmploymentDates({recordedDate:"2026-10-30",plannedConfirmationDates:["2024-02-01","2024-03-01"],confirmedEmploymentDates:["2024-01-01","2026-10-30"]}),{
  unclassifiedRecordedDate:{date:"2026-10-30",status:"unclassified"},plannedConfirmation:{dates:["2024-02-01","2024-03-01"],status:"multiple"},confirmedEmployment:{dates:["2024-01-01","2026-10-30"],status:"multiple"},
 });
 assert.deepEqual(projectHrEmployeeEmploymentDates({recordedDate:"2026-02-30",plannedConfirmationDates:["not-a-date","2026-10-30"],confirmedEmploymentDates:["2026-10-30"]}),{
  unclassifiedRecordedDate:{date:null,status:"unclassified"},plannedConfirmation:{dates:["2026-10-30"],status:"unclassified"},confirmedEmployment:{dates:["2026-10-30"],status:"recorded"},
 });
 assert.deepEqual(projectHrEmployeeEmploymentDates({recordedDate:"0999-01-01",plannedConfirmationDates:[],confirmedEmploymentDates:[]}).unclassifiedRecordedDate,{date:null,status:"unclassified"});
 assert.deepEqual(projectHrEmployeeEmploymentDates({recordedDate:"2026-10-30",plannedConfirmationDates:["2026-10-30","2026-10-30"],confirmedEmploymentDates:["2026-10-30","2026-10-30"]}),{
  unclassifiedRecordedDate:{date:"2026-10-30",status:"unclassified"},plannedConfirmation:{dates:["2026-10-30","2026-10-30"],status:"multiple"},confirmedEmployment:{dates:["2026-10-30","2026-10-30"],status:"multiple"},
 });
});
