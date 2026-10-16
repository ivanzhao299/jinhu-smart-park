import {expect,it} from "vitest";
import {goalCheckinLedgerCsv,goalLedgerCsv,workReportLedgerCsv} from "../../app/hr/goals/goal-report-ledger-export";
const snapshotAt="2026-10-16T00:00:00.000Z";
it("serializes complete goal, check-in and work-report snapshots without numeric coercion or CSV formulas",()=>{
 const goal={id:"g",cycleId:"c",parentGoalId:null,goalLevel:"employee",goalName:" \t=FORMULA()",ownerOrgId:null,ownerEmployeeId:"e",ownerName:"员工",weight:"0.3333",metricType:"numeric",metricName:"产出",targetValue:"9999999999999999.99",currentValue:"0.01",unit:"项",progress:"0.5",startDate:"2026-01-01",dueDate:"2026-12-31",status:"active",currentVersionNo:3};
 const checkin={id:"c",goalId:"g",goalName:goal.goalName,progress:"0.5",currentValue:"0.01",summary:"完成",risks:null,confidence:"high",nextAction:null,createTime:"2026-10-16T00:00:00.000Z"};
 const report={id:"r",employeeName:"员工",reportType:"daily",periodStart:"2026-10-16",periodEnd:"2026-10-16",title:"日报",completedWork:"完成",nextPlan:null,risks:null,questionsAndSuggestions:null,collaborationNeeds:null,hours:"7.25",status:"submitted",submissionNo:1,reviewComment:null,submittedAt:null,reviewedAt:null,goalSuggestions:[{goalId:"g",goalName:"关联目标",proposedProgress:"0.4000",proposedCurrentValue:"2.3456",suggestionSummary:"保持目标关联"}]};
 for(const [serialize,item] of [[goalLedgerCsv,goal],[goalCheckinLedgerCsv,checkin],[workReportLedgerCsv,report]] as const){const output=serialize({items:[item],total:1,snapshotAt});expect(output.total).toBe(1);expect(output.csv.startsWith("\uFEFF")).toBe(true);}
 expect(workReportLedgerCsv({items:[report],total:1,snapshotAt}).csv).toContain("g / 关联目标 / 0.4000 / 2.3456 / 保持目标关联");expect(goalLedgerCsv({items:[goal],total:1,snapshotAt}).csv).toContain("9999999999999999.99");expect(goalLedgerCsv({items:[goal],total:1,snapshotAt}).csv).toContain("' \t=FORMULA()");
});
it.each([{items:[],total:0,snapshotAt:"bad"},{items:[{id:"same"},{id:"same"}],total:2,snapshotAt}, {items:[],total:5001,snapshotAt}])("rejects malformed snapshots",value=>expect(()=>goalLedgerCsv(value)).toThrow("导出响应无法核对"));
