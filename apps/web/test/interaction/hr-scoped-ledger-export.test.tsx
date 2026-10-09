import {act,fireEvent,render,screen} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {ScopedLedgerExport} from "../../app/hr/ScopedLedgerExport";
import {downloadCsv} from "../../lib/scoped-csv-export";
import type * as CsvModule from "../../lib/scoped-csv-export";
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../lib/scoped-csv-export",async()=>({...await vi.importActual<typeof CsvModule>("../../lib/scoped-csv-export"),downloadCsv:vi.fn()}));
const page=(p:number,size:number,total=101)=>({page:p,page_size:size,total,items:Array.from({length:Math.min(size,Math.max(0,total-(p-1)*size))},(_,i)=>({id:String((p-1)*size+i)}))});
const fetchPage=vi.fn(async(p:number,size:number,_signal:AbortSignal,_token?:string)=>page(p,size));
const props={contextKey:"synthetic-scope",enabled:true,label:"合同",fetchPage,serialize:(rows:readonly {id:string}[])=>rows.map(r=>r.id).join(","),fileName:"合成.csv"};
beforeEach(()=>{vi.clearAllMocks();fetchPage.mockImplementation(async(p,size)=>page(p,size));});
it("exports every page once with a synchronous duplicate guard and fixed token",async()=>{
 render(<ScopedLedgerExport {...props}/>);const button=screen.getByRole("button",{name:"导出筛选合同"});act(()=>{button.click();button.click();});
 await screen.findByText("已导出 101 条匹配合同。");expect(fetchPage.mock.calls.map(c=>c[0])).toEqual([1,2,1]);expect(fetchPage.mock.calls.every(c=>c[1]===100&&c[2] instanceof AbortSignal&&c[3]==="synthetic-token")).toBe(true);expect(downloadCsv).toHaveBeenCalledExactlyOnceWith(Array.from({length:101},(_,i)=>i).join(","),"合成.csv");
});
it.each(["failure","drift","limit"])("never produces a partial file after %s and permits deliberate retry",async mode=>{
 fetchPage.mockImplementation(async(p,size)=>{if(mode==="limit")return page(p,size,5001);if(p===2){if(mode==="failure")throw new Error("合成失败");return page(p,size,102);}return page(p,size);});
 render(<ScopedLedgerExport {...props}/>);fireEvent.click(screen.getByRole("button",{name:"导出筛选合同"}));await screen.findByText(mode==="failure"?"合成失败":mode==="limit"?/超过 5000/:/发生变化/);expect(downloadCsv).not.toHaveBeenCalled();fetchPage.mockImplementation(async(p,size)=>page(p,size,0));fireEvent.click(screen.getByRole("button",{name:"导出筛选合同"}));await screen.findByText("已导出 0 条匹配合同。");expect(downloadCsv).toHaveBeenCalledTimes(1);
});
it.each(["context","disabled","unmount"])("late response cannot download after %s",async mode=>{
 let finish!:(value:ReturnType<typeof page>)=>void;fetchPage.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const view=render(<ScopedLedgerExport {...props}/>);fireEvent.click(screen.getByRole("button",{name:"导出筛选合同"}));const signal=fetchPage.mock.calls[0]![2];
 if(mode==="context")view.rerender(<ScopedLedgerExport {...props} contextKey="other-scope"/>);else if(mode==="disabled")view.rerender(<ScopedLedgerExport {...props} enabled={false}/>);else view.unmount();expect(signal.aborted).toBe(true);await act(async()=>finish(page(1,100,1)));expect(downloadCsv).not.toHaveBeenCalled();expect(fetchPage).toHaveBeenCalledTimes(1);
});
