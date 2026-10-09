import {beforeEach,expect,it,vi} from 'vitest';
import {hrApi} from '../../lib/hr-api';
import {apiRequest,createIdempotencyKey} from '../../lib/api-client';
vi.mock('../../lib/api-client',()=>({apiRequest:vi.fn(),createIdempotencyKey:vi.fn()}));
beforeEach(()=>{vi.clearAllMocks();vi.mocked(apiRequest).mockResolvedValue({data:{}} as Awaited<ReturnType<typeof apiRequest>>);vi.mocked(createIdempotencyKey).mockReturnValue('generated');});
it('category versions preserve exact paged read cancellation and caller publication key',async()=>{const signal=new AbortController().signal,body={expectedVersionNo:23,kind:'reward',name:'合成新制度',impactLevel:'normal',description:'合成说明'};await hrApi.rewardCategoryVersions('category',2,'synthetic-token',signal);expect(apiRequest).toHaveBeenLastCalledWith('/hr/rewards/categories/category/versions?page=2&page_size=20',{token:'synthetic-token',signal});await hrApi.publishRewardCategoryVersion('category',body,'synthetic-token','stable-key');expect(apiRequest).toHaveBeenLastCalledWith('/hr/rewards/categories/category/versions',{method:'POST',body,token:'synthetic-token',idempotencyKey:'stable-key'});expect(createIdempotencyKey).not.toHaveBeenCalled();});
