import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {RewardPayrollLink} from '../../app/hr/rewards/RewardPayrollLink';
import {hrApi,type HrRewardPayrollLinkOptions} from '../../lib/hr-api';
import {ApiError} from '../../lib/api-client';
vi.mock('../../lib/authz',()=>({getAccessToken:()=> 'synthetic-token'}));
vi.mock('../../lib/hr-api',()=>({hrApi:{rewardPayrollLinkOptions:vi.fn(),linkRewardPayrollInput:vi.fn()}}));
const candidate=(n:number)=>({id:`input-${n}`,version:2,periodMonth:'2090-01',batchNo:n,batchType:'close' as const});
function result(page=1):HrRewardPayrollLinkOptions{return {caseId:'case',status:'approved',existing:null,page,page_size:20,total:43,items:Array.from({length:Math.min(20,43-(page-1)*20)},(_,i)=>candidate((page-1)*20+i+1))};}
const publish=async(job:()=>Promise<unknown>)=>{try{await job();return true;}catch{return false;}};
function mount(){return render(<RewardPayrollLink id="case" busy={false} publish={publish}/>);}
async function choose(id='input-1@2'){await screen.findByRole('option',{name:/批次 1 ·/});fireEvent.change(screen.getByLabelText('工资输入版本'),{target:{value:id}});}
function submit(){fireEvent.submit(screen.getByRole('form',{name:'关联奖惩工资输入'}));}
beforeEach(()=>{vi.resetAllMocks();vi.mocked(hrApi.rewardPayrollLinkOptions).mockImplementation(async(_id,page)=>result(page));vi.mocked(hrApi.linkRewardPayrollInput).mockResolvedValue({id:'link',targetType:'payroll_input',targetVersion:2,status:'linked'});});
it('pages all 43 candidates and retains selected exact version across pages',async()=>{
 mount();await choose();fireEvent.click(screen.getByRole('button',{name:'工资输入下一页'}));await screen.findByText('第 2 / 3 页 · 共 43 条');fireEvent.click(screen.getByRole('button',{name:'工资输入下一页'}));await screen.findByText('第 3 / 3 页 · 共 43 条');
 expect(screen.getByLabelText('工资输入版本')).toHaveValue('input-1@2');fireEvent.change(screen.getByLabelText('工资输入版本'),{target:{value:'input-43@2'}});submit();await screen.findByText(/工资输入关联已保存/);expect(hrApi.linkRewardPayrollInput).toHaveBeenCalledWith('case',{targetType:'payroll_input',targetId:'input-43',targetVersion:2},'synthetic-token',expect.any(String));
});
it('unknown failure keeps stable retry and forbids changing the pending association',async()=>{
 vi.mocked(hrApi.linkRewardPayrollInput).mockRejectedValueOnce(Error('unknown outcome'));mount();await choose();submit();await screen.findByText('unknown outcome');fireEvent.change(screen.getByLabelText('工资输入版本'),{target:{value:'input-2@2'}});submit();await screen.findByText(/上次关联结果尚未确认/);expect(hrApi.linkRewardPayrollInput).toHaveBeenCalledTimes(1);fireEvent.change(screen.getByLabelText('工资输入版本'),{target:{value:'input-1@2'}});submit();await screen.findByText(/工资输入关联已保存/);expect(vi.mocked(hrApi.linkRewardPayrollInput).mock.calls[0]).toEqual(vi.mocked(hrApi.linkRewardPayrollInput).mock.calls[1]);
});
it('confirmed rejection permits revised target with a new key',async()=>{
 vi.mocked(hrApi.linkRewardPayrollInput).mockRejectedValueOnce(new ApiError('stale',400));mount();await choose();submit();await screen.findByText('stale');fireEvent.change(screen.getByLabelText('工资输入版本'),{target:{value:'input-2@2'}});submit();await screen.findByText(/工资输入关联已保存/);expect(vi.mocked(hrApi.linkRewardPayrollInput).mock.calls[0]?.[3]).not.toEqual(vi.mocked(hrApi.linkRewardPayrollInput).mock.calls[1]?.[3]);
});
it('committed association survives refresh failure and retry only reads',async()=>{
 mount();await choose();vi.mocked(hrApi.rewardPayrollLinkOptions).mockRejectedValueOnce(Error('read outage'));submit();await screen.findByText(/关联已保存，读取关联信息失败/);expect(screen.queryByRole('form')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'重新读取工资关联'}));await waitFor(()=>expect(screen.queryByText(/read outage/)).not.toBeInTheDocument());expect(hrApi.linkRewardPayrollInput).toHaveBeenCalledTimes(1);
});
it('retained unavailable link prevents replacement and malformed candidates are contained',async()=>{
 vi.mocked(hrApi.rewardPayrollLinkOptions).mockResolvedValueOnce({...result(),existing:{id:'link',targetId:'retired',targetVersion:1,status:'linked',createdAt:'2090-01-01',periodMonth:null,batchNo:null,batchType:null}});const view=mount();await screen.findByText(/关联对象当前不可读取/);expect(screen.queryByRole('form')).not.toBeInTheDocument();view.unmount();vi.mocked(hrApi.rewardPayrollLinkOptions).mockResolvedValueOnce({...result(),items:[]});mount();await screen.findByText(/工资关联候选响应无效/);expect(screen.getByRole('button',{name:'保存工资输入关联'})).toBeDisabled();expect(hrApi.linkRewardPayrollInput).not.toHaveBeenCalled();
});
it('duplicate submits serialize and late completion after unmount does not refresh',async()=>{
 let resolve!:(value:Awaited<ReturnType<typeof hrApi.linkRewardPayrollInput>>)=>void;vi.mocked(hrApi.linkRewardPayrollInput).mockReturnValueOnce(new Promise(r=>resolve=r));const view=mount();await choose();submit();submit();expect(hrApi.linkRewardPayrollInput).toHaveBeenCalledTimes(1);view.unmount();resolve({id:'link',targetType:'payroll_input',targetVersion:2,status:'linked'});await waitFor(()=>expect(hrApi.rewardPayrollLinkOptions).toHaveBeenCalledTimes(1));
});
