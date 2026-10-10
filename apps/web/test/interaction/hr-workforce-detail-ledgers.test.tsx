import { fireEvent,render,screen } from "@testing-library/react";
import { expect,it,vi } from "vitest";
import { WorkforceDetailLedgers } from "../../app/hr/decision-center/WorkforceDetailLedgers";
import { workforceDepartmentLedgerCsv,workforcePositionLedgerCsv } from "../../app/hr/decision-center/workforce-detail-ledger";
import type { HrWorkforceDecisionSnapshot } from "../../lib/hr-api";
import { downloadCsv } from "../../lib/scoped-csv-export";
import type * as CsvModule from "../../lib/scoped-csv-export";

vi.mock("../../lib/scoped-csv-export",async original=>({...await original<typeof CsvModule>(),downloadCsv:vi.fn()}));

function snapshot(departmentCount=1,positionCount=1):HrWorkforceDecisionSnapshot{
 return {from:"2026-01-01",to:"2026-12-31",employeeTotal:departmentCount,activeHeadcount:departmentCount,byStatus:[],byType:[],staffing:{positionTotal:positionCount,configuredPositionCount:positionCount,unconfiguredPositionCount:0,headcountLimit:positionCount,activeAssignedHeadcount:positionCount,activeUnassignedHeadcount:0,vacancyCount:0,overCapacityPositionCount:0},departments:Array.from({length:departmentCount},(_,index)=>({code:`D-${index+1}`,name:`部门 ${index+1}`,status:"enabled",employeeTotal:1,activeCount:1,probationCount:0,preboardingCount:0,suspendedCount:0,departedCount:0,plannedHeadcount:index===0?0:null})),positions:Array.from({length:positionCount},(_,index)=>({orgCode:"D-1",orgName:"部门 1",positionCode:`P-${index+1}`,positionName:`岗位 ${index+1}`,headcountLimit:index===0?0:null,activeHeadcount:index===0?0:1,vacancyCount:index===0?0:null,overCapacityCount:index===0?0:null})),employmentEvents:{from:"2026-01-01",to:"2026-12-31",total:0,employeeCount:0,historicalCount:0,onlineCount:0,byType:[],byMonth:[]}};
}

it("keeps zero and null staffing distinct in complete non-identifying CSV ledgers",()=>{
 const value=snapshot(2,2);const departmentCsv=workforceDepartmentLedgerCsv(value.departments),positionCsv=workforcePositionLedgerCsv(value.positions);
 expect(departmentCsv).toContain('"0"');expect(departmentCsv).toContain('"启用"');expect(departmentCsv).not.toContain('"enabled"');expect(departmentCsv).toMatch(/,""$/u);
 expect(positionCsv).toContain('"0"');expect(positionCsv).toMatch(/,"",""$/u);
 for(const csv of [departmentCsv,positionCsv])for(const forbidden of ["employeeId","employeeCode","fullName","个人手机号"])expect(csv).not.toContain(forbidden);
});

it("pages at fifty but exports every department and enabled position from the current snapshot",()=>{
 const value=snapshot(51,501);render(<WorkforceDetailLedgers snapshot={value} enabled/>);
 expect(screen.getByText("部门 1")).toBeVisible();expect(screen.queryByText("部门 51")).toBeNull();
 const next=screen.getAllByRole("button",{name:"下一页"});fireEvent.click(next[0]!);expect(screen.getByText("部门 51")).toBeVisible();
 fireEvent.click(screen.getByRole("button",{name:"导出全部部门台账"}));fireEvent.click(screen.getByRole("button",{name:"导出全部岗位台账"}));
 expect(downloadCsv).toHaveBeenCalledTimes(2);expect(vi.mocked(downloadCsv).mock.calls[0]![0]).toContain('"部门 51"');expect(vi.mocked(downloadCsv).mock.calls[1]![0]).toContain('"岗位 501"');
});

it("resets ledger pages when a new current snapshot replaces the old one",()=>{
 const view=render(<WorkforceDetailLedgers snapshot={snapshot(51,1)} enabled/>);fireEvent.click(screen.getAllByRole("button",{name:"下一页"})[0]!);expect(screen.getByText("部门 51")).toBeVisible();
 view.rerender(<WorkforceDetailLedgers snapshot={snapshot(1,1)} enabled/>);expect(screen.getByText("部门 1")).toBeVisible();expect(screen.queryByText("部门 51")).toBeNull();
});
