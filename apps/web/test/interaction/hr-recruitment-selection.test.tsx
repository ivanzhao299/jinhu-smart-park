import {act,fireEvent,render,screen,within} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {HrRecruitmentClient} from "../../app/hr/recruitment/HrRecruitmentClient";
import {RecruitmentReferencePicker} from "../../app/hr/recruitment/RecruitmentReferencePicker";
import {hrApi,type HrCandidate,type HrRequisition,type HrOnboardingApplication} from "../../lib/hr-api";
const permissions=["hr:recruitment","hr:requisition:read","hr:candidate:read","hr:candidate:manage","hr:onboarding:read","hr:onboarding:manage"];
const auth=vi.hoisted(()=>({user:{id:"hr",permissions:[] as string[],enabled_modules:[{module_code:"hr"}]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>auth.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../lib/hr-api",()=>({hrApi:{recruitmentRequisitions:vi.fn(),recruitmentCandidates:vi.fn(),onboardingApplications:vi.fn(),directoryOptions:vi.fn(),positions:vi.fn(),createRecruitmentCandidate:vi.fn(),createOnboardingApplication:vi.fn(),createRecruitmentRequisition:vi.fn(),convertRecruitmentCandidate:vi.fn(),updateOnboardingApplication:vi.fn()}}));
const list=<T,>(items:T[],total=items.length,page=1)=>({items,total,page,page_size:20});
const req=(n:number,status="open"):HrRequisition=>({id:`req-${n}`,requisitionCode:`R-${n}`,title:`合成岗位${n}`,orgId:"org",orgName:"合成部门",positionId:null,positionName:null,headcount:1,hiredCount:0,ownerUserId:"hr",ownerName:null,plannedOnboardDate:null,status});
const candidate=(n:number):HrCandidate=>({id:`candidate-${n}`,candidateNo:`C-${n}`,fullName:`合成人员${n}`,requisitionId:"req-1",requisitionTitle:"合成岗位",stage:"hired",source:null,expectedOnboardDate:null,latestEvaluation:null,mobileMasked:null,emailMasked:null,identityMasked:null,convertedEmployeeId:`employee-${n}`});
const application:HrOnboardingApplication={id:"application",entryType:"initial",applicationNo:"SYN",applicationName:"合成申请",employeeId:"employee-101",candidateId:"candidate-101",applicationDate:"2026-10-01",plannedHireDate:"2026-10-10",probationMonths:3,attendanceCardNo:"123",status:"draft",reviewComment:null,reviewedAt:null,confirmedAt:null,remark:null};
beforeEach(()=>{
 vi.resetAllMocks();auth.user={id:"hr",permissions:[...permissions],enabled_modules:[{module_code:"hr"}]};
 vi.mocked(hrApi.recruitmentRequisitions).mockImplementation(async(_token,page=1,_size,filters)=>list([req((page-1)*20+1,filters?.status??"open")],25,page));
 vi.mocked(hrApi.recruitmentCandidates).mockImplementation(async(_token,page=1,_size,filters)=>list(filters?.stage==="hired"?[candidate((page-1)*20+1)]:[],filters?.stage==="hired"?105:0,page));
 vi.mocked(hrApi.onboardingApplications).mockResolvedValue(list([]));vi.mocked(hrApi.directoryOptions).mockResolvedValue({orgs:[],users:[]});vi.mocked(hrApi.positions).mockResolvedValue([]);
 vi.mocked(hrApi.createRecruitmentCandidate).mockResolvedValue(candidate(1));vi.mocked(hrApi.createOnboardingApplication).mockResolvedValue(application);
});
it("selects an off-page requisition independently of the ledger and retains candidate draft on failure",async()=>{
 render(<HrRecruitmentClient/>);await screen.findByRole("button",{name:"选择 合成岗位1 · R-1"});
 fireEvent.click(screen.getByRole("button",{name:"招聘需求选择下一批"}));await screen.findByRole("button",{name:"选择 合成岗位21 · R-21"});fireEvent.click(screen.getByRole("button",{name:"选择 合成岗位21 · R-21"}));
 fireEvent.change(screen.getByLabelText("候选人编号"),{target:{value:"NEW-21"}});fireEvent.change(screen.getByLabelText("姓名",{exact:true}),{target:{value:"合成新增"}});
 vi.mocked(hrApi.createRecruitmentCandidate).mockRejectedValueOnce(new Error("合成候选写入失败"));fireEvent.click(screen.getByRole("button",{name:"保存候选人"}));
 await screen.findByText("合成候选写入失败");expect(hrApi.createRecruitmentCandidate).toHaveBeenCalledWith(expect.objectContaining({requisitionId:"req-21",candidateNo:"NEW-21",fullName:"合成新增"}),"synthetic-token");expect(screen.getByLabelText("候选人编号")).toHaveValue("NEW-21");expect(screen.getByText("已选：合成岗位21 · R-21")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"保存候选人"}));await screen.findByText("候选人已保存，可在候选人管道继续办理。");expect(screen.getByLabelText("候选人编号")).toHaveValue("");expect(screen.getByRole("button",{name:"保存候选人"})).toBeDisabled();
});
it("creates initial onboarding from candidate101 with the exact employee binding and preserves failed drafts",async()=>{
 render(<HrRecruitmentClient/>);await screen.findByRole("button",{name:"选择 合成人员1 · C-1"});
 for(let page=2;page<=6;page++){fireEvent.click(screen.getByRole("button",{name:"预入职人员选择下一批"}));await screen.findByRole("button",{name:`选择 合成人员${(page-1)*20+1} · C-${(page-1)*20+1}`});}
 fireEvent.click(screen.getByRole("button",{name:"选择 合成人员101 · C-101"}));
 fireEvent.change(screen.getByLabelText("申请名称"),{target:{value:"合成后续入职"}});fireEvent.change(screen.getByLabelText("申请日期"),{target:{value:"2026-10-01"}});fireEvent.change(screen.getByLabelText("入职日期"),{target:{value:"2026-10-10"}});fireEvent.change(screen.getByLabelText("考勤卡号"),{target:{value:"123"}});
 fireEvent.change(screen.getByLabelText("预入职人员选择搜索"),{target:{value:"另一个搜索"}});await screen.findByRole("button",{name:"选择 合成人员1 · C-1"});
 vi.mocked(hrApi.createOnboardingApplication).mockRejectedValueOnce(new Error("合成申请写入失败"));fireEvent.click(screen.getByRole("button",{name:"保存入职申请草稿"}));await screen.findByText("合成申请写入失败");
 expect(hrApi.createOnboardingApplication).toHaveBeenCalledWith(expect.objectContaining({candidateId:"candidate-101",employeeId:"employee-101",applicationName:"合成后续入职"}),"synthetic-token");expect(screen.getByLabelText("申请名称")).toHaveValue("合成后续入职");expect(screen.getByText("已选：合成人员101 · C-101")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"保存入职申请草稿"}));await screen.findByText("入职申请草稿已保存，可继续提交审批。");expect(screen.getByLabelText("申请名称")).toHaveValue("");expect(screen.getByRole("button",{name:"保存入职申请草稿"})).toBeDisabled();
});
it("keeps an independent chosen reference through read failure and retry",async()=>{
 const onChange=vi.fn();const {rerender}=render(<RecruitmentReferencePicker kind="candidate" canRead selected={null} onChange={onChange}/>);fireEvent.click(await screen.findByRole("button",{name:"选择 合成人员1 · C-1"}));
 const chosen=onChange.mock.calls[0]?.[0]??null;rerender(<RecruitmentReferencePicker kind="candidate" canRead selected={chosen} onChange={onChange}/>);
 vi.mocked(hrApi.recruitmentCandidates).mockRejectedValueOnce(new Error("合成选择读取失败"));fireEvent.change(screen.getByLabelText("预入职人员选择搜索"),{target:{value:"搜索"}});await screen.findByText("合成选择读取失败");expect(screen.getByText("已选：合成人员1 · C-1")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"重试预入职人员选择"}));await screen.findByRole("button",{name:"选择 合成人员1 · C-1"});expect(onChange).toHaveBeenCalledTimes(1);
});
it("queries draft requisitions explicitly and cancels replaced and unmounted option reads",async()=>{
 let resolve:(value:ReturnType<typeof list<HrRequisition>>)=>void=()=>{};vi.mocked(hrApi.recruitmentRequisitions).mockImplementationOnce(()=>new Promise(done=>{resolve=done}));const {unmount}=render(<RecruitmentReferencePicker kind="requisition" canRead selected={null} onChange={vi.fn()}/>);
 const signal=vi.mocked(hrApi.recruitmentRequisitions).mock.calls[0]?.[4];fireEvent.change(screen.getByLabelText("需求状态"),{target:{value:"draft"}});await screen.findByRole("button",{name:"选择 合成岗位1 · R-1"});expect(signal?.aborted).toBe(true);
 expect(hrApi.recruitmentRequisitions).toHaveBeenLastCalledWith("synthetic-token",1,20,{keyword:"",status:"draft"},expect.any(AbortSignal));await act(async()=>resolve(list([req(999)])));expect(screen.queryByText("合成岗位999 · R-999")).toBeNull();unmount();expect(vi.mocked(hrApi.recruitmentRequisitions).mock.calls.at(-1)?.[4]?.aborted).toBe(true);
});
it("does not query reference data without read authority and prevents unselected writes",async()=>{
 auth.user.permissions=["hr:recruitment","hr:candidate:manage","hr:onboarding:manage","hr:onboarding:read"];
 render(<HrRecruitmentClient/>);expect(await screen.findByText(/当前账号缺少招聘需求读取权限/)).toBeInTheDocument();expect(screen.getByText(/当前账号缺少候选人读取权限/)).toBeInTheDocument();expect(hrApi.recruitmentRequisitions).not.toHaveBeenCalled();expect(hrApi.recruitmentCandidates).not.toHaveBeenCalled();expect(screen.getByRole("button",{name:"保存候选人"})).toBeDisabled();expect(screen.getByRole("button",{name:"保存入职申请草稿"})).toBeDisabled();
});
it("context changes clear selection and form fields",async()=>{
 const {rerender}=render(<HrRecruitmentClient/>);fireEvent.click(await screen.findByRole("button",{name:"选择 合成人员1 · C-1"}));fireEvent.change(screen.getByLabelText("申请名称"),{target:{value:"旧作用域草稿"}});auth.user={...auth.user,id:"other"};rerender(<HrRecruitmentClient/>);
 await screen.findByRole("button",{name:"选择 合成人员1 · C-1"});expect(screen.getByLabelText("申请名称")).toHaveValue("");expect(within(screen.getByRole("group",{name:"预入职人员选择"})).queryByText(/已选：/)).toBeNull();
});
it("retains a rejected recruitment requisition draft and resets only on successful publication",async()=>{
 auth.user.permissions.push("hr:requisition:manage");vi.mocked(hrApi.createRecruitmentRequisition).mockRejectedValueOnce(new Error("合成需求发布失败")).mockResolvedValueOnce(req(50));
 render(<HrRecruitmentClient/>);await screen.findByRole("button",{name:"选择 合成岗位1 · R-1"});const field=screen.getByLabelText("需求编号");fireEvent.change(field,{target:{value:"SYN-NEW"}});const form=field.closest("form")!;fireEvent.submit(form);await screen.findByText("合成需求发布失败");expect(field).toHaveValue("SYN-NEW");
 fireEvent.submit(form);await screen.findByText("招聘需求已发布，可继续录入候选人。");expect(field).toHaveValue("");
});
it("retains the failed conversion draft before resuming onboarding",async()=>{
 auth.user.permissions.push("hr:candidate:convert");vi.mocked(hrApi.recruitmentCandidates).mockImplementation(async(_token,page=1,_size,filters)=>list(filters?.stage==="hired"?[candidate(1)]:[{...candidate(2),stage:"offer",convertedEmployeeId:null}],1,page));vi.mocked(hrApi.convertRecruitmentCandidate).mockRejectedValueOnce(new Error("合成转入失败"));
 render(<HrRecruitmentClient/>);fireEvent.click(await screen.findByRole("button",{name:"下一动作"}));const field=screen.getByLabelText("员工编号");fireEvent.change(field,{target:{value:"SYN-E2"}});fireEvent.submit(field.closest("form")!);await screen.findByText("合成转入失败");expect(field).toHaveValue("SYN-E2");expect(hrApi.convertRecruitmentCandidate).toHaveBeenCalledWith("candidate-2",expect.objectContaining({employeeCode:"SYN-E2"}),"synthetic-token");
});
it("keeps edited onboarding values after a rejected update",async()=>{
 vi.mocked(hrApi.onboardingApplications).mockResolvedValue(list([application]));vi.mocked(hrApi.updateOnboardingApplication).mockRejectedValueOnce(new Error("合成修改失败"));render(<HrRecruitmentClient/>);fireEvent.click(await screen.findByRole("button",{name:"编辑"}));const form=screen.getByRole("button",{name:"保存修改"}).closest("form")!;const field=within(form).getByLabelText("申请名称");fireEvent.change(field,{target:{value:"修改草稿保留"}});fireEvent.submit(form);await screen.findByText("合成修改失败");expect(field).toHaveValue("修改草稿保留");expect(hrApi.updateOnboardingApplication).toHaveBeenCalledWith("application",expect.objectContaining({applicationName:"修改草稿保留",employeeId:"employee-101",candidateId:"candidate-101"}),"synthetic-token");
});
it.each(["wrongPage","badLabel","badEmployee","oversized","badTotal"])("rejects unusable option payload: %s",async(kind)=>{
 const row=candidate(1),value=list([row],1,1);
 if(kind==="wrongPage")value.page=2;
 if(kind==="badLabel")Object.assign(row,{fullName:{invalid:true}});
 if(kind==="badEmployee")Object.assign(row,{convertedEmployeeId:{invalid:true}});
 if(kind==="oversized")value.items=Array.from({length:21},(_,index)=>candidate(index));
 if(kind==="badTotal")value.total=-1;
 vi.mocked(hrApi.recruitmentCandidates).mockResolvedValue(value);render(<RecruitmentReferencePicker kind="candidate" canRead selected={null} onChange={vi.fn()}/>);await screen.findByText("业务选择响应无效，请重试。");expect(screen.queryByRole("button",{name:/^选择 /})).toBeNull();
});
