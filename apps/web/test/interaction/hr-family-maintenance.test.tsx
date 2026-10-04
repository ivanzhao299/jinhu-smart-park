import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HrFamilyMaintenance } from "../../app/hr/employees/components/HrFamilyMaintenance";
import { hrApi, type HrEmployeeFamilyRecord, type HrFamilyWriteResult } from "../../lib/hr-api";

vi.mock("../../lib/hr-api",()=>({hrApi:{createFamily:vi.fn(),updateFamily:vi.fn(),archiveFamily:vi.fn()}}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
const member:HrEmployeeFamilyRecord={id:"family",version:1,relationship:"synthetic",fullName:"Synthetic family",fullNameMasked:"S***",contact:"SYN-CONTACT",contactMasked:"S***",identityMasked:"S***",isEmergencyContact:false,workUnit:"original unit",birthDate:null,jobTitle:null,politicalStatus:null};
beforeEach(()=>{vi.mocked(hrApi.createFamily).mockReset();vi.mocked(hrApi.updateFamily).mockReset();vi.mocked(hrApi.archiveFamily).mockReset();});
function open(record:HrEmployeeFamilyRecord=member,canReadFull=true,onReload=vi.fn(),captureScope=()=>()=>true){
  render(<HrFamilyMaintenance employeeId="employee" members={[record]} canReadFull={canReadFull} onReload={onReload} captureScope={captureScope}/>);
  fireEvent.click(screen.getByRole("button",{name:`维护${canReadFull?record.fullName:record.fullNameMasked}`}));
  return onReload;
}
it("sends only changed fields and preserves omitted identity and contact",async()=>{
  vi.mocked(hrApi.updateFamily).mockResolvedValue({id:"family",recordType:"family",version:2});const reload=open();
  fireEvent.change(screen.getByLabelText("工作单位"),{target:{value:"new unit"}});fireEvent.click(screen.getByRole("button",{name:"保存家庭成员"}));
  await waitFor(()=>expect(reload).toHaveBeenCalledOnce());
  expect(hrApi.updateFamily).toHaveBeenCalledWith("employee","family",{expectedVersion:1,workUnit:"new unit"},"synthetic-token");
});
it("clears identity explicitly while masked editing does not submit masked names or contacts",async()=>{
  vi.mocked(hrApi.updateFamily).mockResolvedValue({id:"family",recordType:"family",version:2});const reload=open(member,false);
  expect(screen.getByLabelText("新姓名（不填保留）")).toHaveValue("");
  expect(screen.getByLabelText("新联系方式（不填保留）")).toHaveValue("");
  fireEvent.click(screen.getByRole("checkbox",{name:"清空证件号"}));fireEvent.click(screen.getByRole("button",{name:"保存家庭成员"}));
  await waitFor(()=>expect(reload).toHaveBeenCalledOnce());
  expect(hrApi.updateFamily).toHaveBeenCalledWith("employee","family",{expectedVersion:1,identityNumber:null},"synthetic-token");
});
it("creates a formal family record with typed fields",async()=>{
  vi.mocked(hrApi.createFamily).mockResolvedValue({id:"created",recordType:"family",version:1});const reload=vi.fn();
  render(<HrFamilyMaintenance employeeId="employee" members={[]} canReadFull={false} onReload={reload} captureScope={()=>()=>true}/>);
  fireEvent.click(screen.getByRole("button",{name:"新增家庭成员"}));
  fireEvent.change(screen.getByLabelText("关系"),{target:{value:"synthetic"}});fireEvent.change(screen.getByLabelText("姓名"),{target:{value:"Synthetic new"}});
  fireEvent.click(screen.getByRole("button",{name:"保存家庭成员"}));await waitFor(()=>expect(reload).toHaveBeenCalledOnce());
  expect(hrApi.createFamily).toHaveBeenCalledWith("employee",expect.objectContaining({relationship:"synthetic",fullName:"Synthetic new",isEmergencyContact:false}),"synthetic-token");
});
it("requires removal confirmation and retains the exact version",async()=>{
  vi.mocked(hrApi.archiveFamily).mockResolvedValue({id:"family",recordType:"family",version:2,archived:true});const reload=open();
  expect(screen.getByRole("button",{name:"移除家庭成员"})).toBeDisabled();fireEvent.click(screen.getByRole("checkbox",{name:"确认移除此家庭成员"}));
  fireEvent.click(screen.getByRole("button",{name:"移除家庭成员"}));await waitFor(()=>expect(reload).toHaveBeenCalledOnce());
  expect(hrApi.archiveFamily).toHaveBeenCalledWith("employee","family",1,"synthetic-token");
});
it("keeps drafts and prevents cancelling away an unconfirmed mutation",async()=>{
  vi.mocked(hrApi.updateFamily).mockRejectedValue(new Error("timeout"));open();
  fireEvent.change(screen.getByLabelText("工作单位"),{target:{value:"draft"}});fireEvent.click(screen.getByRole("button",{name:"保存家庭成员"}));
  await screen.findByText(/操作未确认/);expect(screen.getByLabelText("工作单位")).toHaveValue("draft");
  expect(screen.getByRole("button",{name:"保存家庭成员"})).toBeDisabled();expect(screen.getByRole("button",{name:"取消"})).toBeDisabled();
  expect(hrApi.updateFamily).toHaveBeenCalledOnce();
});
it("locks duplicate submits and ignores a delayed result after employee scope changes",async()=>{
  let resolve!:(value:HrFamilyWriteResult)=>void;let current=true;
  vi.mocked(hrApi.updateFamily).mockReturnValue(new Promise(done=>{resolve=done;}));const reload=open(member,true,vi.fn(),()=>()=>current);
  fireEvent.change(screen.getByLabelText("工作单位"),{target:{value:"draft"}});
  const form=screen.getByRole("form",{name:"维护家庭成员"});fireEvent.submit(form);fireEvent.submit(form);
  expect(hrApi.updateFamily).toHaveBeenCalledOnce();current=false;
  await act(async()=>{resolve({id:"family",recordType:"family",version:2});});expect(reload).not.toHaveBeenCalled();
});
it("does not admit records without a server-owned version",()=>{
  open({...member,version:undefined});expect(screen.getByRole("button",{name:"保存家庭成员"})).toBeDisabled();
  expect(screen.getByLabelText("工作单位")).toBeDisabled();
});
