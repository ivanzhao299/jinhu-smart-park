import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,it,expect,vi} from "vitest";
import {HrContractsClient} from "../../app/hr/contracts/HrContractsClient";
import {hrApi,type HrContractDetail} from "../../lib/hr-api";
const state=vi.hoisted(()=>({user:{id:"actor",permissions:["hr:contract:read","hr:contract:manage"]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../components/auth/PermissionGuard",()=>({PermissionGuard:({children}:{children:React.ReactNode})=>children}));
vi.mock("../../lib/hr-api",()=>({hrApi:{contracts:vi.fn(),contract:vi.fn(),employees:vi.fn(),contractTypes:vi.fn(),createContractChange:vi.fn()}}));
const basic:HrContractDetail={id:"contract",contractNo:"SYN",contractTypeName:"合成合同",startDate:"2090-01-01",endDate:"2091-12-31",status:"active",isHistoricalImport:false,changes:[],actions:[]};
beforeEach(()=>{
 vi.clearAllMocks();vi.mocked(hrApi.contracts).mockResolvedValue({items:[basic],total:1,page:1,page_size:50});vi.mocked(hrApi.contract).mockResolvedValue(basic);
 vi.mocked(hrApi.employees).mockResolvedValue({items:[],total:0,page:1,page_size:100});vi.mocked(hrApi.contractTypes).mockResolvedValue([]);
 vi.mocked(hrApi.createContractChange).mockResolvedValue({id:"change",sequenceNo:1,changeType:"renewal",previousStartDate:basic.startDate,previousEndDate:basic.endDate,newStartDate:"2092-01-01",newEndDate:"2092-12-31",status:"draft",isHistoricalImport:false});
});
async function form(){render(<HrContractsClient/>);fireEvent.click(await screen.findByRole("button",{name:"查看合同"}));fireEvent.click(await screen.findByRole("button",{name:"办理续签/变更"}));fireEvent.change(screen.getByLabelText("新开始日期/生效日期"),{target:{value:"2092-01-01"}});fireEvent.change(screen.getByLabelText("新结束日期"),{target:{value:"2092-12-31"}});}
it("submits explicit term and registered signature date separately from operation time",async()=>{
 await form();fireEvent.change(screen.getByLabelText("本次合同期限（月）"),{target:{value:"12"}});fireEvent.change(screen.getByLabelText("本次登记签订日期"),{target:{value:"2091-12-15"}});fireEvent.submit(screen.getByLabelText("本次登记签订日期").closest("form")!);
 await waitFor(()=>expect(hrApi.createContractChange).toHaveBeenCalled());expect(vi.mocked(hrApi.createContractChange).mock.calls[0]?.[1]).toMatchObject({contractTermMonths:12,signatureDate:"2091-12-15"});
});
it("empty facts are omitted and termination hides the new term input",async()=>{
 await form();fireEvent.change(screen.getByLabelText("办理类型"),{target:{value:"termination"}});expect(screen.queryByLabelText("本次合同期限（月）")).toBeNull();fireEvent.submit(screen.getByLabelText("本次登记签订日期").closest("form")!);
 await waitFor(()=>expect(hrApi.createContractChange).toHaveBeenCalled());const payload=JSON.stringify(vi.mocked(hrApi.createContractChange).mock.calls[0]?.[1]);expect(payload).not.toContain('"contractTermMonths"');expect(payload).not.toContain('"signatureDate"');
});
it("detail shows registered change facts while keeping action time separate",async()=>{
 vi.mocked(hrApi.contract).mockResolvedValue({...basic,changes:[{id:"change",sequenceNo:1,changeType:"renewal",previousStartDate:basic.startDate,previousEndDate:basic.endDate,newStartDate:"2092-01-01",newEndDate:"2092-12-31",contractTermMonths:0,signatureDate:"2091-12-15",status:"effective",isHistoricalImport:false}]});render(<HrContractsClient/>);fireEvent.click(await screen.findByRole("button",{name:"查看合同"}));expect(await screen.findByText("本次合同期限：0 个月")).toBeVisible();expect(screen.getByText("登记签订日期：2091-12-15")).toBeVisible();
});
