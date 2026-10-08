import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {TrainingEmployeePicker,type TrainingEmployeeOption} from "../../app/hr/training/TrainingEmployeePicker";
import {HrTrainingClient} from "../../app/hr/training/HrTrainingClient";
import {useState} from "react";
const state=vi.hoisted(()=>({user:{id:"actor",tenant_id:"tenant",park_id:"park",permissions:[] as string[]},api:{trainingEmployeeOptions:vi.fn(),trainingCourseOptions:vi.fn(),trainingCourses:vi.fn(),trainingPlans:vi.fn(),trainingPositionRequirementGaps:vi.fn(),createTrainingPlan:vi.fn(),createTrainingCourse:vi.fn(),trainingRequirementOptions:vi.fn(),trainingPositionRequirements:vi.fn()}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../lib/hr-api",()=>({hrApi:state.api}));
vi.mock("../../components/auth/PermissionGuard",()=>({PermissionGuard:({children}:{children:React.ReactNode})=><>{children}</>}));
const employee=(number:number):TrainingEmployeeOption=>({id:`employee-${number}`,fullName:`合成人员${number}`,employeeCode:`SYN-${number}`});
const response=(items:TrainingEmployeeOption[],total=40,page=1)=>({items,total,page,page_size:20});
function Picker({initial=[]}:{initial?:TrainingEmployeeOption[]}){const [selected,setSelected]=useState(initial);return <form><TrainingEmployeePicker selected={selected} onChange={setSelected}/></form>;}
beforeEach(()=>{Object.values(state.api).forEach(mock=>mock.mockReset());state.user={id:"actor",tenant_id:"tenant",park_id:"park",permissions:[HR_PERMISSIONS.HR_TRAINING_PAGE,HR_PERMISSIONS.HR_TRAINING_PLAN_MANAGE]};state.api.trainingEmployeeOptions.mockImplementation((page:number,keyword:string)=>Promise.resolve(response([employee(keyword?601:page)],40,page)));state.api.trainingCourseOptions.mockResolvedValue({courses:[{id:"course",title:"合成课程",hours:"8"}]});state.api.trainingPlans.mockResolvedValue({items:[],total:0});state.api.trainingPositionRequirementGaps.mockResolvedValue([]);state.api.trainingRequirementOptions.mockResolvedValue({courses:[],positions:[]});state.api.trainingPositionRequirements.mockResolvedValue([]);});
it("keeps unique selections across pages and search, removes them and serializes original employees fields",async()=>{
 const {container}=render(<Picker/>);fireEvent.click(await screen.findByRole("checkbox",{name:"合成人员1 · SYN-1"}));fireEvent.click(screen.getByRole("button",{name:"下一批"}));fireEvent.click(await screen.findByRole("checkbox",{name:"合成人员2 · SYN-2"}));
 fireEvent.change(screen.getByRole("searchbox",{name:"员工搜索"}),{target:{value:"SYN-601"}});fireEvent.click(await screen.findByRole("checkbox",{name:"合成人员601 · SYN-601"}));expect(new FormData(container.querySelector("form")!).getAll("employees")).toEqual(["employee-1","employee-2","employee-601"]);
 fireEvent.click(screen.getByRole("button",{name:"移除 合成人员2 SYN-2"}));expect(new FormData(container.querySelector("form")!).getAll("employees")).toEqual(["employee-1","employee-601"]);
 fireEvent.click(screen.getByRole("checkbox",{name:"合成人员601 · SYN-601"}));fireEvent.click(screen.getByRole("checkbox",{name:"合成人员601 · SYN-601"}));expect(new FormData(container.querySelector("form")!).getAll("employees")).toEqual(["employee-1","employee-601"]);
});
it("reports500 limit and permits removal then replacement",async()=>{
 state.api.trainingEmployeeOptions.mockResolvedValue(response([employee(601)]));const {container}=render(<Picker initial={Array.from({length:500},(_,index)=>employee(index+1))}/>);fireEvent.click(await screen.findByRole("checkbox",{name:"合成人员601 · SYN-601"}));expect(screen.getByRole("alert")).toHaveTextContent("最多选择500");expect(new FormData(container.querySelector("form")!).getAll("employees")).toHaveLength(500);fireEvent.click(screen.getByRole("button",{name:"移除 合成人员1 SYN-1"}));fireEvent.click(screen.getByRole("checkbox",{name:"合成人员601 · SYN-601"}));expect(new FormData(container.querySelector("form")!).getAll("employees")).toHaveLength(500);expect(screen.queryByRole("alert")).toBeNull();
},15000);
it("aborts old queries and ignores stale fulfilled or rejected responses",async()=>{
 let finish:(value:ReturnType<typeof response>)=>void=()=>{};state.api.trainingEmployeeOptions.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const {unmount}=render(<Picker/>);await waitFor(()=>expect(state.api.trainingEmployeeOptions).toHaveBeenCalledTimes(1));const oldSignal=state.api.trainingEmployeeOptions.mock.calls[0]![3] as AbortSignal;fireEvent.change(screen.getByRole("searchbox"),{target:{value:"SYN-601"}});await screen.findByRole("checkbox",{name:"合成人员601 · SYN-601"});expect(oldSignal.aborted).toBe(true);await act(async()=>{finish(response([employee(1)]));});await waitFor(()=>expect(screen.queryByRole("checkbox",{name:"合成人员1 · SYN-1"})).toBeNull());const signal=state.api.trainingEmployeeOptions.mock.calls[1]![3] as AbortSignal;unmount();expect(signal.aborted).toBe(true);
});
it("ignores a stale rejection after a newer successful search",async()=>{
 let rejectOld:(error:Error)=>void=()=>{};state.api.trainingEmployeeOptions.mockImplementationOnce(()=>new Promise((_resolve,reject)=>{rejectOld=reject;}));render(<Picker/>);await waitFor(()=>expect(state.api.trainingEmployeeOptions).toHaveBeenCalledTimes(1));fireEvent.change(screen.getByRole("searchbox"),{target:{value:"SYN-601"}});await screen.findByRole("checkbox",{name:"合成人员601 · SYN-601"});await act(async()=>{rejectOld(new Error("旧请求失败"));});expect(screen.queryByRole("alert")).toBeNull();expect(screen.getByRole("checkbox",{name:"合成人员601 · SYN-601"})).toBeInTheDocument();
});
it("plan-only actor loads candidates and courses without read query; failed create retains draft and selection",async()=>{
 state.api.createTrainingPlan.mockRejectedValue(new Error("合成计划失败"));const {container}=render(<HrTrainingClient/>);await screen.findByRole("option",{name:"合成课程 · 8 学时"});expect(state.api.trainingPlans).not.toHaveBeenCalled();fireEvent.click(await screen.findByRole("checkbox",{name:"合成人员1 · SYN-1"}));const form=screen.getByRole("button",{name:"创建计划"}).closest("form")!;for(const [name,value] of Object.entries({code:"SYN-PLAN",name:"合成计划",course:"course",startDate:"2026-10-08",endDate:"2026-10-09"}))fireEvent.change(form.querySelector(`[name="${name}"]`)!,{target:{value}});fireEvent.submit(form);await waitFor(()=>expect(state.api.createTrainingPlan).toHaveBeenCalledWith(expect.objectContaining({employeeIds:["employee-1"],name:"合成计划"}),"synthetic-token"));await screen.findByText("合成计划失败");expect(form.elements.namedItem("name")).toHaveValue("合成计划");expect(new FormData(form).getAll("employees")).toEqual(["employee-1"]);expect(container.querySelector('select[multiple]')).toBeNull();
});
it("candidate failure preserves plans and courses; complete context change clears forms and choices",async()=>{
 state.user.permissions.push(HR_PERMISSIONS.HR_TRAINING_READ);state.api.trainingPlans.mockResolvedValue({items:[{id:"plan",name:"已有计划",courseTitle:"已有课程",status:"draft",completedCount:0,participantCount:1}],total:1});const {rerender}=render(<HrTrainingClient/>);fireEvent.click(await screen.findByRole("checkbox",{name:"合成人员1 · SYN-1"}));const form=screen.getByRole("button",{name:"创建计划"}).closest("form")!;fireEvent.change(form.querySelector('[name="name"]')!,{target:{value:"旧草稿"}});state.api.trainingEmployeeOptions.mockRejectedValue(new Error("候选不可用"));fireEvent.change(screen.getByRole("searchbox"),{target:{value:"failed"}});await screen.findByText("候选不可用");expect(screen.getByText("已有计划")).toBeInTheDocument();expect(screen.getByRole("option",{name:"合成课程 · 8 学时"})).toBeInTheDocument();expect(screen.getByRole("button",{name:"移除 合成人员1 SYN-1"})).toBeInTheDocument();state.user={...state.user,park_id:"other"};rerender(<HrTrainingClient/>);expect(screen.queryByRole("button",{name:"移除 合成人员1 SYN-1"})).toBeNull();expect(screen.getByRole("button",{name:"创建计划"}).closest("form")!.elements.namedItem("name")).toHaveValue("");
});
it("failed course create retains all fields",async()=>{
 state.user.permissions=[HR_PERMISSIONS.HR_TRAINING_PAGE,HR_PERMISSIONS.HR_TRAINING_COURSE_MANAGE];state.api.trainingCourses.mockResolvedValue([]);state.api.createTrainingCourse.mockRejectedValue(new Error("合成课程失败"));render(<HrTrainingClient/>);const form=screen.getByRole("button",{name:"保存课程"}).closest("form")!;for(const [name,value] of Object.entries({code:"SYN-COURSE",title:"草稿课程",category:"安全",hours:"8"}))fireEvent.change(form.querySelector(`[name="${name}"]`)!,{target:{value}});fireEvent.submit(form);await screen.findByText("合成课程失败");expect(form.elements.namedItem("title")).toHaveValue("草稿课程");expect(form.elements.namedItem("hours")).toHaveValue(8);
});
it.each([
 {items:[{...employee(2),fullName:{private:"invalid"}}]},
 {items:[null]},
 {items:Array.from({length:21},(_,index)=>employee(index+1))},
 {total:Number.NaN},
 {total:-1},
 {page:2},
 {page_size:100},
])("rejects malformed candidate pages while preserving selected employees: %j",async invalid=>{
 state.api.trainingEmployeeOptions.mockResolvedValueOnce({...response([employee(2)]),...invalid}).mockResolvedValue(response([employee(2),employee(2)]));
 const {container}=render(<Picker initial={[employee(1)]}/>);
 expect(await screen.findByRole("alert")).toHaveTextContent("员工候选响应无效");
 expect(screen.queryByRole("checkbox")).toBeNull();expect(new FormData(container.querySelector("form")!).getAll("employees")).toEqual(["employee-1"]);
 fireEvent.click(screen.getByRole("button",{name:"重试员工候选"}));await screen.findByRole("checkbox",{name:"合成人员2 · SYN-2"});expect(screen.getAllByRole("checkbox")).toHaveLength(1);
});
it("course-only operators get requirement course options without read or plan APIs",async()=>{
 state.user.permissions=[HR_PERMISSIONS.HR_TRAINING_PAGE,HR_PERMISSIONS.HR_TRAINING_COURSE_MANAGE];state.api.trainingRequirementOptions.mockResolvedValue({courses:[{id:"required-course",title:"岗位专用课程"}],positions:[]});
 render(<HrTrainingClient/>);await screen.findByRole("option",{name:"岗位专用课程"});
 expect(state.api.trainingCourses).not.toHaveBeenCalled();expect(state.api.trainingCourseOptions).not.toHaveBeenCalled();expect(state.api.trainingPlans).not.toHaveBeenCalled();expect(state.api.trainingEmployeeOptions).not.toHaveBeenCalled();
});
