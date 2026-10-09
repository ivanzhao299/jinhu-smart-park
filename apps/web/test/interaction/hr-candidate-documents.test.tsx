import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {HR_PERMISSIONS,SYSTEM_PERMISSIONS,type FileRecord,type ApiResponse} from "@jinhu/shared";
import {CandidateDocuments} from "../../app/hr/recruitment/CandidateDocuments";
import {HrRecruitmentClient} from "../../app/hr/recruitment/HrRecruitmentClient";
import {apiFormRequest,apiRequest} from "../../lib/api-client";
import {hrApi,type HrCandidate} from "../../lib/hr-api";
const base=["hr:recruitment","hr:candidate:read"];
const auth=vi.hoisted(()=>({user:{id:"hr",permissions:[] as string[],enabled_modules:[{module_code:"hr"}]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>auth.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../lib/api-client",()=>({apiRequest:vi.fn(),apiFormRequest:vi.fn(),API_PREFIX:"/synthetic-api",ApiError:class extends Error{},createIdempotencyKey:()=>"synthetic-key"}));
vi.mock("../../lib/hr-api",()=>({hrApi:{recruitmentCandidates:vi.fn()}}));
vi.mock("../../features/property-shared/offline/use-property-upload-queue",()=>({usePropertyUploadQueue:()=>({context:null,enabled:false,consent:false,uiState:{visible:false},items:[],captureGeneration:()=>null})}));
const response=<T,>(data:T):ApiResponse<T>=>({code:0,message:"ok",data,request_id:"synthetic",server_time:0});
const file=(id="file-1",name="合成简历.pdf"):FileRecord=>({id,tenantId:"synthetic",parkId:"synthetic",fileCode:id,originalName:name,storedName:name,fileUrl:"/synthetic",fileSize:"100",mimeType:"application/pdf",md5:"synthetic",bizType:"hr_candidate_resume",bizId:"candidate-1",storageType:"local",storageBucket:null,storagePath:"synthetic",isEncrypted:false,status:1,remark:null,createTime:"2026-10-09",updateTime:"2026-10-09"});
const candidate=(n:number):HrCandidate=>({id:`candidate-${n}`,candidateNo:`C-${n}`,fullName:`合成候选人${n}`,requisitionId:"req",requisitionTitle:"合成岗位",stage:"screening",source:null,expectedOnboardDate:null,latestEvaluation:null,mobileMasked:null,emailMasked:null,identityMasked:null,convertedEmployeeId:null});
const documentPermissions=[HR_PERMISSIONS.HR_RECRUITMENT_DOCUMENT_READ,HR_PERMISSIONS.HR_RECRUITMENT_DOCUMENT_MANAGE,SYSTEM_PERMISSIONS.FILE_READ,SYSTEM_PERMISSIONS.FILE_UPLOAD,SYSTEM_PERMISSIONS.FILE_DELETE];
beforeEach(()=>{
 vi.resetAllMocks();auth.user={id:"hr",permissions:[...base,...documentPermissions],enabled_modules:[{module_code:"hr"}]};
 vi.mocked(apiRequest).mockImplementation(async()=>response({items:[file()],total:21,page:1,page_size:20}));vi.mocked(apiFormRequest).mockResolvedValue(response(file()));
 vi.mocked(hrApi.recruitmentCandidates).mockResolvedValue({items:[candidate(1),candidate(2)],total:2,page:1,page_size:20});
});
it("recovers both exact candidate material associations and reads page21 without a selection callback",async()=>{
 render(<CandidateDocuments candidateId="candidate-1" disabled={false} uploadBusy={false} onUploadingChange={vi.fn()}/>);await screen.findAllByText("合成简历.pdf");
 expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining("biz_type=hr_candidate_resume&biz_id=candidate-1"),expect.anything());expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining("biz_type=hr_candidate_offer_evidence&biz_id=candidate-1"),expect.anything());
 vi.mocked(apiRequest).mockResolvedValue(response({items:[file("file-21","第二页简历.pdf")],total:21,page:2,page_size:20}));fireEvent.click(screen.getAllByRole("button",{name:"下一页附件"})[0]!);await screen.findByText("第二页简历.pdf");expect(apiRequest).toHaveBeenLastCalledWith(expect.stringContaining("page=2&page_size=20&biz_type=hr_candidate_resume&biz_id=candidate-1"),expect.anything());expect(screen.queryByRole("button",{name:"选用此文件"})).toBeNull();
});
it.each([
 ["domain-only",[HR_PERMISSIONS.HR_RECRUITMENT_DOCUMENT_READ,HR_PERMISSIONS.HR_RECRUITMENT_DOCUMENT_MANAGE],false,false],
 ["file-only",[SYSTEM_PERMISSIONS.FILE_READ,SYSTEM_PERMISSIONS.FILE_UPLOAD],false,false],
 ["read-both",[HR_PERMISSIONS.HR_RECRUITMENT_DOCUMENT_READ,SYSTEM_PERMISSIONS.FILE_READ],true,false],
 ["upload-both",[HR_PERMISSIONS.HR_RECRUITMENT_DOCUMENT_MANAGE,SYSTEM_PERMISSIONS.FILE_UPLOAD],false,true],
] as const)("uses the exact material permission intersections: %s",async(_label,permissions,read,upload)=>{
 auth.user.permissions=[...base,...permissions];render(<CandidateDocuments candidateId="candidate-1" disabled={false} uploadBusy={false} onUploadingChange={vi.fn()}/>);
 await waitFor(()=>expect(apiRequest).toHaveBeenCalledTimes(read?2:0));expect(screen.queryAllByRole("button",{name:"上传"})).toHaveLength(upload?2:0);expect(screen.queryByRole("button",{name:"预览"})).toBeNull();expect(screen.queryByRole("button",{name:"下载"})).toBeNull();expect(screen.queryByRole("button",{name:"删除"})).toBeNull();
});
it("uploads with exact business association and refreshes only the uploaded material type",async()=>{
 const uploading=vi.fn();const {container}=render(<CandidateDocuments candidateId="candidate-1" disabled={false} uploadBusy={false} onUploadingChange={uploading}/>);await screen.findAllByText("合成简历.pdf");await waitFor(()=>expect(apiRequest).toHaveBeenCalledTimes(2));vi.mocked(apiRequest).mockResolvedValueOnce(response({items:[file("refreshed-resume","上传后新简历.pdf")],total:1,page:1,page_size:20}));const input=container.querySelector('input[type="file"]');expect(input).not.toBeNull();fireEvent.change(input!,{target:{files:[new File(["synthetic"],"新简历.pdf",{type:"application/pdf"})]}});fireEvent.click(screen.getAllByRole("button",{name:"上传"})[0]!);await screen.findByText("上传成功");await screen.findByText("上传后新简历.pdf");expect(screen.getAllByText("合成简历.pdf")).toHaveLength(1);
 expect(uploading.mock.calls).toEqual([["hr_candidate_resume",true],["hr_candidate_resume",false]]);const form=vi.mocked(apiFormRequest).mock.calls[0]?.[1].body;expect(form?.get("biz_type")).toBe("hr_candidate_resume");expect(form?.get("biz_id")).toBe("candidate-1");expect(apiRequest).toHaveBeenCalledTimes(3);expect(apiRequest).toHaveBeenLastCalledWith(expect.stringContaining("biz_type=hr_candidate_resume&biz_id=candidate-1"),expect.anything());
});
it("keeps all page actions locked until both concurrent material uploads finish",async()=>{
 let resume:(value:ApiResponse<FileRecord>)=>void=()=>{},offer:(value:ApiResponse<FileRecord>)=>void=()=>{};
 vi.mocked(apiFormRequest).mockImplementationOnce(()=>new Promise(done=>{resume=done})).mockImplementationOnce(()=>new Promise(done=>{offer=done}));
 const {container}=render(<HrRecruitmentClient/>);await screen.findByText("合成候选人1 · 筛选");fireEvent.click(screen.getAllByRole("button",{name:"下一动作"})[0]!);await screen.findAllByText("合成简历.pdf");const inputs=container.querySelectorAll('input[type="file"]');
 fireEvent.change(inputs[0]!,{target:{files:[new File(["resume"],"简历.pdf",{type:"application/pdf"})]}});fireEvent.change(inputs[1]!,{target:{files:[new File(["offer"],"录用.pdf",{type:"application/pdf"})]}});const uploadButtons=screen.getAllByRole("button",{name:"上传"});fireEvent.click(uploadButtons[0]!);fireEvent.click(uploadButtons[1]!);
 expect(screen.getByRole("button",{name:"关闭"})).toBeDisabled();expect(screen.getByRole("button",{name:"刷新"})).toBeDisabled();expect(screen.getAllByRole("button",{name:"删除"}).every(button=>button.hasAttribute("disabled"))).toBe(true);
 await act(async()=>resume(response(file())));expect(screen.getByRole("button",{name:"关闭"})).toBeDisabled();await act(async()=>offer(response(file("offer","录用.pdf"))));await waitFor(()=>expect(screen.getByRole("button",{name:"关闭"})).toBeEnabled());
 fireEvent.click(screen.getAllByRole("button",{name:"下一动作"})[1]!);await waitFor(()=>expect(apiRequest).toHaveBeenLastCalledWith(expect.stringContaining("biz_id=candidate-2"),expect.anything()));
});
it("reopening a candidate recovers server-associated material and account changes remove the old panel",async()=>{
 const {rerender}=render(<HrRecruitmentClient/>);await screen.findByText("合成候选人1 · 筛选");fireEvent.click(screen.getAllByRole("button",{name:"下一动作"})[0]!);await screen.findAllByText("合成简历.pdf");fireEvent.click(screen.getByRole("button",{name:"关闭"}));expect(screen.queryByRole("heading",{name:"简历材料"})).toBeNull();fireEvent.click(screen.getAllByRole("button",{name:"下一动作"})[0]!);await screen.findAllByText("合成简历.pdf");expect(apiRequest).toHaveBeenCalledTimes(4);auth.user={...auth.user,id:"new-user",permissions:[...base]};rerender(<HrRecruitmentClient/>);await screen.findByText("合成候选人1 · 筛选");expect(screen.queryByRole("heading",{name:"简历材料"})).toBeNull();
});
