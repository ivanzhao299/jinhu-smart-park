import {act,fireEvent,render,screen} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {DepartureApplicationsPanel} from "../../app/hr/lifecycle/DepartureApplicationsPanel";
import {hrApi,type HrDepartureApplication} from "../../lib/hr-api";
import {ApiError} from "../../lib/api-client";
const state=vi.hoisted(()=>({user:{id:"actor",permissions:["hr:departure:read","hr:departure:manage","hr:departure:review","hr:departure:handover","hr:departure:apply"]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../lib/hr-api",()=>({hrApi:{departureApplications:vi.fn(),departureEmployeeOptions:vi.fn(),createDepartureApplication:vi.fn(),updateDepartureApplication:vi.fn(),departureApplicationAction:vi.fn(),reviewDepartureApplication:vi.fn(),recordDepartureHandover:vi.fn(),applyDepartureApplication:vi.fn()}}));
const row=(patch:Partial<HrDepartureApplication>={}):HrDepartureApplication=>({id:"APP-1",version:1,employeeId:"EMP-1",employeeName:"Synthetic employee",employeeCode:"SYN-EMP-1",applicationName:"Synthetic departure",reason:"Original reason",status:"submitted",applicationNo:"SYN-LZ-1",applicationDate:"2026-10-01",plannedDepartureDate:"2026-10-01",departureType:"主动离职",orgName:null,reviewComment:null,reviewedAt:null,interviewStatus:"pending",surveyStatus:"pending",handoverStatus:"pending",wageStatus:"pending",archiveStatus:"open",appliedAt:null,...patch});
const list=(value:HrDepartureApplication)=>({items:[value],total:1,page:1,page_size:50});
beforeEach(()=>{vi.clearAllMocks();state.user={id:"actor",permissions:["hr:departure:read","hr:departure:manage","hr:departure:review","hr:departure:handover","hr:departure:apply"]};vi.mocked(hrApi.departureApplications).mockResolvedValue(list(row()));vi.mocked(hrApi.departureEmployeeOptions).mockResolvedValue({items:[{id:"EMP-2",employeeName:"Recipient",employeeCode:"SYN-2",orgId:null,orgName:null,employmentStatus:"active"}],total:1,page:1,page_size:20,selected:null});});
it("requires real return opinion and retains it against an older list",async()=>{
 vi.mocked(hrApi.reviewDepartureApplication).mockResolvedValue(row({version:2,status:"returned",reviewComment:"Correct the handover plan",reviewedAt:"2026-10-10T04:00:00Z"}));
 render(<DepartureApplicationsPanel/>);fireEvent.click(await screen.findByRole("button",{name:"填写审核意见"}));fireEvent.click(screen.getByRole("button",{name:"退回"}));expect(hrApi.reviewDepartureApplication).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText("审核意见"),{target:{value:"Correct the handover plan"}});fireEvent.click(screen.getByRole("button",{name:"退回"}));
 await screen.findByText(/审核意见：Correct the handover plan/);expect(screen.getByText("Synthetic employee · 已退回")).toBeVisible();expect(hrApi.reviewDepartureApplication).toHaveBeenCalledWith("APP-1","return","Correct the handover plan","synthetic-token",expect.any(String));
});
it("retains failed edit values and retries exactly once with original body token key",async()=>{
 vi.mocked(hrApi.departureApplications).mockResolvedValue(list(row({status:"returned"})));vi.mocked(hrApi.updateDepartureApplication).mockRejectedValueOnce(new Error("Synthetic offline"));
 render(<DepartureApplicationsPanel/>);fireEvent.click(await screen.findByRole("button",{name:"修改"}));fireEvent.change(screen.getByLabelText("申请名称"),{target:{value:"Corrected name"}});fireEvent.change(screen.getByLabelText("离职原因"),{target:{value:"Corrected reason"}});
 const form=screen.getByRole("button",{name:"保存修改"}).closest("form")!;fireEvent.submit(form);fireEvent.submit(form);await screen.findByRole("button",{name:"按原请求重试"});expect(hrApi.updateDepartureApplication).toHaveBeenCalledTimes(1);expect(screen.getByLabelText("申请名称")).toHaveValue("Corrected name");
 const original=vi.mocked(hrApi.updateDepartureApplication).mock.calls[0]!;vi.mocked(hrApi.updateDepartureApplication).mockResolvedValueOnce(row({version:2,status:"returned",applicationName:"Corrected name",reason:"Corrected reason"}));vi.mocked(hrApi.departureApplications).mockRejectedValueOnce(new Error("Synthetic refresh offline"));
 fireEvent.click(screen.getByRole("button",{name:"按原请求重试"}));await screen.findByText("办理已保存：已退回。");expect(vi.mocked(hrApi.updateDepartureApplication).mock.calls[1]).toEqual(original);await screen.findByText(/Synthetic refresh offline/);expect(screen.queryByRole("button",{name:"按原请求重试"})).toBeNull();
});
it("retains clearance notes and selected recipient for original-request handover retry",async()=>{
 vi.mocked(hrApi.departureApplications).mockResolvedValue(list(row({status:"approved"})));vi.mocked(hrApi.recordDepartureHandover).mockRejectedValueOnce(new Error("Synthetic handover offline"));
 render(<DepartureApplicationsPanel/>);fireEvent.click(await screen.findByRole("button",{name:"办理清场"}));await screen.findByRole("option",{name:"Recipient · SYN-2"});fireEvent.change(screen.getByLabelText("接交员工"),{target:{value:"EMP-2"}});fireEvent.change(screen.getByLabelText("交接说明"),{target:{value:"Actual equipment handover"}});fireEvent.click(screen.getByRole("button",{name:"确认"}));await screen.findByRole("button",{name:"按原请求重试"});expect(screen.getByLabelText("交接说明")).toHaveValue("Actual equipment handover");expect(screen.getByLabelText("接交员工")).toHaveValue("EMP-2");
 const original=vi.mocked(hrApi.recordDepartureHandover).mock.calls[0];vi.mocked(hrApi.recordDepartureHandover).mockResolvedValueOnce(row({version:2,status:"approved",handoverStatus:"completed",handoverSummary:"Actual equipment handover",handoverToEmployeeId:"EMP-2"}));fireEvent.click(screen.getByRole("button",{name:"按原请求重试"}));await screen.findByText("Actual equipment handover");expect(vi.mocked(hrApi.recordDepartureHandover).mock.calls[1]).toEqual(original);expect(screen.queryByLabelText("交接说明")).toBeNull();
});
it("shows formal departure and existing clearance evidence even if list refresh fails",async()=>{
 const ready=row({status:"approved",interviewStatus:"completed",surveyStatus:"completed",handoverStatus:"completed",wageStatus:"settled",archiveStatus:"closed",interviewPlace:"Meeting room 3",surveyReasonCodes:["ROLE","TRAVEL"],handoverToEmployeeId:"EMP-2",wageNote:"Existing settlement evidence"});vi.mocked(hrApi.departureApplications).mockResolvedValueOnce(list(ready)).mockRejectedValueOnce(new Error("Synthetic refresh offline"));vi.mocked(hrApi.applyDepartureApplication).mockResolvedValue({...ready,version:2,status:"applied",appliedAt:"2026-10-10T04:00:00Z"});
 render(<DepartureApplicationsPanel/>);fireEvent.click(await screen.findByRole("button",{name:"确认离职生效"}));await screen.findByText("Synthetic employee · 已离职");expect(screen.getByText("离职已生效，员工任职和离职日期已保存。")).toBeVisible();expect(screen.getByText("Existing settlement evidence")).toBeVisible();expect(screen.getByText("Meeting room 3")).toBeVisible();expect(screen.getByText("ROLE、TRAVEL")).toBeVisible();expect(screen.getByText("EMP-2")).toBeVisible();await screen.findByText(/Synthetic refresh offline/);expect(hrApi.applyDepartureApplication).toHaveBeenCalledTimes(1);
});
it("suppresses prior identity completion",async()=>{
 let resolve!:(value:HrDepartureApplication)=>void;vi.mocked(hrApi.reviewDepartureApplication).mockImplementation(()=>new Promise(done=>{resolve=done;}));const rendered=render(<DepartureApplicationsPanel/>);fireEvent.click(await screen.findByRole("button",{name:"填写审核意见"}));fireEvent.click(screen.getByRole("button",{name:"批准"}));state.user={id:"other",permissions:[]};rendered.rerender(<DepartureApplicationsPanel/>);await act(async()=>resolve(row({version:2,status:"approved"})));expect(screen.queryByText(/办理已保存/)).toBeNull();expect(hrApi.departureApplications).toHaveBeenCalledTimes(1);
});

it("treats a same-version mutation receipt as unresolved and retries the original action",async()=>{
 vi.mocked(hrApi.departureApplications).mockResolvedValue(list(row({status:"draft"})));
 vi.mocked(hrApi.departureApplicationAction).mockResolvedValueOnce(row({status:"submitted",version:1}));
 render(<DepartureApplicationsPanel/>);
 fireEvent.click(await screen.findByRole("button",{name:"提交审批"}));
 await screen.findByRole("button",{name:"按原请求重试"});
 const original=vi.mocked(hrApi.departureApplicationAction).mock.calls[0]!;
 expect(screen.getByText("Synthetic employee · 草稿")).toBeVisible();
 vi.mocked(hrApi.departureApplicationAction).mockResolvedValueOnce(row({status:"submitted",version:2}));
 fireEvent.click(screen.getByRole("button",{name:"按原请求重试"}));
 await screen.findByText("Synthetic employee · 待审批");
 expect(vi.mocked(hrApi.departureApplicationAction).mock.calls[1]).toEqual(original);
});


it("keeps the frozen request for idempotency processing and reservation 409s",async()=>{
 vi.mocked(hrApi.departureApplications).mockResolvedValue(list(row({status:"draft"})));
 vi.mocked(hrApi.departureApplicationAction)
  .mockRejectedValueOnce(new ApiError("The same idempotency key is still processing",409))
  .mockRejectedValueOnce(new ApiError("Idempotency reservation changed; retry request",409))
  .mockResolvedValueOnce(row({status:"submitted",version:2}));
 render(<DepartureApplicationsPanel/>);
 fireEvent.click(await screen.findByRole("button",{name:"提交审批"}));
 await screen.findByRole("button",{name:"按原请求重试"});
 const original=vi.mocked(hrApi.departureApplicationAction).mock.calls[0]!;
 fireEvent.click(screen.getByRole("button",{name:"按原请求重试"}));
 await screen.findByRole("button",{name:"按原请求重试"});
 expect(vi.mocked(hrApi.departureApplicationAction).mock.calls[1]).toEqual(original);
 fireEvent.click(screen.getByRole("button",{name:"按原请求重试"}));
 await screen.findByText("Synthetic employee · 待审批");
 expect(vi.mocked(hrApi.departureApplicationAction).mock.calls[2]).toEqual(original);
});
