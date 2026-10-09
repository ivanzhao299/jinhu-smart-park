import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {HrContractsClient} from "../../app/hr/contracts/HrContractsClient";
import {HrInsuranceClient} from "../../app/hr/insurance/HrInsuranceClient";
import {hrApi} from "../../lib/hr-api";
import {downloadCsv} from "../../lib/scoped-csv-export";
import type * as CsvModule from "../../lib/scoped-csv-export";
const auth=vi.hoisted(()=>({user:{id:"synthetic-hr",permissions:["hr:contract:read","hr:insurance:read","hr:insurance_amount:read"]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>auth.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../components/auth/PermissionGuard",()=>({PermissionGuard:({children}:{children:React.ReactNode})=>children}));
vi.mock("../../lib/hr-api",()=>({hrApi:{contracts:vi.fn(),insurancePeriods:vi.fn(),insurancePeriod:vi.fn()}}));
vi.mock("../../lib/scoped-csv-export",async()=>({...await vi.importActual<typeof CsvModule>("../../lib/scoped-csv-export"),downloadCsv:vi.fn()}));
const rows=(page:number,size:number)=>Array.from({length:Math.min(size,Math.max(0,101-(page-1)*size))},(_,i)=>({id:`row-${(page-1)*size+i}`,employeeCode:`SYN-${(page-1)*size+i}`,employeeName:`合成员工${(page-1)*size+i}`}));
beforeEach(()=>{vi.clearAllMocks();auth.user={id:"synthetic-hr",permissions:["hr:contract:read","hr:insurance:read","hr:insurance_amount:read"]};
 vi.mocked(hrApi.contracts).mockImplementation(async(_token,page=1,size=50)=>({page,page_size:size,total:101,items:rows(page,size).map(r=>({...r,contractNo:"CON-"+r.id,contractTypeName:"合成合同",startDate:"2026-07-01",endDate:null,status:"active",isHistoricalImport:true,baseSalary:"SECRET-SALARY"}))}));
 vi.mocked(hrApi.insurancePeriods).mockImplementation(async(_token,page=1,size=30)=>({page,page_size:size,total:101,items:rows(page,size).map(r=>({...r,periodYear:2026,periodMonth:7,needsReview:false,reviewReasonCode:null,itemCount:6,employeeAmount:"90071992547409.91",supplementAmount:"0.00",employerAmount:"123.45",totalAmount:"999.99"}))}));
});
it("actual contract page exports all filtered rows, keeps self entry and excludes salary",async()=>{
 auth.user.permissions=["hr:contract:self_read"];render(<HrContractsClient/>);
 const button=screen.getByRole("button",{name:"导出筛选合同"});await waitFor(()=>expect(button).toBeEnabled());
 fireEvent.change(screen.getByPlaceholderText("姓名、员工编号或合同编号"),{target:{value:"SYN"}});await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button);await screen.findByText("已导出 101 条匹配合同。");
 const csv=vi.mocked(downloadCsv).mock.calls[0]![0];expect(csv.split("\r\n")).toHaveLength(102);expect(csv).toContain("CON-row-100");expect(csv).not.toContain("SYN-");expect(csv).not.toContain("SECRET-SALARY");
 const calls=vi.mocked(hrApi.contracts).mock.calls.filter(c=>c[2]===100);expect(calls.map(c=>c[1])).toEqual([1,2,1]);expect(calls.every(c=>c[3]?.keyword==="SYN"&&c[4]===true&&c[5] instanceof AbortSignal)).toBe(true);
});
it.each(["hr","team","self"])("actual insurance export retains filters and authority: %s",async role=>{
 if(role==="team")auth.user.permissions=["hr:insurance:team_read"];if(role==="self")auth.user.permissions=["hr:insurance:self_read"];
 render(<HrInsuranceClient/>);const button=screen.getByRole("button",{name:"导出筛选社保"});await waitFor(()=>expect(button).toBeEnabled());fireEvent.change(screen.getByLabelText("月份"),{target:{value:"8"}});await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button);await screen.findByText("已导出 101 条匹配社保。");
 const csv=vi.mocked(downloadCsv).mock.calls[0]![0];expect(csv.split("\r\n")).toHaveLength(102);expect(csv.includes("90071992547409.91")).toBe(role!=="team");expect(csv.includes("123.45")).toBe(role==="hr");expect(csv.includes("SYN-100")).toBe(role!=="self");const calls=vi.mocked(hrApi.insurancePeriods).mock.calls.filter(c=>c[2]===100);expect(calls.map(c=>c[1])).toEqual([1,2,1]);expect(calls.every(c=>c[3]?.month===8&&c[4]===(role==="self")&&c[5] instanceof AbortSignal)).toBe(true);
});
it("shared reason labels remain visible on the real insurance page",async()=>{
 vi.mocked(hrApi.insurancePeriods).mockResolvedValue({page:1,page_size:30,total:1,items:[{id:"review",periodYear:0,periodMonth:0,needsReview:true,reviewReasonCode:"T3_INT4_INVALID",itemCount:0}]});render(<HrInsuranceClient/>);expect((await screen.findAllByText(/来源期间缺失或无效/)).length).toBeGreaterThan(0);
});
it("no read authority shows no export button",()=>{auth.user.permissions=[];render(<><HrContractsClient/><HrInsuranceClient/></>);expect(screen.queryByRole("button",{name:/导出筛选/})).toBeNull();});

it("employee profile insurance export preserves exact employee across every fetched page",async()=>{
 const employeeId="11111111-1111-4111-8111-111111111111";render(<HrInsuranceClient employeeId={employeeId}/>);const button=screen.getByRole("button",{name:"导出筛选社保"});await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button);await screen.findByText("已导出 101 条匹配社保。");const calls=vi.mocked(hrApi.insurancePeriods).mock.calls.filter(c=>c[2]===100);expect(calls.map(c=>c[1])).toEqual([1,2,1]);expect(calls.every(c=>c[3]?.employeeId===employeeId)).toBe(true);
});
