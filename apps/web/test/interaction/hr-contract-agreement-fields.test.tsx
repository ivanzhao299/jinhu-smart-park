import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,describe,it,expect,vi} from "vitest";
import {HrContractsClient} from "../../app/hr/contracts/HrContractsClient";
import {hrApi,type HrContractDetail,type HrEmployee} from "../../lib/hr-api";
const state=vi.hoisted(()=>({user:{id:"actor",permissions:["hr:contract:read"]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../components/auth/PermissionGuard",()=>({PermissionGuard:({children}:{children:React.ReactNode})=>children}));
vi.mock("../../lib/hr-api",()=>({hrApi:{contracts:vi.fn(),contract:vi.fn(),employees:vi.fn(),contractTypes:vi.fn(),updateContract:vi.fn()}}));
const basic:HrContractDetail={id:"contract",employeeId:"employee",contractTypeId:"type",contractNo:"SYN-CONTRACT",contractTypeName:"合成合同",startDate:"2090-01-01",endDate:"2091-12-31",status:"draft",isHistoricalImport:false,changes:[],actions:[]};
const labels=["保密协议标记","竞业限制协议标记","培训服务协议标记"];
beforeEach(()=>{
 vi.clearAllMocks();state.user={id:"actor",permissions:["hr:contract:read"]};
 vi.mocked(hrApi.contracts).mockResolvedValue({items:[basic],total:1,page:1,page_size:50});vi.mocked(hrApi.contract).mockResolvedValue(basic);
 vi.mocked(hrApi.employees).mockResolvedValue({items:[{id:"employee",employeeCode:"SYN",fullName:"Synthetic",employmentStatus:"active"} as HrEmployee],total:1,page:1,page_size:100});
 vi.mocked(hrApi.contractTypes).mockResolvedValue([{id:"type",typeCode:"SYN",typeName:"合成合同",isHistoricalImport:false}]);vi.mocked(hrApi.updateContract).mockResolvedValue(basic);
});
async function open(){fireEvent.click(await screen.findByRole("button",{name:"查看合同"}));await screen.findByRole("heading",{name:"SYN-CONTRACT"});}
describe("three contract agreement flags preserve facts and edits",()=>{
 it("shows explicit true and false without claiming signature evidence",async()=>{vi.mocked(hrApi.contract).mockResolvedValue({...basic,confidentialityAgreement:true,nonCompeteAgreement:false,trainingServiceAgreement:true,isHistoricalImport:true});render(<HrContractsClient/>);await open();expect(screen.getByText(labels[0]+"：已标记")).toBeVisible();expect(screen.getByText(labels[1]+"：未标记")).toBeVisible();expect(screen.getByText(labels[2]+"：已标记")).toBeVisible();expect(screen.queryByRole("button",{name:"编辑草稿"})).toBeNull();});
 it("omitted self fields do not become false flags",async()=>{state.user={id:"actor",permissions:["hr:contract:self_read"]};render(<HrContractsClient/>);await open();for(const label of labels)expect(screen.queryByText(new RegExp(label))).toBeNull();});
 it("edits returned values and sends an explicit false when unchecked",async()=>{
  state.user={id:"actor",permissions:["hr:contract:read","hr:contract:manage"]};vi.mocked(hrApi.contract).mockResolvedValue({...basic,confidentialityAgreement:true,nonCompeteAgreement:false,trainingServiceAgreement:true});render(<HrContractsClient/>);await open();fireEvent.click(screen.getByRole("button",{name:"编辑草稿"}));
  expect(screen.getByRole("checkbox",{name:labels[0]})).toBeChecked();expect(screen.getByRole("checkbox",{name:labels[1]})).not.toBeChecked();fireEvent.click(screen.getByRole("checkbox",{name:labels[0]}));
  fireEvent.submit(screen.getByRole("checkbox",{name:labels[0]}).closest("form")!);await waitFor(()=>expect(hrApi.updateContract).toHaveBeenCalled());expect(vi.mocked(hrApi.updateContract).mock.calls[0]?.[1]).toMatchObject({confidentialityAgreement:false,nonCompeteAgreement:false,trainingServiceAgreement:true});
 });
 it("an unrelated edit omits flags unavailable in the detail projection",async()=>{
  state.user={id:"actor",permissions:["hr:contract:read","hr:contract:manage"]};render(<HrContractsClient/>);await open();fireEvent.click(screen.getByRole("button",{name:"编辑草稿"}));fireEvent.submit(screen.getByRole("checkbox",{name:labels[0]}).closest("form")!);await waitFor(()=>expect(hrApi.updateContract).toHaveBeenCalled());const body=vi.mocked(hrApi.updateContract).mock.calls[0]?.[1];for(const key of ["confidentialityAgreement","nonCompeteAgreement","trainingServiceAgreement"])expect(JSON.stringify(body)).not.toContain(`"${key}"`);
 });

 it("shows original years separately from modern months and preserves zero and unknown",async()=>{
  vi.mocked(hrApi.contract).mockResolvedValue({...basic,isHistoricalImport:true,contractTermMonths:24,cumulativeTermMonths:null,originalTermYears:{initial:{value:2,status:"recorded"},total:{value:null,status:"unconfirmed"},renewal:{value:0,status:"recorded"}}});
  render(<HrContractsClient/>);await open();expect(screen.getByText("原玉舟首次年限：2 年")).toBeVisible();expect(screen.getByText("原玉舟累计年限：未确认")).toBeVisible();expect(screen.getByText("原玉舟续签年数：0 年")).toBeVisible();expect(screen.getByText("累计合同期限：未登记")).toBeVisible();expect(screen.queryByRole("button",{name:"编辑草稿"})).toBeNull();
 });
 it("missing source years remain missing alongside independent recorded totals",async()=>{
  vi.mocked(hrApi.contract).mockResolvedValue({...basic,isHistoricalImport:true,originalTermYears:{initial:{value:null,status:"missing"},total:{value:5,status:"recorded"},renewal:{value:3,status:"recorded"}}});
  render(<HrContractsClient/>);await open();expect(screen.getByText("原玉舟首次年限：未登记")).toBeVisible();expect(screen.getByText("原玉舟累计年限：5 年")).toBeVisible();
 });
});
