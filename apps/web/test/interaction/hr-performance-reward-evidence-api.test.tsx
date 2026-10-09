import {expect,it,vi} from 'vitest';
import {hrApi} from '../../lib/hr-api';
import {apiRequest} from '../../lib/api-client';
vi.mock('../../lib/api-client',()=>({apiRequest:vi.fn()}));
it('modern reward evidence uses exact review, full page and caller cancellation',async()=>{
 vi.mocked(apiRequest).mockResolvedValue({data:{items:[]}} as Awaited<ReturnType<typeof apiRequest>>);const signal=new AbortController().signal;await hrApi.performanceRewardEvidence('review-1',3,'synthetic-token',signal);expect(apiRequest).toHaveBeenCalledWith('/hr/performance-v2/reviews/review-1/reward-evidence?page=3&page_size=20',{token:'synthetic-token',signal});
});
