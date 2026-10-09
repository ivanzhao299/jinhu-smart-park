import {act,fireEvent,render,screen,within} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import {HrPayrollClient} from "../../app/hr/payroll/HrPayrollClient";
import {PayrollStatementActions} from "../../app/hr/payroll/PayrollStatementActions";
import {hrApi,type HrPayrollHistoryRow,type HrPayrollHistoryItem} from "../../lib/hr-api";
const state=vi.hoisted(()=>({user:{id:"actor",tenant_id:"tenant",park_id:"park",permissions:[] as string[],enabled_modules:[{module_code:"hr"}]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../lib/hr-api",()=>({hrApi:{payrollHistory:vi.fn(),payrollHistoryDetail:vi.fn(),payrollHistoryItems:vi.fn()}}));
const row:HrPayrollHistoryRow={id:"private-row-id",periodMonth:"2026-07-01",legacyScheme:"private-scheme",bookName:"合成账套",employeeName:"<script>合成姓名</script>",employeeCode:"SYN-1",grossAmount:"9007199254740993.25",deductionAmount:"0.00",taxAmount:null,netAmount:"-12.50",publicationStatus:"published",legacySourceTable:"PRIVATE_SOURCE",mappingStatus:"private-mapping"};
const items:HrPayrollHistoryItem[]=[{id:"private-item-id",itemCode:"出勤天数",displayName:"出勤天数",valueType:"decimal",isSourceNull:false,decimalValue:"21.5000",textValue:null,dateValue:null,sortNo:1},{id:"private-item-2",itemCode:"备注",displayName:"备注",valueType:"text",isSourceNull:false,decimalValue:null,textValue:"<img src=x onerror=alert(1)>",dateValue:null,sortNo:2},{id:"private-item-3",itemCode:"空值",displayName:"空值",valueType:"decimal",isSourceNull:true,decimalValue:null,textValue:null,dateValue:null,sortNo:3}];
const money=(v:string|null)=>v===null?"—":`¥${v}`;
beforeEach(()=>{vi.clearAllMocks();state.user={id:"actor",tenant_id:"tenant",park_id:"park",permissions:[H.HR_PAYROLL_PAGE,H.HR_PAYROLL_HISTORY_READ],enabled_modules:[{module_code:"hr"}]};vi.mocked(hrApi.payrollHistory).mockResolvedValue({items:[row],total:1,page:1,page_size:20});vi.mocked(hrApi.payrollHistoryDetail).mockResolvedValue(row);vi.mocked(hrApi.payrollHistoryItems).mockResolvedValue(items);vi.spyOn(window,"print").mockImplementation(()=>{});});
it("prints only the allowlisted selected statement with exact values, original units and escaped text",()=>{
 render(<PayrollStatementActions row={row} items={items} selfOnly={false} formatMoney={money}/>);
 const paper=screen.getByRole("article",{name:"工资明细打印面"});expect(paper.parentElement).toBe(document.body);expect(paper.classList.contains("print-area")).toBe(true);
 expect(paper.textContent).toContain("2026-07");expect(paper.textContent).toContain("合成账套");expect(paper.textContent).toContain("SYN-1");expect(paper.textContent).toContain("¥9007199254740993.25");expect(paper.textContent).toContain("¥-12.50");expect(paper.textContent).toContain("21.5 天");expect(paper.textContent).toContain("源值为空");expect(paper.textContent).toContain("<script>合成姓名</script>");expect(paper.querySelector("script,img")).toBeNull();
 for(const secret of ["private-row-id","private-item-id","PRIVATE_SOURCE","private-mapping","published"])expect(paper.textContent).not.toContain(secret);
 fireEvent.click(screen.getByRole("button",{name:"打印 / 保存 PDF"}));expect(window.print).toHaveBeenCalledTimes(1);expect(hrApi.payrollHistory).not.toHaveBeenCalled();
});
it("self paper omits unexpected management identity; empty items and null summaries remain explicit",()=>{
 render(<PayrollStatementActions row={row} items={[]} selfOnly formatMoney={money}/>);const paper=screen.getByRole("article",{name:"工资明细打印面"});expect(paper.textContent).not.toContain("SYN-1");expect(paper.textContent).not.toContain("合成姓名");expect(paper.textContent).toContain("该工资条没有逐项明细");expect(within(paper).getByRole("cell",{name:"—"})).toBeTruthy();
});
it("changing the selected statement replaces its paper and unmount removes it",()=>{
 const view=render(<PayrollStatementActions row={row} items={items} selfOnly={false} formatMoney={money}/>);view.rerender(<PayrollStatementActions row={{...row,periodMonth:"2026-08-01",employeeName:"新选择",employeeCode:"SYN-2"}} items={[]} selfOnly={false} formatMoney={money}/>);expect(screen.getAllByRole("article")).toHaveLength(1);expect(screen.getByRole("article").textContent).not.toContain("2026-07");view.unmount();expect(screen.queryByRole("article",{name:"工资明细打印面"})).toBeNull();
});
it("print failure keeps the statement and offers a browser-menu retry",()=>{
 vi.mocked(window.print).mockImplementation(()=>{throw Error("unavailable")});render(<PayrollStatementActions row={row} items={[]} selfOnly formatMoney={money}/>);fireEvent.click(screen.getByRole("button"));expect(screen.getByRole("alert").textContent).toContain("浏览器打印菜单");expect(screen.getByRole("article")).toBeTruthy();
});
it("full payroll detail exposes print only after both authorized reads succeed, then close removes it",async()=>{
 let finish:(value:HrPayrollHistoryItem[])=>void=()=>{};vi.mocked(hrApi.payrollHistoryItems).mockImplementation(()=>new Promise(resolve=>{finish=resolve}));render(<HrPayrollClient/>);fireEvent.click(await screen.findByRole("button",{name:"查看明细"}));expect(screen.queryByRole("button",{name:"打印 / 保存 PDF"})).toBeNull();await act(async()=>finish(items));await screen.findByRole("button",{name:"打印 / 保存 PDF"});expect(hrApi.payrollHistoryDetail).toHaveBeenCalledWith(row.id,"synthetic-token",expect.any(AbortSignal));fireEvent.click(screen.getByRole("button",{name:"关闭"}));expect(screen.queryByRole("article",{name:"工资明细打印面"})).toBeNull();
});
it("failed detail clears printing and retries the original target without losing the ledger",async()=>{
 vi.mocked(hrApi.payrollHistoryItems).mockRejectedValueOnce(Error("synthetic failure"));render(<HrPayrollClient/>);fireEvent.click(await screen.findByRole("button",{name:"查看明细"}));await screen.findByRole("button",{name:"重试"});expect(screen.queryByRole("article",{name:"工资明细打印面"})).toBeNull();fireEvent.click(screen.getByRole("button",{name:"重试"}));await screen.findByRole("button",{name:"打印 / 保存 PDF"});expect(hrApi.payrollHistoryItems).toHaveBeenCalledTimes(2);
});
it("identity/park changes synchronously remove old paper and abort late detail results",async()=>{
 const view=render(<HrPayrollClient/>);fireEvent.click(await screen.findByRole("button",{name:"查看明细"}));await screen.findByRole("button",{name:"打印 / 保存 PDF"});state.user={...state.user,park_id:"next-park"};view.rerender(<HrPayrollClient/>);expect(screen.queryByRole("article",{name:"工资明细打印面"})).toBeNull();await screen.findByRole("button",{name:"查看明细"});
 let finish:(value:HrPayrollHistoryRow)=>void=()=>{};vi.mocked(hrApi.payrollHistoryDetail).mockImplementation(()=>new Promise(resolve=>{finish=resolve}));fireEvent.click(screen.getByRole("button",{name:"查看明细"}));const signal=vi.mocked(hrApi.payrollHistoryDetail).mock.calls.at(-1)![2];state.user={...state.user,id:"next-actor"};view.rerender(<HrPayrollClient/>);expect(signal?.aborted).toBe(true);await act(async()=>finish(row));expect(screen.queryByRole("article",{name:"工资明细打印面"})).toBeNull();
});
it("full self-only ledger printing omits identity and losing read/module permissions removes the portal",async()=>{
 state.user.permissions=[H.HR_PAYROLL_PAGE,H.HR_PAYROLL_HISTORY_SELF_READ];const view=render(<HrPayrollClient/>);fireEvent.click(await screen.findByRole("button",{name:"查看明细"}));await screen.findByRole("button",{name:"打印 / 保存 PDF"});expect(screen.getByRole("article",{name:"工资明细打印面"}).textContent).not.toContain("SYN-1");state.user.permissions=[H.HR_PAYROLL_PAGE,H.HR_PAYROLL_HISTORY_TEAM_SUMMARY];view.rerender(<HrPayrollClient/>);expect(screen.queryByRole("article",{name:"工资明细打印面"})).toBeNull();state.user.enabled_modules=[];view.rerender(<HrPayrollClient/>);expect(screen.queryByRole("button",{name:"打印 / 保存 PDF"})).toBeNull();
});
it("applied month queries remove the previous printable statement and preserve exact displayed decimal amounts",async()=>{
 render(<HrPayrollClient/>);fireEvent.click(await screen.findByRole("button",{name:"查看明细"}));await screen.findByRole("button",{name:"打印 / 保存 PDF"});const paper=screen.getByRole("article",{name:"工资明细打印面"});expect(paper.textContent).toContain("¥9,007,199,254,740,993.25");expect(paper.textContent).toContain("¥-12.50");fireEvent.change(screen.getByLabelText("开始月份"),{target:{value:"2026-08"}});fireEvent.click(screen.getByRole("button",{name:"查询"}));expect(screen.queryByRole("article",{name:"工资明细打印面"})).toBeNull();
});
it("opening another row removes old printable details even when the new item read fails",async()=>{
 const next={...row,id:"next-row",periodMonth:"2026-08-01"};vi.mocked(hrApi.payrollHistory).mockResolvedValue({items:[row,next],total:2,page:1,page_size:20});render(<HrPayrollClient/>);fireEvent.click((await screen.findAllByRole("button",{name:"查看明细"}))[0]!);await screen.findByRole("button",{name:"打印 / 保存 PDF"});vi.mocked(hrApi.payrollHistoryDetail).mockResolvedValue(next);vi.mocked(hrApi.payrollHistoryItems).mockRejectedValueOnce(Error("synthetic next read failure"));fireEvent.click(screen.getAllByRole("button",{name:"查看明细"})[1]!);expect(screen.queryByRole("article",{name:"工资明细打印面"})).toBeNull();await screen.findByRole("button",{name:"重试"});expect(screen.queryByRole("button",{name:"打印 / 保存 PDF"})).toBeNull();
});
