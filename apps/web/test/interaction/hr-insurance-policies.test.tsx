import { act,fireEvent,render,screen,waitFor,within } from "@testing-library/react";
import { beforeEach,expect,it,vi } from "vitest";
import { HrInsurancePoliciesClient } from "../../app/hr/insurance/policies/HrInsurancePoliciesClient";
import { hrApi,type HrInsurancePolicyVersionDetail,type HrInsuranceSourcePolicyDetail } from "../../lib/hr-api";
const state=vi.hoisted(()=>({user:{id:"synthetic",park_id:"synthetic-park",permissions:["*"],enabled_modules:[{module_code:"hr",enabled:true}]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../lib/hr-api",()=>({hrApi:{insurancePolicyVersions:vi.fn(),insurancePolicyVersion:vi.fn(),insurancePolicies:vi.fn(),insuranceSourcePolicyDefinition:vi.fn(),createInsurancePolicyVersion:vi.fn()}}));
const kinds=["oldage","remedy","losework","wound","bear","fund"] as const;
const detail:HrInsurancePolicyVersionDetail={id:"synthetic-version",policyCode:"TEST",policyName:"合成现代政策",variantNo:1,versionNo:1,effectiveFrom:"2026-01",effectiveThrough:"2026-12",definitionHash:"internal-not-visible",createdAt:"2026-10-03T00:00:00.000Z",mode:"immutable_definition",activated:false,engineVersion:"synthetic-engine",originKind:"manual",reason:"合成业务依据",items:kinds.map(insuranceKind=>({insuranceKind,factors:{base:{rate:"0.080000",fixedAmount:null},employer:{rate:"0.080000",fixedAmount:null},employee:{rate:"0.080000",fixedAmount:null},supplement:{rate:"0.080000",fixedAmount:null}}}))};
const source={id:"synthetic-source",code:"OLD",name:"合成历史政策",version:7,status:"historical",availableVariants:[1,2]};
const definition:HrInsuranceSourcePolicyDetail={...source,scopeDescription:"原部门范围",mode:"historical_definition",activated:false,variants:[1,2].map(variantNo=>({variantNo,copyEligible:true,factorsHash:"a".repeat(64),items:detail.items}))};
beforeEach(()=>{
  vi.clearAllMocks();state.user={id:"synthetic",park_id:"synthetic-park",permissions:["*"],enabled_modules:[{module_code:"hr",enabled:true}]};
  vi.mocked(hrApi.insurancePolicyVersions).mockResolvedValue({items:[detail],total:21,page:1,page_size:20});
  vi.mocked(hrApi.insurancePolicyVersion).mockResolvedValue(detail);
  vi.mocked(hrApi.insurancePolicies).mockResolvedValue({items:[source],total:21,page:1,page_size:20,insuranceKinds:[...kinds]});
  vi.mocked(hrApi.insuranceSourcePolicyDefinition).mockResolvedValue(definition);
  vi.mocked(hrApi.createInsurancePolicyVersion).mockResolvedValue({...detail,replayed:false});
});
function common(){
  for(const [label,value] of [["政策编号","TEST"],["政策名称","合成现代政策"],["开始月份","2026-01"],["结束月份","2026-12"],["业务依据","合成业务依据"]])fireEvent.change(screen.getByLabelText(label!),{target:{value}});
}
function manual(){
  common();fireEvent.change(screen.getByLabelText("费率来源"),{target:{value:"manual"}});fireEvent.change(screen.getByLabelText("政策方案"),{target:{value:"1"}});
  fireEvent.click(screen.getByRole("button",{name:"全部不使用固定附加额"}));
  for(const input of screen.getAllByRole("spinbutton"))fireEvent.change(input,{target:{value:"8"}});
}
it("denied roles and disabled HR module perform no catalog or factor reads",()=>{
  state.user.permissions=["hr:insurance:team_read"];
  const view=render(<HrInsurancePoliciesClient/>);expect(screen.getByText(/无权访问社保政策版本/)).toBeVisible();expect(hrApi.insurancePolicyVersions).not.toHaveBeenCalled();
  state.user.permissions=["*"];state.user.enabled_modules=[{module_code:"hr",enabled:false}];view.rerender(<HrInsurancePoliciesClient/>);expect(hrApi.insurancePolicyVersions).not.toHaveBeenCalled();
});
it("read permission shows exact read-only definitions without a creation form or internal hashes",async()=>{
  state.user.permissions=["hr:insurance","hr:insurance:read","hr:insurance_amount:read"];
  render(<HrInsurancePoliciesClient/>);fireEvent.click(await screen.findByRole("button",{name:"查看版本"}));
  const output=await screen.findByLabelText("政策版本详情");expect(within(output).getAllByText("个人：8.0000% · 无固定附加额")).toHaveLength(6);
  expect(screen.queryByRole("button",{name:"保存政策版本"})).toBeNull();expect(screen.queryByLabelText("政策编号")).toBeNull();expect(screen.queryByText("internal-not-visible")).toBeNull();expect(hrApi.insurancePolicies).not.toHaveBeenCalled();
});
it("explicit manual inputs save exact percentages and NULL addends once, then show the saved version",async()=>{
  render(<HrInsurancePoliciesClient/>);expect(screen.getByLabelText("开始月份")).toHaveValue("");expect(screen.getByRole("button",{name:"保存政策版本"})).toBeDisabled();manual();
  fireEvent.change(screen.getByLabelText("养老保险个人费率（%）"),{target:{value:"99999999999999.9999"}});
  const save=screen.getByRole("button",{name:"保存政策版本"});fireEvent.click(save);fireEvent.click(save);
  await screen.findByText("合成现代政策 · 版本 1 已保存");expect(hrApi.createInsurancePolicyVersion).toHaveBeenCalledTimes(1);
  const [body,token,key,signal]=vi.mocked(hrApi.createInsurancePolicyVersion).mock.calls[0]!;
  expect(token).toBe("synthetic-token");expect(key).toMatch(/^hr-insurance-policy-version-/);expect(signal).toBeInstanceOf(AbortSignal);
  expect(body.items![0]!.factors.employee).toEqual({rate:"999999999999.999999",fixedAmount:null});expect(body.sourcePolicyId).toBeUndefined();expect(hrApi.insurancePolicies).not.toHaveBeenCalled();
});
it("unchanged failed save retries the same body and keys; editing starts a new request",async()=>{
  vi.mocked(hrApi.createInsurancePolicyVersion).mockRejectedValue(new Error("synthetic connection failure"));
  render(<HrInsurancePoliciesClient/>);manual();fireEvent.click(screen.getByRole("button",{name:"保存政策版本"}));await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button",{name:"保存政策版本"}));await waitFor(()=>expect(hrApi.createInsurancePolicyVersion).toHaveBeenCalledTimes(2));await waitFor(()=>expect(screen.getByRole("button",{name:"保存政策版本"})).toBeEnabled());
  const calls=vi.mocked(hrApi.createInsurancePolicyVersion).mock.calls;expect(calls[0]![0]).toEqual(calls[1]![0]);expect(calls[0]![2]).toBe(calls[1]![2]);
  fireEvent.change(screen.getByLabelText("业务依据"),{target:{value:"新的合成依据"}});fireEvent.click(screen.getByRole("button",{name:"保存政策版本"}));await waitFor(()=>expect(hrApi.createInsurancePolicyVersion).toHaveBeenCalledTimes(3));expect(calls[2]![0].requestId).not.toBe(calls[0]![0].requestId);
});
it("source copy binds the observed version and paging clears source and variant",async()=>{
  render(<HrInsurancePoliciesClient/>);common();fireEvent.change(screen.getByLabelText("费率来源"),{target:{value:"copy"}});await screen.findByRole("option",{name:/合成历史政策/});
  fireEvent.change(screen.getByLabelText("历史政策"),{target:{value:source.id}});fireEvent.change(screen.getByLabelText("政策方案"),{target:{value:"1"}});fireEvent.click(screen.getByRole("button",{name:"下一页历史政策"}));
  expect(screen.getByLabelText("历史政策")).toHaveValue("");expect(screen.getByLabelText("政策方案")).toHaveValue("");await waitFor(()=>expect(hrApi.insurancePolicies).toHaveBeenLastCalledWith("synthetic-token",2,"",expect.any(AbortSignal)));
  await screen.findByRole("option",{name:/合成历史政策/});fireEvent.change(screen.getByLabelText("历史政策"),{target:{value:source.id}});fireEvent.change(screen.getByLabelText("政策方案"),{target:{value:"2"}});await waitFor(()=>expect(screen.getByRole("button",{name:"保存政策版本"})).toBeEnabled());fireEvent.click(screen.getByRole("button",{name:"保存政策版本"}));await screen.findByText("合成现代政策 · 版本 1 已保存");
  expect(hrApi.createInsurancePolicyVersion).toHaveBeenCalledWith(expect.objectContaining({sourcePolicyId:source.id,expectedSourceVersion:7,expectedSourceFactorsHash:"a".repeat(64),variantNo:2}),"synthetic-token",expect.any(String),expect.any(AbortSignal));expect(vi.mocked(hrApi.createInsurancePolicyVersion).mock.calls[0]![0].items).toBeUndefined();
});
it("historical NULL rates and scope are displayed explicitly and block copying",async()=>{
  const incomplete=structuredClone(definition);incomplete.variants[0]!.copyEligible=false;incomplete.variants[0]!.items[0]!.factors.employee.rate=null;
  vi.mocked(hrApi.insuranceSourcePolicyDefinition).mockResolvedValue(incomplete);
  render(<HrInsurancePoliciesClient/>);common();fireEvent.change(screen.getByLabelText("费率来源"),{target:{value:"copy"}});await screen.findByRole("option",{name:/合成历史政策/});fireEvent.change(screen.getByLabelText("历史政策"),{target:{value:source.id}});fireEvent.change(screen.getByLabelText("政策方案"),{target:{value:"1"}});
  expect(await screen.findByText(/历史适用范围（原记录）：原部门范围/)).toBeVisible();expect(screen.getByText(/个人：费率未记录/)).toBeVisible();expect(screen.getByRole("button",{name:"保存政策版本"})).toBeDisabled();expect(hrApi.createInsurancePolicyVersion).not.toHaveBeenCalled();
});
it("revoking context aborts source definition reads and suppresses late rates",async()=>{
  let resolve!:(value:HrInsuranceSourcePolicyDetail)=>void;vi.mocked(hrApi.insuranceSourcePolicyDefinition).mockImplementation(()=>new Promise(done=>{resolve=done;}));
  const view=render(<HrInsurancePoliciesClient/>);fireEvent.change(screen.getByLabelText("费率来源"),{target:{value:"copy"}});await screen.findByRole("option",{name:/合成历史政策/});fireEvent.change(screen.getByLabelText("历史政策"),{target:{value:source.id}});await waitFor(()=>expect(hrApi.insuranceSourcePolicyDefinition).toHaveBeenCalledTimes(1));const signal=vi.mocked(hrApi.insuranceSourcePolicyDefinition).mock.calls[0]![3]!;
  state.user.permissions=[];view.rerender(<HrInsurancePoliciesClient/>);expect(signal.aborted).toBe(true);await act(async()=>resolve(definition));expect(screen.queryByLabelText("历史政策完整定义")).toBeNull();
});
it("context revocation aborts detail and suppresses a late sensitive response",async()=>{
  let resolve!:(value:HrInsurancePolicyVersionDetail)=>void;vi.mocked(hrApi.insurancePolicyVersion).mockImplementation(()=>new Promise(done=>{resolve=done;}));
  const view=render(<HrInsurancePoliciesClient/>);fireEvent.click(await screen.findByRole("button",{name:"查看版本"}));const signal=vi.mocked(hrApi.insurancePolicyVersion).mock.calls[0]![2]!;
  state.user.permissions=[];view.rerender(<HrInsurancePoliciesClient/>);expect(signal.aborted).toBe(true);await act(async()=>resolve(detail));expect(screen.queryByLabelText("政策版本详情")).toBeNull();
});
it("a failed optional refresh cannot erase a successfully saved version",async()=>{
  render(<HrInsurancePoliciesClient/>);await screen.findByRole("button",{name:"查看版本"});manual();vi.mocked(hrApi.insurancePolicyVersions).mockRejectedValue(new Error("synthetic refresh failure"));vi.mocked(hrApi.insurancePolicyVersion).mockRejectedValue(new Error("synthetic detail failure"));
  fireEvent.click(screen.getByRole("button",{name:"保存政策版本"}));expect(await screen.findByText("合成现代政策 · 版本 1 已保存")).toBeVisible();await screen.findByRole("alert");expect(screen.getByText("合成现代政策 · 版本 1 已保存")).toBeVisible();
});
