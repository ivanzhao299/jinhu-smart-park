import {expect, it, vi} from 'vitest';
import {hrApi} from '../../lib/hr-api';
import {apiRequest} from '../../lib/api-client';
vi.mock('../../lib/api-client', () => ({apiRequest: vi.fn(), createIdempotencyKey: () => 'generated'}));
it('preserves scoped IDs, revision/hash CAS, original request key and abort signals on all activation routes', async () => {
  vi.mocked(apiRequest).mockResolvedValue({data: {}} as Awaited<ReturnType<typeof apiRequest>>);
  const signal = new AbortController().signal;
  await hrApi.performanceSourceActivationPreview('draft/id', 'revision', 'token', signal);
  expect(apiRequest).toHaveBeenLastCalledWith('/hr/performance-v2/source-drafts/draft%2Fid/activation-preview?expectedRevisionId=revision', {token: 'token', signal});
  await hrApi.performanceSourceActivations('draft/id', 4, 'token', signal);
  expect(apiRequest).toHaveBeenLastCalledWith('/hr/performance-v2/source-drafts/draft%2Fid/activations?page=4&pageSize=10', {token: 'token', signal});
  const body = {expectedRevisionId: 'revision', expectedManifestSha256: 'manifest', expectedQualificationSha256: 'qualification', target: {mode: 'new' as const, templateCode: 'CODE', templateName: '名称', versionName: '版本'}, reason: '合成理由', acknowledgedDifferenceSha256: 'difference'};
  await hrApi.activatePerformanceSourceTemplate('draft/id', body, 'token', 'original', signal);
  expect(apiRequest).toHaveBeenLastCalledWith('/hr/performance-v2/source-drafts/draft%2Fid/activate-template', {method: 'POST', body, token: 'token', idempotencyKey: 'original', signal});
  const review = {...body, mode: 'manual_current' as const, cycleCode: 'CYCLE', cycleName: '周期'};
  await hrApi.activatePerformanceSourceReview('draft/id', review, 'token', 'review-key', signal);
  expect(apiRequest).toHaveBeenLastCalledWith('/hr/performance-v2/source-drafts/draft%2Fid/activate-review', {method: 'POST', body: review, token: 'token', idempotencyKey: 'review-key', signal});
});
