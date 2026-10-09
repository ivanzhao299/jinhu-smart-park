import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {RewardCorrections} from '../../app/hr/rewards/RewardCorrections';
import {hrApi} from '../../lib/hr-api';
vi.mock('../../lib/authz',()=>({getAccessToken:()=> 'synthetic-token'}));
vi.mock('../../lib/hr-api',()=>({hrApi:{appendRewardAppeal:vi.fn(),appendRewardCorrection:vi.fn(),rewardCase:vi.fn()}}));
const detail={id:'case',code:'SYN',status:'approved',occurredOn:'2090-01-01',employeeName:'合成员工',kind:'reward',categoryName:'合成奖励',impactLevel:'normal',summary:'原批准事实',canAppeal:true,ownAppeals:[{sequenceNo:1,type:'appeal' as const,summary:'本人早前申诉',createdAt:'2090-01-02'}]};
const publish=async(job:()=>Promise<unknown>)=>{try{await job();return true;}catch{return false;}};
function mount(extra={}){return render(<RewardCorrections detail={detail} mode="appeal" canManage={false} busy={false} publish={publish} {...extra}/>);}
function fill(){fireEvent.change(screen.getByLabelText('申诉摘要'),{target:{value:'本人补充申诉'}});fireEvent.change(screen.getByLabelText('申诉原因'),{target:{value:'本人复核原因'}});}
function submit(){fireEvent.submit(screen.getByRole('form',{name:'提交本人奖惩申诉'}));}
beforeEach(()=>{vi.resetAllMocks();vi.mocked(hrApi.appendRewardAppeal).mockResolvedValue({id:'appeal-2',sequenceNo:2});vi.mocked(hrApi.rewardCase).mockResolvedValue(detail);});
it('self appeal unknown error preserves independent draft/key and ignores changed content',async()=>{
 vi.mocked(hrApi.appendRewardAppeal).mockRejectedValueOnce(Error('network unknown'));mount();await screen.findByText('本人早前申诉');fill();submit();await screen.findByText('network unknown');expect(screen.getByLabelText('申诉原因')).toHaveValue('本人复核原因');
 fireEvent.change(screen.getByLabelText('申诉摘要'),{target:{value:'变更内容'}});submit();await screen.findByText(/上次保存结果尚未确认/);expect(hrApi.appendRewardAppeal).toHaveBeenCalledTimes(1);
 fireEvent.change(screen.getByLabelText('申诉摘要'),{target:{value:'本人补充申诉'}});submit();await screen.findByText('第 2 条申诉已保存，原审批记录保留。');expect(vi.mocked(hrApi.appendRewardAppeal).mock.calls[0]).toEqual(vi.mocked(hrApi.appendRewardAppeal).mock.calls[1]);expect(hrApi.appendRewardCorrection).not.toHaveBeenCalled();
});
it('committed appeal stays saved after read failure and retries only history',async()=>{
 vi.mocked(hrApi.rewardCase).mockRejectedValueOnce(Error('read failed'));mount();fill();submit();await screen.findByText(/申诉已保存，历史刷新失败/);expect(screen.queryByLabelText('申诉摘要')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'重新读取申诉记录'}));await waitFor(()=>expect(screen.queryByText(/read failed/)).not.toBeInTheDocument());expect(hrApi.appendRewardAppeal).toHaveBeenCalledTimes(1);
});
it('missing or false authoritative capability never exposes appeal inputs',()=>{
 const view=mount({detail:{...detail,canAppeal:false}});expect(screen.queryByLabelText('申诉原因')).not.toBeInTheDocument();view.unmount();mount({detail:{...detail,canAppeal:undefined}});expect(screen.queryByRole('form')).not.toBeInTheDocument();
});
it('missing own history or another record type is not accepted as own appeal projection',async()=>{
 const view=mount({detail:{...detail,ownAppeals:undefined}});await screen.findByRole('alert');expect(screen.getByRole('button',{name:'提交本人申诉'})).toBeDisabled();view.unmount();
 mount({detail:{...detail,ownAppeals:[{sequenceNo:2,type:'correction',summary:'HR_PRIVATE',createdAt:'2090'}]}});await screen.findByText(/申诉记录响应无效/);expect(screen.queryByText('HR_PRIVATE')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'提交本人申诉'})).toBeDisabled();
});
it('appeal synchronous duplicate submission and parent busy never create two records',async()=>{
 let resolve!:(v:{id:string;sequenceNo:number})=>void;vi.mocked(hrApi.appendRewardAppeal).mockReturnValue(new Promise(r=>{resolve=r;}));const view=mount();fill();submit();submit();expect(hrApi.appendRewardAppeal).toHaveBeenCalledTimes(1);resolve({id:'appeal',sequenceNo:2});await screen.findByText('第 2 条申诉已保存，原审批记录保留。');view.unmount();mount({busy:true});fill();submit();expect(hrApi.appendRewardAppeal).toHaveBeenCalledTimes(1);
});
