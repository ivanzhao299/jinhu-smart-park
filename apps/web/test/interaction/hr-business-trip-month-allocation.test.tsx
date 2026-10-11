import {StrictMode,useState} from "react";
import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {BusinessTripMonthAllocationPanel} from "../../app/hr/attendance/BusinessTripMonthAllocationPanel";
import type {HrAttendanceRequest,HrBusinessTripMonthAllocationSnapshot} from "../../lib/hr-api";
import {ApiError} from "../../lib/api-client";

let token="scope-a";
const api=vi.hoisted(()=>({businessTripMonthAllocation:vi.fn(),allocateBusinessTripMonth:vi.fn(),businessTripMonthAllocationHistory:vi.fn()}));
vi.mock("../../lib/hr-api",()=>({hrApi:api}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>token}));
const row:HrAttendanceRequest={id:"trip-1",requestNo:"TRIP-SYN",requestType:"business_trip",status:"approved",amendVersion:2,declaredDays:5,legacyDeclaredDays:null,startAt:"2026-07-10T00:00:00.000Z",endAt:"2026-08-10T00:00:00.000Z",attendanceDate:null,durationMinutes:0,leavePlannedMinutes:0,leaveEffectiveMinutes:0,leaveDayCount:0,reason:"合成",submittedAt:null,reviewedAt:null,reviewComment:null,organizationName:null,isSelf:false};
const months=["2026-07","2026-08"];
const snapshot=(overrides:Partial<HrBusinessTripMonthAllocationSnapshot>={}):HrBusinessTripMonthAllocationSnapshot=>({id:row.id,amendVersion:row.amendVersion!,declaredDays:5,startAt:row.startAt,endAt:row.endAt,months,availability:"ready",unavailableReason:null,currentAllocation:null,...overrides});
const saved=vi.fn();
function Harness({request=row}:{request?:HrAttendanceRequest}){const[busy,setBusy]=useState(false);return <BusinessTripMonthAllocationPanel key={`${request.id}:${request.amendVersion}`} row={request} busy={busy} onBusyChange={setBusy} onSaved={saved}/>;}
function open(){fireEvent.click(screen.getByRole("button",{name:"查看跨月申报分配"}));}
function editAndFill(values=["3","2"]){fireEvent.click(screen.getByRole("button",{name:"登记跨月天数"}));months.forEach((month,i)=>fireEvent.change(screen.getByLabelText(`${month}申报天数`),{target:{value:values[i]}}));fireEvent.change(screen.getByLabelText("登记原因"),{target:{value:"经业务核对"}});}
function form(){return screen.getByRole("form",{name:"登记出差跨月申报天数"});}
beforeEach(()=>{token="scope-a";vi.resetAllMocks();saved.mockResolvedValue(undefined);api.businessTripMonthAllocation.mockResolvedValue(snapshot());api.allocateBusinessTripMonth.mockResolvedValue({id:row.id,amendVersion:3,allocation:{id:"allocation-3",requestVersion:3,declaredDays:5,allocations:[{month:"2026-07",days:3},{month:"2026-08",days:2}],reason:"经业务核对",createdAt:"2026-10-12T00:00:00.000Z"}});api.businessTripMonthAllocationHistory.mockResolvedValue({items:[],total:0,page:1,page_size:20});});

