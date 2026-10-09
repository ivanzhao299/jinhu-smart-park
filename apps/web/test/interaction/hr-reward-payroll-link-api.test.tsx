import {expect,it,vi} from 'vitest';
import {hrApi} from '../../lib/hr-api';
import {apiRequest,createIdempotencyKey} from '../../lib/api-client';
vi.mock('../../lib/api-client',()=>({apiRequest:vi.fn(),createIdempotencyKey:vi.fn()}));
it('payroll reference reads preserve page and cancellation, writes preserve exact version and retry key',async()=>{
 const signal=new AbortController().signal;vi.mocked(apiRequest).mockResolvedValue({data:{items:[]}} as Awaited<ReturnType<typeof apiRequest>>);
 await hrApi.rewardPayrollLinkOptions('case',3,'synthetic-token',signal);expect(apiRequest).toHaveBeenCalledWith('/hr/rewards/cases/case/payroll-link-options?page=3&page_size=20',{token:'synthetic-token',signal});
 const body={targetType:'payroll_input' as const,targetId:'input',targetVersion:4};await hrApi.linkRewardPayrollInput('case',body,'synthetic-token','stable-key');expect(apiRequest).toHaveBeenCalledWith('/hr/rewards/cases/case/links',{method:'POST',body,token:'synthetic-token',idempotencyKey:'stable-key'});expect(createIdempotencyKey).not.toHaveBeenCalled();
});
