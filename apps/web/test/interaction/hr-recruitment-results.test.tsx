import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {HrRecruitmentClient} from "../../app/hr/recruitment/HrRecruitmentClient";
import {hrApi,type HrOnboardingApplication,type HrCandidate,type HrRequisition} from "../../lib/hr-api";
const auth=vi.hoisted(()=>({user:{id:"hr",permissions:["hr:recruitment","hr:requisition:read","hr:candidate:read","hr:onboarding:read","hr:onboarding:manage"],enabled_modules:[{module_code:"hr"}]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>auth.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../lib/hr-api",()=>({hrApi:{recruitmentRequisitions:vi.fn(),recruitmentCandidates:vi.fn(),recruitmentCandidateDetail:vi.fn(),onboardingApplications:vi.fn(),onboardingApplicationAction:vi.fn(),directoryOptions:vi.fn(),positions:vi.fn()}}));
const row=(number:number,extra:Partial<HrOnboardingApplication>={}):HrOnboardingApplication=>({id:`application-${number}`,entryType:"initial",applicationNo:`SYN-${number}`,applicationName:`合成入职${number}`,employeeId:`employee-${number}`,employeeName:`合成员工${number}`,candidateId:null,applicationDate:"2026-10-01",plannedHireDate:"2026-10-10",probationMonths:3,attendanceCardNo:"123",status:"draft",reviewComment:null,reviewedAt:null,confirmedAt:null,remark:null,...extra});
const req:HrRequisition={id:"req",requisitionCode:"SYN-REQ",title:"合成招聘需求",orgId:"org",orgName:"合成部门",positionId:null,positionName:null,headcount:1,hiredCount:0,ownerUserId:"hr",ownerName:null,plannedOnboardDate:null,status:"open"};
const candidate:HrCandidate={id:"candidate",candidateNo:"SYN-C",fullName:"合成候选人",requisitionId:"req",requisitionTitle:"合成招聘需求",stage:"screening",source:null,expectedOnboardDate:null,latestEvaluation:null,mobileMasked:null,emailMasked:null,identityMasked:null,convertedEmployeeId:null};
const list=<T,>(items:T[],total=items.length,page=1)=>({items,total,page,page_size:20});
beforeEach(()=>{vi.resetAllMocks();auth.user={id:"hr",permissions:["hr:recruitment","hr:requisition:read","hr:candidate:read","hr:onboarding:read","hr:onboarding:manage"],enabled_modules:[{module_code:"hr"}]};vi.mocked(hrApi.recruitmentRequisitions).mockResolvedValue(list([req]));vi.mocked(hrApi.recruitmentCandidates).mockImplementation(async(_token,page=1,_size,filters)=>list(filters?.stage==="hired"?[]:[candidate],filters?.stage==="hired"?0:1,page));vi.mocked(hrApi.onboardingApplications).mockImplementation(async(_token,page=1)=>list([row((page-1)*20+1)],105,page));vi.mocked(hrApi.onboardingApplicationAction).mockResolvedValue(row(101));});
it("reaches initial application101 and operates on that exact later-page application",async()=>{
 render(<HrRecruitmentClient/>);await screen.findByText("入职第 1 / 6 页 · 共 105 条");
 for(let page=2;page<=6;page++){fireEvent.click(screen.getByRole("button",{name:"入职下一页"}));await screen.findByText(`入职第 ${page} / 6 页 · 共 105 条`);}
 expect(screen.getByText("合成入职101 · 草稿")).toBeInTheDocument();expect(hrApi.onboardingApplications).toHaveBeenLastCalledWith("synthetic-token",6,20,undefined,expect.any(AbortSignal),{entryType:"initial"});
 fireEvent.click(screen.getByRole("button",{name:"提交审批"}));await waitFor(()=>expect(hrApi.onboardingApplicationAction).toHaveBeenCalledWith("application-101","submit","synthetic-token"));
});
it("status filtering returns to page1 while preserving the initial-entry boundary",async()=>{
 render(<HrRecruitmentClient/>);await screen.findByText("入职第 1 / 6 页 · 共 105 条");fireEvent.click(screen.getByRole("button",{name:"入职下一页"}));await screen.findByText("入职第 2 / 6 页 · 共 105 条");
 fireEvent.change(screen.getByLabelText("入职申请状态"),{target:{value:"submitted"}});await screen.findByText("入职第 1 / 6 页 · 共 105 条");expect(hrApi.onboardingApplications).toHaveBeenLastCalledWith("synthetic-token",1,20,"submitted",expect.any(AbortSignal),{entryType:"initial"});
});
it("a failed recruitment domain does not discard candidate and onboarding records and can retry",async()=>{
 vi.mocked(hrApi.recruitmentRequisitions).mockRejectedValueOnce(new Error("合成需求读取失败"));render(<HrRecruitmentClient/>);await screen.findByText("合成需求读取失败");expect(screen.getByText("合成候选人 · 筛选")).toBeInTheDocument();expect(screen.getByText("合成入职1 · 草稿")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"重试"}));await screen.findByText("合成招聘需求");expect(screen.queryByText("合成需求读取失败")).toBeNull();
});
it("replaced reads are canceled and late rows cannot overwrite the filtered page",async()=>{
 let resolve:(value:ReturnType<typeof list<HrOnboardingApplication>>)=>void=()=>{};vi.mocked(hrApi.onboardingApplications).mockImplementationOnce(()=>new Promise(done=>{resolve=done}));render(<HrRecruitmentClient/>);const signal=vi.mocked(hrApi.onboardingApplications).mock.calls[0]?.[4];
 fireEvent.change(screen.getByLabelText("入职申请状态"),{target:{value:"submitted"}});await screen.findByText("入职第 1 / 6 页 · 共 105 条");expect(signal?.aborted).toBe(true);await act(async()=>resolve(list([row(999)])));expect(screen.queryByText("合成入职999 · 草稿")).toBeNull();
});
it("account changes discard previous rows and cancel pending reads",async()=>{
 let resolve:(value:ReturnType<typeof list<HrOnboardingApplication>>)=>void=()=>{};vi.mocked(hrApi.onboardingApplications).mockImplementationOnce(()=>new Promise(done=>{resolve=done}));const {rerender,unmount}=render(<HrRecruitmentClient/>);const signal=vi.mocked(hrApi.onboardingApplications).mock.calls[0]?.[4];auth.user={...auth.user,id:"next-hr"};rerender(<HrRecruitmentClient/>);await screen.findByText("入职第 1 / 6 页 · 共 105 条");expect(signal?.aborted).toBe(true);await act(async()=>resolve(list([row(999)])));expect(screen.queryByText("合成入职999 · 草稿")).toBeNull();unmount();expect(vi.mocked(hrApi.onboardingApplications).mock.calls.at(-1)?.[4]?.aborted).toBe(true);
});
it("shrinking totals recover to the last accessible onboarding page",async()=>{
 vi.mocked(hrApi.onboardingApplications).mockImplementation(async(_token,page=1)=>page===1?list([row(1)],21,1):list([],1,2));render(<HrRecruitmentClient/>);await screen.findByText("入职第 1 / 2 页 · 共 21 条");fireEvent.click(screen.getByRole("button",{name:"入职下一页"}));await waitFor(()=>expect(hrApi.onboardingApplications).toHaveBeenCalledTimes(3));await screen.findByText("合成入职1 · 草稿");expect(vi.mocked(hrApi.onboardingApplications).mock.calls.at(-1)?.[1]).toBe(1);
});
it("does not render a rehire response in the initial onboarding ledger",async()=>{
 vi.mocked(hrApi.onboardingApplications).mockResolvedValue(list([row(1,{entryType:"rehire"})]));render(<HrRecruitmentClient/>);await screen.findByText("入职申请类型与当前列表不一致，请重试。");expect(screen.queryByText("合成入职1 · 草稿")).toBeNull();expect(screen.getByText("合成候选人 · 筛选")).toBeInTheDocument();
});

it("page access alone does not query operational ledgers without their read permissions",async()=>{
 auth.user={...auth.user,permissions:["hr:recruitment"]};render(<HrRecruitmentClient/>);await screen.findByRole("heading",{name:"招聘管理"});expect(hrApi.onboardingApplications).not.toHaveBeenCalled();expect(hrApi.recruitmentCandidates).not.toHaveBeenCalled();expect(hrApi.recruitmentRequisitions).not.toHaveBeenCalled();
});

const sensitive = {...candidate,mobile:"SYN-PHONE",email:"synthetic@example.invalid",identityNumber:"SYN-IDENTITY"};
it("authorized candidate contact is projected for the exact selected candidate",async()=>{
 auth.user.permissions.push("hr:candidate:sensitive_read");vi.mocked(hrApi.recruitmentCandidateDetail).mockResolvedValue(sensitive);
 render(<HrRecruitmentClient/>);fireEvent.click(await screen.findByRole("button",{name:"下一动作"}));
 await screen.findByText("电话：SYN-PHONE");expect(screen.getByText("邮箱：synthetic@example.invalid")).toBeInTheDocument();expect(screen.getByText("证件：SYN-IDENTITY")).toBeInTheDocument();
 expect(hrApi.recruitmentCandidateDetail).toHaveBeenCalledWith("candidate","synthetic-token",expect.any(AbortSignal));
 fireEvent.click(screen.getByRole("button",{name:"关闭"}));expect(screen.queryByText("电话：SYN-PHONE")).toBeNull();expect(vi.mocked(hrApi.recruitmentCandidateDetail).mock.calls[0]?.[2]?.aborted).toBe(true);
});
it("candidate read alone never requests or exposes contact even with an overbroad list row",async()=>{
 vi.mocked(hrApi.recruitmentCandidates).mockResolvedValue(list([sensitive]));render(<HrRecruitmentClient/>);
 fireEvent.click(await screen.findByRole("button",{name:"下一动作"}));expect(hrApi.recruitmentCandidateDetail).not.toHaveBeenCalled();expect(screen.queryByText(/SYN-PHONE|synthetic@example.invalid|SYN-IDENTITY/)).toBeNull();
});
it("revoked contact authority cancels the in-flight detail and discards late private projection",async()=>{
 auth.user.permissions.push("hr:candidate:sensitive_read");let resolve:(value:typeof sensitive)=>void=()=>{};
 vi.mocked(hrApi.recruitmentCandidateDetail).mockImplementationOnce(()=>new Promise(done=>{resolve=done}));
 const view=render(<HrRecruitmentClient/>);fireEvent.click(await screen.findByRole("button",{name:"下一动作"}));await waitFor(()=>expect(hrApi.recruitmentCandidateDetail).toHaveBeenCalledTimes(1));
 const signal=vi.mocked(hrApi.recruitmentCandidateDetail).mock.calls[0]?.[2];auth.user={...auth.user,permissions:auth.user.permissions.filter(p=>p!=="hr:candidate:sensitive_read")};view.rerender(<HrRecruitmentClient/>);
 await screen.findByText("合成候选人 · 筛选");expect(signal?.aborted).toBe(true);await act(async()=>resolve(sensitive));expect(screen.queryByText(/SYN-PHONE|synthetic@example.invalid|SYN-IDENTITY/)).toBeNull();
});
