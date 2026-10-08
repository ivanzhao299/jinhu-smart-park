import {useState} from "react";
import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {ContractEmployeeSelection} from "../../app/hr/contracts/ContractEmployeeSelection";
import {HrContractsClient} from "../../app/hr/contracts/HrContractsClient";
import {hrApi,type HrContractDetail,type HrEmployee} from "../../lib/hr-api";
const state=vi.hoisted(()=>({user:{id:"actor",permissions:["hr:contract:read","hr:contract:manage","hr:employee:read"]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../components/auth/PermissionGuard",()=>({PermissionGuard:({children}:{children:React.ReactNode})=>children}));
vi.mock("../../lib/hr-api",()=>({hrApi:{employees:vi.fn(),contracts:vi.fn(),contract:vi.fn(),contractTypes:vi.fn(),createContract:vi.fn(),updateContract:vi.fn()}}));
const employee=(index:number)=>({id:`employee-${index}`,fullName:`Synthetic ${index}`,employeeCode:`SYN-${index}`,employmentStatus:"active"}) as HrEmployee;
const result=(page=1,items=Array.from({length:20},(_,index)=>employee((page-1)*20+index+1)),total=121)=>({items,page,page_size:20,total});
function Selection(){const [id,setId]=useState("");return <><ContractEmployeeSelection selectedId={id} onChange={setId} disabled={false}/><output aria-label="selected">{id}</output></>;}
beforeEach(()=>{vi.clearAllMocks();state.user={id:"actor",permissions:["hr:contract:read","hr:contract:manage","hr:employee:read"]};vi.mocked(hrApi.employees).mockImplementation(async(_token,page=1)=>result(page));vi.mocked(hrApi.contracts).mockResolvedValue({items:[],page:1,page_size:50,total:0});vi.mocked(hrApi.contractTypes).mockResolvedValue([{id:"type",typeCode:"SYN",typeName:"Synthetic type",isHistoricalImport:false}]);});
it("reads one bounded page and deliberately selects employee101 on page6",async()=>{
 render(<Selection/>);await screen.findByRole("option",{name:"Synthetic 1 · SYN-1"});expect(hrApi.employees).toHaveBeenCalledTimes(1);expect(hrApi.employees).toHaveBeenLastCalledWith("synthetic-token",1,20,{keyword:""},expect.any(AbortSignal));expect(screen.getByLabelText("selected").textContent).toBe("");
 for(let page=2;page<=6;page++){fireEvent.click(screen.getByRole("button",{name:"员工下一页"}));await screen.findByText(`员工目录第 ${page} / 7 页 · 共 121 人`);}
 fireEvent.change(screen.getByLabelText("员工"),{target:{value:"employee-101"}});expect(screen.getByLabelText("selected").textContent).toBe("employee-101");expect(hrApi.employees).toHaveBeenCalledTimes(6);
});
it("searches server-side without changing the deliberate target or submitting the parent form",async()=>{
 const submitted=vi.fn();render(<form onSubmit={event=>{event.preventDefault();submitted();}}><Selection/></form>);await screen.findByRole("option",{name:"Synthetic 1 · SYN-1"});fireEvent.change(screen.getByLabelText("员工"),{target:{value:"employee-1"}});
 vi.mocked(hrApi.employees).mockResolvedValue(result(1,[employee(121)],1));fireEvent.change(screen.getByLabelText("搜索合同员工"),{target:{value:"  SYN-121  "}});fireEvent.keyDown(screen.getByLabelText("搜索合同员工"),{key:"Enter"});await screen.findByRole("option",{name:"Synthetic 121 · SYN-121"});expect(hrApi.employees).toHaveBeenLastCalledWith("synthetic-token",1,20,{keyword:"SYN-121"},expect.any(AbortSignal));expect(screen.getByRole("option",{name:"Synthetic 1 · SYN-1（已选）"})).toBeVisible();expect(screen.getByLabelText("selected").textContent).toBe("employee-1");expect(submitted).not.toHaveBeenCalled();
});
it("prevents new departed/suspended selections and preserves a selected target after load failure",async()=>{
 vi.mocked(hrApi.employees).mockResolvedValue(result(1,[employee(1),{...employee(2),employmentStatus:"departed"},{...employee(3),employmentStatus:"suspended"}],3));render(<Selection/>);await screen.findByRole("option",{name:"Synthetic 1 · SYN-1"});expect(screen.getByRole("option",{name:"Synthetic 2 · SYN-2（已离职）"})).toBeDisabled();fireEvent.change(screen.getByLabelText("员工"),{target:{value:"employee-2"}});expect(screen.getByLabelText("selected").textContent).toBe("");fireEvent.change(screen.getByLabelText("员工"),{target:{value:"employee-1"}});vi.mocked(hrApi.employees).mockRejectedValue(new Error("synthetic request failure"));fireEvent.click(screen.getByRole("button",{name:"搜索员工"}));await screen.findByRole("alert");expect(screen.getByLabelText("selected").textContent).toBe("employee-1");expect(screen.getByRole("option",{name:"Synthetic 1 · SYN-1（已选）"})).toBeVisible();
});
it("discards replaced and unmounted responses",async()=>{
 let resolveFirst!:(value:ReturnType<typeof result>)=>void;vi.mocked(hrApi.employees).mockImplementationOnce(()=>new Promise(resolve=>{resolveFirst=resolve;}));const view=render(<Selection/>);await waitFor(()=>expect(hrApi.employees).toHaveBeenCalledTimes(1));const signal=vi.mocked(hrApi.employees).mock.calls[0]![4]!;fireEvent.change(screen.getByLabelText("搜索合同员工"),{target:{value:"new"}});fireEvent.click(screen.getByRole("button",{name:"搜索员工"}));await screen.findByRole("option",{name:"Synthetic 1 · SYN-1"});expect(signal.aborted).toBe(true);resolveFirst(result(1,[employee(999)],1));await waitFor(()=>expect(screen.queryByRole("option",{name:"Synthetic 999 · SYN-999"})).toBeNull());view.unmount();expect(vi.mocked(hrApi.employees).mock.calls[1]![4]!.aborted).toBe(true);
});
it("keeps an existing contract employee without broad directory permission",async()=>{
 state.user={id:"actor",permissions:["hr:contract:read","hr:contract:manage"]};render(<ContractEmployeeSelection selectedId="employee-9" currentEmployee={employee(9)} onChange={vi.fn()} disabled={false}/>);expect(screen.getByRole("option",{name:"Synthetic 9 · SYN-9（已选）"})).toBeVisible();expect(screen.getByLabelText("员工")).toBeDisabled();expect(hrApi.employees).not.toHaveBeenCalled();
});
it("rejects wrong pagination metadata and reloads page1 when a candidate page disappears",async()=>{
 vi.mocked(hrApi.employees).mockResolvedValueOnce({...result(),page_size:100});render(<Selection/>);await screen.findByRole("alert");expect(screen.queryByRole("option",{name:"Synthetic 1 · SYN-1"})).toBeNull();fireEvent.click(screen.getByRole("button",{name:"搜索员工"}));await screen.findByRole("option",{name:"Synthetic 1 · SYN-1"});vi.mocked(hrApi.employees).mockResolvedValueOnce(result(2,[],1)).mockResolvedValueOnce(result(1,[employee(1)],1));fireEvent.click(screen.getByRole("button",{name:"员工下一页"}));await screen.findByText("员工目录第 1 / 1 页 · 共 1 人");expect(vi.mocked(hrApi.employees).mock.calls.slice(-2).map(call=>call[1])).toEqual([2,1]);
});
it("actual contract page reads no employees until a form opens and clears it on account change",async()=>{
 const view=render(<HrContractsClient/>);await screen.findByRole("button",{name:"新建合同"});await waitFor(()=>expect(hrApi.contractTypes).toHaveBeenCalledTimes(1));expect(hrApi.employees).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"新建合同"}));await screen.findByRole("option",{name:"Synthetic 1 · SYN-1"});fireEvent.change(screen.getByLabelText("员工"),{target:{value:"employee-1"}});const signal=vi.mocked(hrApi.employees).mock.calls[0]![4]!;state.user={id:"another",permissions:["hr:contract:read","hr:contract:manage","hr:employee:read"]};view.rerender(<HrContractsClient/>);expect(screen.queryByLabelText("员工")).toBeNull();expect(screen.queryByText("当前合同员工：Synthetic 1 · SYN-1")).toBeNull();expect(signal.aborted).toBe(true);
});

it("actual contract form requires deliberate target and sends that target to the existing writer",async()=>{
 render(<HrContractsClient/>);fireEvent.click(await screen.findByRole("button",{name:"新建合同"}));await screen.findByRole("option",{name:"Synthetic 1 · SYN-1"});await screen.findByRole("option",{name:"Synthetic type"});fireEvent.submit(screen.getByRole("button",{name:"保存合同草稿"}).closest("form")!);expect(hrApi.createContract).not.toHaveBeenCalled();await screen.findByText("请明确选择员工后保存合同。");fireEvent.change(screen.getByLabelText("员工"),{target:{value:"employee-1"}});fireEvent.change(screen.getByLabelText("合同类型"),{target:{value:"type"}});fireEvent.change(screen.getByLabelText("合同编号"),{target:{value:"SYN-NEW"}});fireEvent.change(screen.getByLabelText("开始日期"),{target:{value:"2090-01-01"}});fireEvent.submit(screen.getByRole("button",{name:"保存合同草稿"}).closest("form")!);await waitFor(()=>expect(hrApi.createContract).toHaveBeenCalledTimes(1));expect(vi.mocked(hrApi.createContract).mock.calls[0]).toEqual([expect.objectContaining({employeeId:"employee-1",contractTypeId:"type",contractNo:"SYN-NEW"}),"synthetic-token"]);
});

it.each(["permission","failure"])("actual edit retains the original employee when directory access is unavailable: %s",async mode=>{
 const contract:HrContractDetail={id:"contract",employeeId:"employee-9",employeeName:"Synthetic 9",employeeCode:"SYN-9",contractTypeId:"type",contractNo:"SYN-EDIT",startDate:"2090-01-01",status:"draft",isHistoricalImport:true,changes:[],actions:[]};
 if(mode==="permission")state.user={id:"actor",permissions:["hr:contract:read","hr:contract:manage"]};
 else vi.mocked(hrApi.employees).mockRejectedValue(new Error("synthetic directory failure"));
 vi.mocked(hrApi.contracts).mockResolvedValue({items:[contract],page:1,page_size:50,total:1});vi.mocked(hrApi.contract).mockResolvedValue(contract);vi.mocked(hrApi.updateContract).mockResolvedValue(contract);
 render(<HrContractsClient/>);fireEvent.click(await screen.findByRole("button",{name:"查看合同"}));fireEvent.click(await screen.findByRole("button",{name:"编辑草稿"}));
 await screen.findByRole("option",{name:"Synthetic type"});if(mode==="failure")await screen.findByRole("alert");else expect(hrApi.employees).not.toHaveBeenCalled();
 expect(screen.getByRole("option",{name:"Synthetic 9 · SYN-9（已选）"})).toBeVisible();expect(screen.getByLabelText("员工")).toHaveValue("employee-9");
 fireEvent.submit(screen.getByRole("button",{name:"保存合同修改"}).closest("form")!);await waitFor(()=>expect(hrApi.updateContract).toHaveBeenCalledTimes(1));expect(vi.mocked(hrApi.updateContract).mock.calls[0]).toEqual(["contract",expect.objectContaining({employeeId:"employee-9",contractTypeId:"type"}),"synthetic-token"]);expect(hrApi.createContract).not.toHaveBeenCalled();
});

it.each(["permission","park"])("actual page cancels pending candidates and discards old responses on %s change",async context=>{
 let finish!:(value:ReturnType<typeof result>)=>void;vi.mocked(hrApi.employees).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const view=render(<HrContractsClient/>);fireEvent.click(await screen.findByRole("button",{name:"新建合同"}));await waitFor(()=>expect(hrApi.employees).toHaveBeenCalledTimes(1));const signal=vi.mocked(hrApi.employees).mock.calls[0]![4]!;
 const change=context==="permission"?{permissions:["hr:contract:read","hr:contract:manage"]}:{park_id:"another-park"};state.user={...state.user,...change};view.rerender(<HrContractsClient/>);
 expect(screen.queryByLabelText("员工")).toBeNull();expect(signal.aborted).toBe(true);await act(async()=>{finish(result(1,[employee(999)],1));});expect(screen.queryByText(/Synthetic 999/)).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"新建合同"}));if(context==="permission"){expect(hrApi.employees).toHaveBeenCalledTimes(1);expect(screen.getByLabelText("员工")).toBeDisabled();}else{await screen.findByRole("option",{name:"Synthetic 1 · SYN-1"});expect(hrApi.employees).toHaveBeenCalledTimes(2);expect(screen.getByLabelText("员工")).toHaveValue("");}
});
