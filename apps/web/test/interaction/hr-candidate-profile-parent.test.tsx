import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {expect,it,vi} from "vitest";
import {HrRecruitmentClient} from "../../app/hr/recruitment/HrRecruitmentClient";
import {hrApi} from "../../lib/hr-api";
const gate=vi.hoisted(()=>({attempt:()=>{},sensitive:false,saved:null as unknown}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>({id:"hr",permissions:["hr:recruitment","hr:candidate:read","hr:candidate:stage",...(gate.sensitive?["hr:candidate:sensitive_read"]:[])],enabled_modules:[{module_code:"hr"}]})}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../app/hr/recruitment/CandidateInterviews",()=>({CandidateInterviews:()=>null}));
vi.mock("../../app/hr/recruitment/CandidateAssessment",()=>({CandidateAssessment:()=>null}));
vi.mock("../../app/hr/recruitment/CandidateStageHistory",()=>({CandidateStageHistory:()=>null}));
vi.mock("../../app/hr/recruitment/CandidateProfile",()=>({CandidateProfile:({candidateId,onBusyChange,onSaved}:{candidateId:string;onBusyChange:(busy:boolean)=>void;onSaved:(row:unknown)=>void})=><><button onClick={()=>{onBusyChange(true);gate.attempt();}}>开始合成资料保存 {candidateId}</button><button onClick={()=>onSaved(gate.saved)}>发布合成资料回执</button></>}));
vi.mock("../../lib/hr-api",()=>({hrApi:{recruitmentCandidates:vi.fn(),moveRecruitmentCandidate:vi.fn(),recruitmentCandidateDetail:vi.fn()}}));
it("synchronously blocks parent refresh close selection and stage writes from the same child-save event",async()=>{
 vi.mocked(hrApi.recruitmentCandidates).mockResolvedValue({items:[1,2].map(n=>({id:`candidate-${n}`,candidateNo:`SYN-${n}`,fullName:`合成候选人${n}`,stage:"screening",requisitionId:"req",requisitionTitle:"合成需求",source:null,expectedOnboardDate:null,latestEvaluation:null,mobileMasked:null,emailMasked:null,identityMasked:null,convertedEmployeeId:null})),total:2,page:1,page_size:20});
 render(<HrRecruitmentClient/>);await screen.findByText(/合成候选人1/);fireEvent.click(screen.getAllByRole("button",{name:"下一动作"})[0]!);await screen.findByRole("button",{name:"开始合成资料保存 candidate-1"});
 const refresh=screen.getByRole("button",{name:"刷新"}),close=screen.getByRole("button",{name:"关闭"}),next=screen.getAllByRole("button",{name:"下一动作"})[1]!,move=screen.getByRole("button",{name:"面试"});
 const reads=vi.mocked(hrApi.recruitmentCandidates).mock.calls.length;
 gate.attempt=()=>{fireEvent.click(refresh);fireEvent.click(close);fireEvent.click(next);fireEvent.click(move);};
 fireEvent.click(screen.getByRole("button",{name:"开始合成资料保存 candidate-1"}));
 await waitFor(()=>expect(refresh).toBeDisabled());expect(screen.getByRole("button",{name:"开始合成资料保存 candidate-1"})).toBeInTheDocument();expect(hrApi.recruitmentCandidates).toHaveBeenCalledTimes(reads);expect(hrApi.moveRecruitmentCandidate).not.toHaveBeenCalled();
});

it("does not let a late selected-candidate detail overwrite a committed contact projection",async()=>{
 gate.sensitive=true;let resolve!:(v:Awaited<ReturnType<typeof hrApi.recruitmentCandidateDetail>>)=>void;
 const candidate={id:'candidate-1',candidateNo:'C1',fullName:'合成候选人',stage:'screening',requisitionId:'req',requisitionTitle:'需求',source:null,expectedOnboardDate:null,latestEvaluation:null,mobileMasked:null,emailMasked:null,identityMasked:null,convertedEmployeeId:null};
 vi.mocked(hrApi.recruitmentCandidates).mockResolvedValue({items:[candidate],total:1,page:1,page_size:20});vi.mocked(hrApi.recruitmentCandidateDetail).mockReturnValue(new Promise(r=>{resolve=r;}));
 gate.saved={...candidate,version:2,updatedAt:'2026-10-11T01:00:00Z',sensitiveAvailable:true,mobile:'13800000002',email:null,identityNumber:null};
 render(<HrRecruitmentClient/>);await screen.findByText(/合成候选人 ·/);fireEvent.click(screen.getByRole('button',{name:'下一动作'}));fireEvent.click(await screen.findByRole('button',{name:'发布合成资料回执'}));await screen.findByText('电话：13800000002');resolve({...candidate,mobile:'13800000001',email:null,identityNumber:null});await waitFor(()=>expect(screen.getByText('电话：13800000002')).toBeInTheDocument());expect(screen.queryByText('电话：13800000001')).not.toBeInTheDocument();gate.sensitive=false;
});