it("loads only on demand and submits exactly the server month set and declared total",async()=>{
 render(<StrictMode><Harness/></StrictMode>);expect(api.businessTripMonthAllocation).not.toHaveBeenCalled();open();await screen.findByText("当前版本尚无跨月登记。");expect(api.businessTripMonthAllocation).toHaveBeenCalledTimes(1);editAndFill();fireEvent.submit(form());await screen.findByText(/跨月申报天数已登记/);
 expect(api.allocateBusinessTripMonth).toHaveBeenCalledTimes(1);expect(api.allocateBusinessTripMonth.mock.calls[0]?.slice(0,3)).toEqual([row.id,{expectedVersion:2,reason:"经业务核对",allocations:[{month:"2026-07",days:3},{month:"2026-08",days:2}]},"scope-a"]);expect(saved).toHaveBeenCalledWith({id:row.id,declaredDays:5,amendVersion:3});
});
it("requires an exact integer total and preserves explicit zero allocations",async()=>{
 api.allocateBusinessTripMonth.mockResolvedValueOnce({id:row.id,amendVersion:3,allocation:{id:"allocation-3",requestVersion:3,declaredDays:5,allocations:[{month:"2026-07",days:0},{month:"2026-08",days:5}],reason:"经业务核对",createdAt:"2026-10-12T00:00:00.000Z"}});render(<Harness/>);open();await screen.findByText("当前版本尚无跨月登记。");editAndFill(["0","4"]);fireEvent.submit(form());await screen.findByRole("alert");expect(api.allocateBusinessTripMonth).not.toHaveBeenCalled();fireEvent.change(screen.getByLabelText("2026-08申报天数"),{target:{value:"5"}});fireEvent.submit(form());await screen.findByText(/跨月申报天数已登记/);expect(api.allocateBusinessTripMonth.mock.calls[0]?.[1].allocations).toEqual([{month:"2026-07",days:0},{month:"2026-08",days:5}]);
});
it("shows server correction requirements without creating a guessed allocation",async()=>{
 api.businessTripMonthAllocation.mockResolvedValue(snapshot({availability:"needs_correction",declaredDays:null,months:[],unavailableReason:"出差起止时间待核对"}));render(<Harness request={{...row,declaredDays:null}}/>);open();await screen.findByText(/出差起止时间待核对/);expect(screen.queryByRole("button",{name:"登记跨月天数"})).toBeNull();expect(api.allocateBusinessTripMonth).not.toHaveBeenCalled();
});
it("preserves a negative legacy declaration only under the server correction explanation",async()=>{
 api.businessTripMonthAllocation.mockResolvedValue(snapshot({declaredDays:-2,availability:"needs_correction",months:[],unavailableReason:"原申报数量需核对"}));render(<Harness request={{...row,declaredDays:-2}}/>);open();await screen.findByText((_,element)=>element?.tagName==="STRONG"&&element.textContent?.includes("当前申报 -2 天")===true);expect(screen.getByText(/原申报数量需核对/)).toBeInTheDocument();expect(screen.queryByRole("button",{name:"登记跨月天数"})).toBeNull();
});
it("keeps the exact body and request key after an uncertain result",async()=>{
 api.allocateBusinessTripMonth.mockRejectedValueOnce(new Error("合成网络中断"));render(<Harness/>);open();await screen.findByText("当前版本尚无跨月登记。");editAndFill();fireEvent.submit(form());await screen.findByText("合成网络中断");expect(screen.getByLabelText("登记原因")).toBeDisabled();const first=api.allocateBusinessTripMonth.mock.calls[0];fireEvent.submit(form());await screen.findByText(/跨月申报天数已登记/);expect(api.allocateBusinessTripMonth.mock.calls[1]).toEqual(first);
});
it("requires a fresh server snapshot after version conflict and uses its current version",async()=>{
 api.allocateBusinessTripMonth.mockRejectedValueOnce(new ApiError("版本冲突",409));api.allocateBusinessTripMonth.mockResolvedValueOnce({id:row.id,amendVersion:4,allocation:{id:"allocation-4",requestVersion:4,declaredDays:6,allocations:[{month:"2026-07",days:4},{month:"2026-08",days:2}],reason:"版本刷新后核对",createdAt:"2026-10-12T00:00:00.000Z"}});const{rerender}=render(<Harness/>);open();await screen.findByText("当前版本尚无跨月登记。");editAndFill();fireEvent.submit(form());await screen.findByText(/出差版本已变化，请刷新月份/);expect(api.allocateBusinessTripMonth).toHaveBeenCalledTimes(1);api.businessTripMonthAllocation.mockResolvedValueOnce(snapshot({amendVersion:3,declaredDays:6}));fireEvent.click(screen.getByRole("button",{name:"刷新月份与分配事实"}));await screen.findByText(/刷新出差申请后重新登记/);expect(api.allocateBusinessTripMonth).toHaveBeenCalledTimes(1);api.businessTripMonthAllocation.mockResolvedValueOnce(snapshot({amendVersion:3,declaredDays:6}));rerender(<Harness request={{...row,amendVersion:3,declaredDays:6}}/>);open();await screen.findByText("当前版本尚无跨月登记。");editAndFill(["4","2"]);fireEvent.change(screen.getByLabelText("登记原因"),{target:{value:"版本刷新后核对"}});fireEvent.submit(form());await screen.findByText(/跨月申报天数已登记/);expect(api.allocateBusinessTripMonth.mock.calls[1]?.[1].expectedVersion).toBe(3);
});
it("keeps an untrusted mismatched receipt bound to the original request",async()=>{
 api.allocateBusinessTripMonth.mockResolvedValueOnce({id:row.id,amendVersion:3,allocation:{id:"allocation-3",requestVersion:3,declaredDays:5,allocations:[{month:"2026-07",days:2},{month:"2026-08",days:3}],reason:"经业务核对",createdAt:"2026-10-12T00:00:00.000Z"}});render(<Harness/>);open();await screen.findByText("当前版本尚无跨月登记。");editAndFill();fireEvent.submit(form());await screen.findByText(/逐月数量不匹配/);expect(saved).not.toHaveBeenCalled();const first=api.allocateBusinessTripMonth.mock.calls[0];fireEvent.submit(form());await screen.findByText(/跨月申报天数已登记/);expect(api.allocateBusinessTripMonth.mock.calls[1]).toEqual(first);
});
it("validates and pages allocation history",async()=>{
 api.businessTripMonthAllocationHistory.mockResolvedValueOnce({items:Array.from({length:20},(_,i)=>({id:`h${i}`,requestVersion:2,declaredDays:5,allocations:[{month:"2026-07",days:3},{month:"2026-08",days:2}],reason:"合成历史",createdAt:"2026-10-12T00:00:00.000Z"})),total:21,page:1,page_size:20});render(<Harness/>);fireEvent.click(screen.getByRole("button",{name:"查看分配历史"}));await screen.findByText("第 1 / 2 页 · 共 21 条");expect(screen.getAllByText("2026-07 3 天 · 2026-08 2 天")).toHaveLength(20);fireEvent.click(screen.getByRole("button",{name:"分配历史下一页"}));await waitFor(()=>expect(api.businessTripMonthAllocationHistory.mock.calls[1]?.slice(0,4)).toEqual([row.id,"scope-a",2,20]));
});
it("ignores snapshot reads that finish after unmount",async()=>{
 let finish:(value:unknown)=>void=()=>{};api.businessTripMonthAllocation.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const{unmount}=render(<Harness/>);open();await waitFor(()=>expect(api.businessTripMonthAllocation).toHaveBeenCalledTimes(1));unmount();await act(async()=>finish(snapshot()));expect(screen.queryByText("当前版本尚无跨月登记。")).toBeNull();
});
