import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { RewardCorrections } from "../../app/hr/rewards/RewardCorrections";
import { hrApi } from "../../lib/hr-api";
import { ApiError } from "../../lib/api-client";
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../lib/hr-api",()=>({hrApi:{appendRewardCorrection:vi.fn(),rewardCase:vi.fn()}}));
const detail={id:"case-1",code:"SYN",status:"approved",occurredOn:"2090-01-01",employeeName:"合成员工",kind:"reward",categoryName:"合成奖励",impactLevel:"normal",summary:"原批准摘要",corrections:[]};
const publish=async(job:()=>Promise<unknown>)=>{try{await job();return true;}catch{return false;}};
function mount(extra={}){return render(<RewardCorrections detail={detail} canManage busy={false} publish={publish} {...extra}/>);}
function fill(){fireEvent.change(screen.getByLabelText("更正摘要"),{target:{value:"补充摘要"}});fireEvent.change(screen.getByLabelText("更正原因"),{target:{value:"业务复核"}});}
function submit(){fireEvent.submit(screen.getByRole("form",{name:"追加奖惩更正"}));}
beforeEach(()=>{vi.resetAllMocks();vi.mocked(hrApi.appendRewardCorrection).mockResolvedValue({id:"correction-1",sequenceNo:1});vi.mocked(hrApi.rewardCase).mockResolvedValue(detail);});
it("unknown failure retains draft and key for retry and prevents changed payload",async()=>{
 vi.mocked(hrApi.appendRewardCorrection).mockRejectedValueOnce(Error("network unavailable"));mount();fill();submit();
 await screen.findByText("network unavailable");expect(screen.getByLabelText("更正原因")).toHaveValue("业务复核");
 fireEvent.change(screen.getByLabelText("更正摘要"),{target:{value:"改过的内容"}});submit();await screen.findByText(/上次保存结果尚未确认/);expect(hrApi.appendRewardCorrection).toHaveBeenCalledTimes(1);
 fireEvent.change(screen.getByLabelText("更正摘要"),{target:{value:"补充摘要"}});submit();await screen.findByText(/第 1 条更正已保存/);
 expect(vi.mocked(hrApi.appendRewardCorrection).mock.calls[0]).toEqual(vi.mocked(hrApi.appendRewardCorrection).mock.calls[1]);
});
it("confirmed business rejection permits revised content with new key",async()=>{
 vi.mocked(hrApi.appendRewardCorrection).mockRejectedValueOnce(new ApiError("rejected",400));mount();fill();submit();await screen.findByText("rejected");
 fireEvent.change(screen.getByLabelText("更正摘要"),{target:{value:"修正摘要"}});submit();await screen.findByText(/第 1 条更正已保存/);
 expect(vi.mocked(hrApi.appendRewardCorrection).mock.calls[0]?.[3]).not.toEqual(vi.mocked(hrApi.appendRewardCorrection).mock.calls[1]?.[3]);
});
it("committed write and refresh outage remain success with read-only retry",async()=>{
 vi.mocked(hrApi.rewardCase).mockRejectedValueOnce(Error("read unavailable"));mount();fill();submit();await screen.findByText(/第 1 条更正已保存/);await screen.findByText(/更正已保存，历史刷新失败/);
 expect(screen.queryByRole("form")).not.toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"重新读取更正记录"}));await waitFor(()=>expect(screen.queryByText(/read unavailable/)).not.toBeInTheDocument());expect(hrApi.appendRewardCorrection).toHaveBeenCalledTimes(1);
});
it("synchronous duplicate submissions and externally busy parent do not write twice",async()=>{
 let resolve!:(v:{id:string;sequenceNo:number})=>void;vi.mocked(hrApi.appendRewardCorrection).mockReturnValue(new Promise(r=>{resolve=r;}));const view=mount();fill();submit();submit();expect(hrApi.appendRewardCorrection).toHaveBeenCalledTimes(1);
 resolve({id:"correction-1",sequenceNo:1});await screen.findByText(/第 1 条更正已保存/);view.unmount();mount({busy:true});fill();submit();expect(hrApi.appendRewardCorrection).toHaveBeenCalledTimes(1);
});
it("whitespace and malformed response do not become successful operations",async()=>{
 mount();fill();fireEvent.change(screen.getByLabelText("更正原因"),{target:{value:"  "}});submit();await screen.findByText(/请填写更正摘要和更正原因/);expect(hrApi.appendRewardCorrection).not.toHaveBeenCalled();
 vi.mocked(hrApi.appendRewardCorrection).mockResolvedValue({id:"",sequenceNo:0});fill();submit();await screen.findByText(/保存响应未确认/);expect(screen.getByLabelText("更正摘要")).toHaveValue("补充摘要");
});
it("nonapproved and readonly contexts cannot append and malformed histories are contained",async()=>{
 const view=mount({detail:{...detail,status:"submitted"}});expect(screen.queryByRole("form")).not.toBeInTheDocument();view.unmount();
 mount({canManage:false,detail:{...detail,corrections:[{sequenceNo:1,type:"correction",summary:{} as string,createdAt:"2090"}]}});await screen.findByText(/更正记录响应无效/);expect(screen.queryByRole("form")).not.toBeInTheDocument();
});
