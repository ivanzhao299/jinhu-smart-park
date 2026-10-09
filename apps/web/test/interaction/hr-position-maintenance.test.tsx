import {act,fireEvent,render,screen} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import {PositionWorkbench} from "../../app/hr/organization/PositionWorkbench";
import {HrOrganizationClient} from "../../app/hr/organization/HrOrganizationClient";
import {hrApi,type HrPositionMaintenance} from "../../lib/hr-api";
import {ApiError} from "../../lib/api-client";
const auth=vi.hoisted(()=>({user:{id:"actor",tenant_id:"tenant",park_id:"park",permissions:[] as string[],data_scope:"all"}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>auth.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../components/auth/PermissionGuard",()=>({PermissionGuard:({children}:{children:React.ReactNode})=>children}));
vi.mock("../../lib/hr-api",()=>({hrApi:{positions:vi.fn(),positionMaintenance:vi.fn(),positionMaintenanceOptions:vi.fn(),createPosition:vi.fn(),updatePosition:vi.fn(),organizationTree:vi.fn(),directoryOptions:vi.fn()}}));
const position=():HrPositionMaintenance=>({id:"position",version:7,orgId:"org",positionCode:"SYN-P",positionName:"合成岗位",reportsToPositionId:"parent",jobFamily:"职族",jobLevel:"级别",headcountLimit:10,hierarchyLevel:2,sortOrder:3,authority:"权限说明",qualification:"任职资格",responsibilities:"岗位职责",positionManual:"岗位说明",status:"enabled",remark:"历史备注"});
const options=()=>({orgs:[{id:"org",orgName:"合成部门",status:"enabled"},{id:"other",orgName:"合成其他部门",status:"enabled"}],parents:[{id:"parent",positionCode:"PARENT",positionName:"合成上级",orgId:"org",status:"enabled",reportsToPositionId:null}]});
beforeEach(()=>{vi.resetAllMocks();auth.user={id:"actor",tenant_id:"tenant",park_id:"park",permissions:[H.HR_POSITION_MANAGE,H.HR_POSITION_READ],data_scope:"all"};vi.mocked(hrApi.positions).mockResolvedValue([position()]);vi.mocked(hrApi.positionMaintenance).mockResolvedValue({...options(),position:position()});vi.mocked(hrApi.positionMaintenanceOptions).mockResolvedValue(options());vi.mocked(hrApi.updatePosition).mockResolvedValue({...position(),version:8});vi.mocked(hrApi.createPosition).mockResolvedValue({...position(),id:"created",version:1});});
const change=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}});
const form=()=>screen.getByRole("button",{name:/保存岗位修改|确认新增岗位|按原内容重试保存/}).closest("form")!;
async function edit(){const view=render(<PositionWorkbench canManage canRead/>);fireEvent.click(await screen.findByRole("button",{name:"维护岗位"}));await screen.findByDisplayValue("SYN-P");return view;}
it("loads all15 business fields without employee account context and submits a versioned complete patch",async()=>{
 await edit();expect(hrApi.directoryOptions).not.toHaveBeenCalled();for(const label of ["所属组织","岗位编码","岗位名称","上级岗位","职族","职级","编制人数","岗位层级","显示排序","权限说明","任职资格","岗位职责","岗位说明","启用状态","备注"])expect(screen.getByLabelText(label)).toBeInTheDocument();
 change("岗位名称","现代正式岗位");change("职族","");change("编制人数","0");change("上级岗位","");change("岗位职责","新职责");change("维护原因","核实正式职责");fireEvent.submit(form());await screen.findByText("岗位已保存。");
 expect(hrApi.updatePosition).toHaveBeenCalledWith("position",expect.objectContaining({expectedVersion:7,reason:"核实正式职责",positionName:"现代正式岗位",jobFamily:null,headcountLimit:0,reportsToPositionId:null,responsibilities:"新职责",authority:"权限说明",positionManual:"岗位说明",status:"enabled",sortOrder:3}),"synthetic-token",expect.any(String));
 expect(Object.keys(vi.mocked(hrApi.updatePosition).mock.calls[0]![1])).toHaveLength(17);
});
it("creates all fields, preserves a definitive rejected draft, then uses a new key",async()=>{
 vi.mocked(hrApi.createPosition).mockRejectedValueOnce(new ApiError("岗位编码已存在。",409));render(<PositionWorkbench canManage canRead={false}/>);fireEvent.click(screen.getByRole("button",{name:"新增岗位"}));await screen.findByRole("option",{name:"合成部门"});change("所属组织","org");change("岗位编码","NEW");change("岗位名称","新岗位");change("岗位职责","新职责");change("岗位说明","说明");fireEvent.submit(form());await screen.findByText("岗位编码已存在。");expect(screen.getByLabelText("岗位名称")).toHaveValue("新岗位");change("岗位编码","NEW-2");fireEvent.submit(form());await screen.findByText("岗位已保存。");const calls=vi.mocked(hrApi.createPosition).mock.calls;expect(calls[0]![2]).not.toEqual(calls[1]![2]);expect(calls[1]![0]).toMatchObject({positionCode:"NEW-2",responsibilities:"新职责",positionManual:"说明",headcountLimit:null,sortOrder:0});expect(hrApi.positions).not.toHaveBeenCalled();
});
it("uncertain result locks the draft and retries exact original body and key without losing disabled controls",async()=>{
 vi.mocked(hrApi.updatePosition).mockRejectedValueOnce(new Error("网络中断"));await edit();change("维护原因","更正职责");change("岗位职责","保留的职责");fireEvent.submit(form());await screen.findByText("网络中断");expect(screen.getByLabelText("岗位职责")).toBeDisabled();expect(screen.getByRole("button",{name:"关闭岗位表单"})).toBeDisabled();expect(screen.getByRole("button",{name:"新增岗位"})).toBeDisabled();expect(screen.getByRole("button",{name:"维护岗位"})).toBeDisabled();fireEvent.submit(form());await screen.findByText("岗位已保存。");const calls=vi.mocked(hrApi.updatePosition).mock.calls;expect(calls[0]).toEqual(calls[1]);
});
it("stale versions retain draft and allow an explicit fresh context without overwriting a newer version",async()=>{
 vi.mocked(hrApi.updatePosition).mockRejectedValueOnce(new ApiError("岗位已被修改，请刷新后重新核对。",409));await edit();change("维护原因","核对");change("岗位名称","尚未保存");fireEvent.submit(form());await screen.findByText("岗位已被修改，请刷新后重新核对。");expect(screen.getByLabelText("岗位名称")).toHaveValue("尚未保存");vi.mocked(hrApi.positionMaintenance).mockResolvedValueOnce({...options(),position:{...position(),version:9,positionName:"另一人已保存"}});fireEvent.click(screen.getByRole("button",{name:"重新读取岗位资料"}));await screen.findByDisplayValue("另一人已保存");change("维护原因","核对新版");fireEvent.submit(form());await screen.findByText("岗位已保存。");expect(vi.mocked(hrApi.updatePosition).mock.calls[1]![1]).toMatchObject({expectedVersion:9,positionName:"另一人已保存"});
});
it("a completed save remains saved when list refresh fails and does not submit twice",async()=>{
 await edit();vi.mocked(hrApi.positions).mockRejectedValueOnce(new Error("列表刷新失败"));change("维护原因","核对");fireEvent.submit(form());await screen.findByText("岗位已保存。");await screen.findByText("列表刷新失败");expect(screen.getByRole("button",{name:"保存岗位修改"})).toBeDisabled();fireEvent.submit(form());expect(hrApi.updatePosition).toHaveBeenCalledTimes(1);
});
it("bounds and required reason are checked before writes",async()=>{
 await edit();expect(screen.getByLabelText("编制人数")).toHaveAttribute("max","100000");expect(screen.getByLabelText("编制人数")).toHaveAttribute("min","0");expect(screen.getByLabelText("编制人数")).toHaveAttribute("step","1");change("编制人数","100001");fireEvent.submit(form());await screen.findByText(/请核对编制人数/);change("编制人数","0");fireEvent.submit(form());await screen.findByText("请填写维护原因，最多500字。");expect(hrApi.updatePosition).not.toHaveBeenCalled();expect(screen.getByLabelText("职族")).toHaveAttribute("maxLength","64");expect(screen.getByLabelText("职级")).toHaveAttribute("maxLength","32");
});
it("read-only users never load maintenance contexts and malformed context can only be retried",async()=>{
 const view=render(<PositionWorkbench canManage={false} canRead/>);await screen.findByText("合成岗位");expect(screen.queryByRole("button",{name:"维护岗位"})).toBeNull();expect(hrApi.positionMaintenanceOptions).not.toHaveBeenCalled();view.unmount();vi.mocked(hrApi.positionMaintenance).mockResolvedValueOnce({...options(),position:{...position(),version:0}});render(<PositionWorkbench canManage canRead/>);fireEvent.click(await screen.findByRole("button",{name:"维护岗位"}));await screen.findByText("岗位资料未完整返回，请重新读取。");expect(screen.queryByRole("button",{name:"保存岗位修改"})).toBeNull();
});
it("identity changes remove old drafts and ignore old write completions",async()=>{
 let done!:(row:HrPositionMaintenance)=>void;vi.mocked(hrApi.updatePosition).mockImplementationOnce(()=>new Promise(resolve=>{done=resolve;}));const view=render(<HrOrganizationClient/>);fireEvent.click(await screen.findByRole("button",{name:"维护岗位"}));await screen.findByDisplayValue("SYN-P");change("维护原因","核对");fireEvent.submit(form());const reads=vi.mocked(hrApi.positions).mock.calls.length;auth.user={...auth.user,park_id:"next-park",permissions:[]};view.rerender(<HrOrganizationClient/>);expect(screen.queryByLabelText("维护原因")).toBeNull();await act(async()=>done({...position(),version:8}));expect(hrApi.positions).toHaveBeenCalledTimes(reads);expect(screen.queryByText("岗位已保存。")).toBeNull();
});
