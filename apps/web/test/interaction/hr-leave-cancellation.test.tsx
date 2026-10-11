import {StrictMode} from "react";
import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {LeaveCancellationPanel} from "../../app/hr/attendance/LeaveCancellationPanel";
import type {HrLeaveCancellationRecord,HrLeaveCancellationSource} from "@jinhu/shared";
const api=vi.hoisted(()=>({list:vi.fn(),sources:vi.fn(),history:vi.fn(),create:vi.fn(),update:vi.fn(),act:vi.fn()}));
vi.mock("../../lib/hr-leave-cancellation-api",()=>({leaveCancellationApi:api}));
let token="scope-a";vi.mock("../../lib/authz",()=>({getAccessToken:()=>token}));
const source:HrLeaveCancellationSource={id:"source1",requestNo:"LEAVE-01",startAt:"2026-07-01T01:00:00Z",endAt:"2026-07-01T09:00:00Z",version:3};
const row:HrLeaveCancellationRecord={id:"cancel1",cancellationNo:"LC-01",sourceRequestId:source.id,sourceRequestNo:source.requestNo,sourceRequestVersion:3,startAt:source.startAt,endAt:source.endAt,reason:"提前返岗",status:"draft",version:2,isSelf:true,actions:{edit:true,submit:true,withdraw:true,approve:false,return:false}};
beforeEach(()=>{vi.resetAllMocks();token="scope-a";api.sources.mockResolvedValue({items:[source],total:1,page:1,page_size:20});api.list.mockResolvedValue({items:[row],total:1,page:1,page_size:20});api.history.mockResolvedValue({items:[],total:0,page:1,page_size:20});api.create.mockResolvedValue({...row,version:1});api.update.mockResolvedValue({...row,version:3});api.act.mockResolvedValue({...row,status:"submitted",version:3});});
async function open(canCreate=true,onChanged?:()=>Promise<void>){render(<StrictMode><LeaveCancellationPanel canCreate={canCreate} onChanged={onChanged}/></StrictMode>);fireEvent.click(screen.getByRole("button",{name:"打开销假办理"}));await screen.findByRole("button",{name:"查看销假历史"});}
it("loads only when explicitly opened, with operation-authorized sources and server-authorized actions",async()=>{
 render(<LeaveCancellationPanel canCreate={false}/>);expect(api.list).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"打开销假办理"}));await screen.findByRole("button",{name:"修改销假"});expect(api.sources).not.toHaveBeenCalled();expect(screen.queryByRole("button",{name:"批准销假"})).toBeNull();
});
it("retains failed draft and retries the exact source version/time/body/key, preventing duplicate submit",async()=>{
 await open();fireEvent.click(screen.getByRole("button",{name:"为此请假申请销假"}));fireEvent.change(screen.getByLabelText("销假原因"),{target:{value:"提前返岗"}});
 let reject:(e:Error)=>void=()=>{};api.create.mockImplementationOnce(()=>new Promise((_,failure)=>{reject=failure;}));
 fireEvent.click(screen.getByRole("button",{name:"保存销假草稿"}));expect(screen.getByRole("button",{name:"收起销假办理"})).toBeDisabled();expect(api.create).toHaveBeenCalledTimes(1);
 await act(async()=>reject(new Error("network unknown")));expect(screen.getByLabelText("销假原因")).toHaveValue("提前返岗");fireEvent.click(screen.getByRole("button",{name:"保存销假草稿"}));await screen.findByText("销假办理已保存。");expect(api.create.mock.calls[0]).toEqual(api.create.mock.calls[1]);expect(api.create.mock.calls[0]?.[0]).toMatchObject({sourceRequestId:"source1",expectedSourceVersion:3,startAt:"2026-07-01T09:00:00+08:00",endAt:"2026-07-01T17:00:00+08:00"});
});
it("retains confirmed success after related ledger refresh fails and never repeats the write",async()=>{
 await open(true,async()=>{throw new Error("refresh unavailable");});fireEvent.click(screen.getByRole("button",{name:"提交销假"}));fireEvent.click(screen.getByRole("button",{name:"确认办理"}));await screen.findByText("销假办理已保存。");await screen.findByRole("alert");expect(screen.queryByRole("button",{name:"确认办理"})).toBeNull();expect(api.act).toHaveBeenCalledTimes(1);
});
it("keeps list/source failure distinct and prevents creating from failed source reads",async()=>{
 api.sources.mockRejectedValue(new Error("source unavailable"));await open();await screen.findByRole("alert");expect(screen.queryByRole("button",{name:"为此请假申请销假"})).toBeNull();expect(screen.getByRole("button",{name:"修改销假"})).toBeEnabled();api.sources.mockResolvedValue({items:[source],total:1,page:1,page_size:20});fireEvent.click(screen.getByRole("button",{name:"重新读取可销假请假"}));await screen.findByRole("button",{name:"为此请假申请销假"});
});
it("pages complete sources, cancellation records and history independently, including reviewer comments",async()=>{
 api.sources.mockImplementation((page:number)=>Promise.resolve({items:[{...source,requestNo:`SOURCE-PAGE-${page}`}],total:21,page,page_size:20}));api.list.mockImplementation((page:number)=>Promise.resolve({items:[{...row,sourceRequestNo:`RECORD-PAGE-${page}`}],total:21,page,page_size:20}));api.history.mockImplementation((id:string,page:number)=>Promise.resolve({items:[{version:page===1?21:1,status:"returned",startAt:source.startAt,endAt:source.endAt,reason:`历史第${page}页`,action:"return",comment:"核实返岗时间",actorName:"合成审批人",recordedAt:source.startAt}],total:21,page,page_size:20}));
 await open();fireEvent.click(screen.getByRole("button",{name:"请假来源下一页"}));await screen.findByText(/SOURCE-PAGE-2/);expect(screen.getByText(/RECORD-PAGE-1/)).toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"销假记录下一页"}));await screen.findByText(/RECORD-PAGE-2/);fireEvent.click(screen.getByRole("button",{name:"查看销假历史"}));await screen.findByText("历史第1页");expect(screen.getByText("办理意见：核实返岗时间")).toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"销假历史下一页"}));await screen.findByText("历史第2页");expect(screen.queryByText("历史第1页")).toBeNull();
});
it("refuses mutation after the current login changes without a render",async()=>{
 await open();fireEvent.click(screen.getByRole("button",{name:"提交销假"}));token="scope-b";fireEvent.click(screen.getByRole("button",{name:"确认办理"}));await screen.findByText(/登录状态已变化/);expect(api.act).not.toHaveBeenCalled();
});
it("rejects blank return comments before transport and sends the captured version on approval",async()=>{
 api.list.mockResolvedValue({items:[{...row,status:"submitted",actions:{edit:false,submit:false,withdraw:false,approve:true,return:true}}],total:1,page:1,page_size:20});await open(false);fireEvent.click(screen.getByRole("button",{name:"退回销假"}));fireEvent.change(screen.getByLabelText("办理意见"),{target:{value:" "}});fireEvent.click(screen.getByRole("button",{name:"确认办理"}));await screen.findByText("请填写退回原因。");expect(api.act).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"返回记录"}));fireEvent.click(screen.getByRole("button",{name:"批准销假"}));fireEvent.click(screen.getByRole("button",{name:"确认办理"}));await waitFor(()=>expect(api.act).toHaveBeenCalledWith("cancel1",{expectedVersion:2,action:"approve"},"scope-a",expect.any(String)));
});
it("discards responses that complete after a newer source search",async()=>{
 await open();let finish:(v:unknown)=>void=()=>{};api.sources.mockImplementationOnce(()=>new Promise(done=>{finish=done;}));fireEvent.change(screen.getByLabelText("搜索可销假请假"),{target:{value:"old"}});api.sources.mockResolvedValue({items:[{...source,requestNo:"CURRENT-SEARCH"}],total:1,page:1,page_size:20});fireEvent.change(screen.getByLabelText("搜索可销假请假"),{target:{value:"current"}});await screen.findByText(/CURRENT-SEARCH/);await act(async()=>finish({items:[{...source,requestNo:"STALE-SEARCH"}],total:1,page:1,page_size:20}));expect(screen.queryByText(/STALE-SEARCH/)).toBeNull();
});
