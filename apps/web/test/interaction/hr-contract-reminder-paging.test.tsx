import {fireEvent,render,screen,within,waitFor} from "@testing-library/react";
import {beforeEach,describe,it,expect,vi} from "vitest";
import {HrContractsClient} from "../../app/hr/contracts/HrContractsClient";
import {hrApi} from "../../lib/hr-api";
const state=vi.hoisted(()=>({user:{id:"actor",permissions:["hr:contract:read","hr:contract_reminder:park_read"]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../components/auth/PermissionGuard",()=>({PermissionGuard:({children}:{children:React.ReactNode})=>children}));
vi.mock("../../lib/hr-api",()=>({hrApi:{contracts:vi.fn(),contractReminders:vi.fn()}}));
beforeEach(()=>{
 vi.clearAllMocks();state.user={id:"actor",permissions:["hr:contract:read","hr:contract_reminder:park_read"]};
 vi.mocked(hrApi.contracts).mockImplementation(async(_token,page=1,size=50)=>({items:[],total:0,page,page_size:size}));
 vi.mocked(hrApi.contractReminders).mockImplementation(async(_token,page=1,size=50)=>({items:Array.from({length:Math.min(size,113-(page-1)*size)},(_,i)=>({id:`r${(page-1)*size+i}`,contractId:"c",employeeId:"e",kind:"contract_expiry",windowDays:60,dueDate:`SYN-${(page-1)*size+i}`,status:"open"})),total:113,page,page_size:size,active_sixty_day_total:113}));
});
describe("complete scoped contract reminder inbox",()=>{
 it("reaches reminders beyond 100 and retains a whole-inbox 60-day count",async()=>{
  render(<HrContractsClient/>);await screen.findByText("截止日期：SYN-0");
  const nav=screen.getByRole("navigation",{name:"合同提醒分页"});
  fireEvent.click(within(nav).getByRole("button",{name:"下一页"}));await screen.findByText("截止日期：SYN-50");
  fireEvent.click(within(nav).getByRole("button",{name:"下一页"}));await screen.findByText("截止日期：SYN-112");
  expect(within(nav).getByRole("status")).toHaveTextContent("本页 13 条");expect(within(nav).getByRole("button",{name:"下一页"})).toBeDisabled();
  expect(screen.getByLabelText("劳动合同概览")).toHaveTextContent("60 日提醒113");
 });
 it("filters the server-side inbox from page one and clears old rows immediately",async()=>{
  render(<HrContractsClient/>);await screen.findByText("截止日期：SYN-0");
  fireEvent.click(within(screen.getByRole("navigation",{name:"合同提醒分页"})).getByRole("button",{name:"下一页"}));await screen.findByText("截止日期：SYN-50");
  vi.mocked(hrApi.contractReminders).mockImplementation(()=>new Promise(()=>{}));
  fireEvent.change(screen.getByLabelText("提醒类型"),{target:{value:"probation_expiry"}});
  expect(screen.queryByText("截止日期：SYN-50")).toBeNull();
  await waitFor(()=>expect(hrApi.contractReminders).toHaveBeenLastCalledWith("synthetic-token",1,50,"open",expect.any(AbortSignal),{kind:"probation_expiry",window_days:undefined}));
  fireEvent.change(screen.getByLabelText("提醒窗口"),{target:{value:"30"}});
  await waitFor(()=>expect(hrApi.contractReminders).toHaveBeenLastCalledWith("synthetic-token",1,50,"open",expect.any(AbortSignal),{kind:"probation_expiry",window_days:30}));
 });
 it("identity change hides the previous inbox while a late response is pending",async()=>{
  const view=render(<HrContractsClient/>);await screen.findByText("截止日期：SYN-0");
  vi.mocked(hrApi.contractReminders).mockImplementation(()=>new Promise(()=>{}));state.user={...state.user,id:"another"};view.rerender(<HrContractsClient/>);
  expect(screen.queryByText("截止日期：SYN-0")).toBeNull();await waitFor(()=>expect(hrApi.contractReminders).toHaveBeenCalledTimes(2));
 });
 it("refreshing a removed last page returns to the new last page",async()=>{
  render(<HrContractsClient/>);await screen.findByText("截止日期：SYN-0");
  const nav=screen.getByRole("navigation",{name:"合同提醒分页"});
  fireEvent.click(within(nav).getByRole("button",{name:"下一页"}));await screen.findByText("截止日期：SYN-50");
  fireEvent.click(within(nav).getByRole("button",{name:"下一页"}));await screen.findByText("截止日期：SYN-112");
  vi.mocked(hrApi.contractReminders).mockImplementation(async(_token,page=1,size=50)=>({items:[],total:50,page,page_size:size,active_sixty_day_total:50}));
  fireEvent.click(within(nav).getByRole("button",{name:"刷新本页"}));
  await waitFor(()=>expect(within(nav).getByRole("status")).toHaveTextContent("第 1 / 1 页"));
  expect(hrApi.contractReminders).toHaveBeenLastCalledWith("synthetic-token",1,50,"open",expect.any(AbortSignal),{kind:undefined,window_days:undefined});
 });
});
