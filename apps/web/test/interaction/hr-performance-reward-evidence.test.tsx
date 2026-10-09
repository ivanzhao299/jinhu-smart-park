import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {PerformanceRewardEvidence} from '../../app/hr/performance/PerformanceRewardEvidence';
import {hrApi,type HrPerformanceRewardEvidencePage} from '../../lib/hr-api';
vi.mock('../../lib/authz',()=>({getAccessToken:()=> 'synthetic-token'}));
vi.mock('../../lib/hr-api',()=>({hrApi:{performanceRewardEvidence:vi.fn()}}));
function result(page=1,id='review'):HrPerformanceRewardEvidencePage{return {reviewId:id,page,page_size:20,total:43,items:Array.from({length:Math.min(20,Math.max(0,43-(page-1)*20))},(_,i)=>({id:`ref-${(page-1)*20+i}`,sourceVersion:3,capturedAt:'2090-01-01',caseCode:`SYN-${(page-1)*20+i}`,kind:'reward',occurredOn:'2090-01-01'}))};}
function mount(){return render(<PerformanceRewardEvidence id="review" employeeName="合成员工" cycleName="合成周期" onClose={vi.fn()}/>);}
beforeEach(()=>{vi.resetAllMocks();vi.mocked(hrApi.performanceRewardEvidence).mockImplementation(async(id,page)=>result(page,id));});
it('all 43 frozen references are accessible with business labels and source versions',async()=>{
 mount();await screen.findByText('SYN-0');fireEvent.click(screen.getByRole('button',{name:'奖惩依据下一页'}));await screen.findByText('SYN-20');fireEvent.click(screen.getByRole('button',{name:'奖惩依据下一页'}));await screen.findByText('SYN-42');expect(screen.getByText('第 3 / 3 页 · 共 43 条')).toBeVisible();expect(screen.getAllByText(/来源版本 3/)).toHaveLength(3);expect(screen.getByRole('button',{name:'奖惩依据下一页'})).toBeDisabled();
});
it('read outages retry same page without losing evaluation editor ownership',async()=>{
 vi.mocked(hrApi.performanceRewardEvidence).mockRejectedValueOnce(Error('read outage'));mount();await screen.findByText('read outage');fireEvent.click(screen.getByRole('button',{name:'重新读取奖惩依据'}));await screen.findByText('SYN-0');expect(hrApi.performanceRewardEvidence).toHaveBeenLastCalledWith('review',1,'synthetic-token',expect.any(AbortSignal));
});
it('null historical labels are explicit and malformed page or private object never becomes a row',async()=>{
 vi.mocked(hrApi.performanceRewardEvidence).mockResolvedValueOnce({...result(),items:result().items.map(r=>({...r,caseCode:null,kind:null,occurredOn:null}))});const view=mount();await screen.findAllByText('奖惩编号待核对');expect(screen.getAllByText(/类别待核对/)).toHaveLength(20);view.unmount();vi.mocked(hrApi.performanceRewardEvidence).mockResolvedValueOnce({...result(),items:[]});mount();await screen.findByText(/奖惩依据响应无效/);expect(screen.queryByText('SYN-0')).not.toBeInTheDocument();
});
it('closing and identity replacement abort old reads and late results cannot replace new context',async()=>{
 let done!:(v:HrPerformanceRewardEvidencePage)=>void;vi.mocked(hrApi.performanceRewardEvidence).mockReturnValueOnce(new Promise(r=>done=r));const view=mount();await waitFor(()=>expect(hrApi.performanceRewardEvidence).toHaveBeenCalledTimes(1));const signal=vi.mocked(hrApi.performanceRewardEvidence).mock.calls[0]![3]!;view.rerender(<PerformanceRewardEvidence key="other" id="other" employeeName="另一员工" cycleName="另一周期" onClose={vi.fn()}/>);await screen.findByText('SYN-0');expect(signal.aborted).toBe(true);await act(async()=>done({...result(),items:result().items.map(r=>({...r,caseCode:'OLD'}))}));expect(screen.queryByText('OLD')).not.toBeInTheDocument();expect(screen.getByText('另一员工 · 另一周期')).toBeVisible();
});
