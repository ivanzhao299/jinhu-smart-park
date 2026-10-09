import {expect,it,vi} from 'vitest';
import {hrApi} from '../../lib/hr-api';
import {apiRequest,createIdempotencyKey} from '../../lib/api-client';
vi.mock('../../lib/api-client',()=>({apiRequest:vi.fn(),createIdempotencyKey:vi.fn()}));
it('correction preserves caller retry key and exact append-only route/body',async()=>{
 vi.mocked(apiRequest).mockResolvedValue({data:{id:'correction',sequenceNo:2}} as Awaited<ReturnType<typeof apiRequest>>);
 const body={type:'correction' as const,summary:'合成摘要',reason:'合成原因'};
 expect(await hrApi.appendRewardCorrection('case',body,'synthetic-token','stable-key')).toEqual({id:'correction',sequenceNo:2});
 expect(apiRequest).toHaveBeenCalledWith('/hr/rewards/cases/case/corrections',{method:'POST',body,token:'synthetic-token',idempotencyKey:'stable-key'});
 expect(createIdempotencyKey).not.toHaveBeenCalled();
});
it('self appeal uses stable caller key and appeal-only body on existing append route',async()=>{
 vi.mocked(apiRequest).mockResolvedValue({data:{id:'appeal',sequenceNo:2}} as Awaited<ReturnType<typeof apiRequest>>);
 const body={type:'appeal' as const,summary:'本人申诉',reason:'本人说明'};await hrApi.appendRewardAppeal('case',body,'synthetic-token','appeal-stable-key');expect(apiRequest).toHaveBeenLastCalledWith('/hr/rewards/cases/case/corrections',{method:'POST',body,token:'synthetic-token',idempotencyKey:'appeal-stable-key'});
});
