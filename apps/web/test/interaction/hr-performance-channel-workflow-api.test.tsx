import {expect,it,vi} from 'vitest';
import {hrApi} from '../../lib/hr-api';
import {apiRequest} from '../../lib/api-client';
vi.mock('../../lib/api-client',()=>({apiRequest:vi.fn(),createIdempotencyKey:()=> 'synthetic-generated-key'}));
it('forwards exact paired revisions, scoped history pages, channel bodies, keys and cancellation',async()=>{
 vi.mocked(apiRequest).mockResolvedValue({data:{id:'synthetic'}} as Awaited<ReturnType<typeof apiRequest>>);const signal=new AbortController().signal;
 await hrApi.performanceChannelInputV2('review','token',signal);expect(apiRequest).toHaveBeenLastCalledWith('/hr/performance-v2/reviews/review/channel-input',{token:'token',signal});
 await hrApi.performanceChannelInputHistoryV2('review',3,'token',signal);expect(apiRequest).toHaveBeenLastCalledWith('/hr/performance-v2/reviews/review/channel-input/history?page=3&pageSize=10',{token:'token',signal});
 await hrApi.performanceChannelWorkflowHistoryV2('version',2,'token',signal);expect(apiRequest).toHaveBeenLastCalledWith('/hr/performance-v2/template-versions/version/channel-workflow/history?page=2&pageSize=10',{token:'token',signal});
 await hrApi.performanceCorrectionOptionsV2(4,'token',signal);expect(apiRequest).toHaveBeenLastCalledWith('/hr/performance-v2/cycles/corrections/options?page=4&pageSize=30',{token:'token',signal});
 const body={expectedRevisionId:'input-1',changes:[{detailId:'detail',field:'s',state:'VALUE',value:'9999999999999999.99',evidence:'synthetic evidence'}]};await hrApi.patchPerformanceChannelInputV2('review',body,'token','original-key');expect(apiRequest).toHaveBeenLastCalledWith('/hr/performance-v2/reviews/review/channel-input',{method:'PATCH',body,token:'token',idempotencyKey:'original-key'});
 await hrApi.completePerformanceChannelBatchV2('batch',{reviewIds:['review']},'token','batch-key');expect(apiRequest).toHaveBeenLastCalledWith('/hr/performance-v2/calibration-batches/batch/complete',{method:'POST',body:{reviewIds:['review']},token:'token',idempotencyKey:'batch-key'});
 await hrApi.previewPerformanceChannelScoreV2({reviewId:'review',inputRevisionId:'input'},'token',signal);expect(apiRequest).toHaveBeenLastCalledWith('/hr/performance-v2/score-preview',{method:'POST',body:{reviewId:'review',inputRevisionId:'input'},token:'token',signal,idempotencyKey:'synthetic-generated-key'});
 await hrApi.publishPerformanceTemplateV2('version','token','publish-key');expect(apiRequest).toHaveBeenLastCalledWith('/hr/performance-v2/templates/version/publish',{method:'POST',token:'token',idempotencyKey:'publish-key'});
});
