import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {beforeEach, expect, it, vi} from 'vitest';
import {emptyHrPerformanceChannelDefinition, emptyHrPerformanceWorkflowPolicy, type HrPerformanceSourceDraftDetail, type HrPerformanceSourceActivationPreview, type HrPerformanceSourceActivationReceipt} from '@jinhu/shared';
import {copyPerformanceSourcePolicies, PerformanceSourcePolicyCopy, PerformanceSourceActivation} from '../../app/hr/performance/PerformanceSourceActivation';
import type {HrPerformanceTemplateDetailV2} from '../../lib/hr-api';

const api = vi.hoisted(() => ({performanceTemplatesV2: vi.fn(), performanceTemplateDetailV2: vi.fn(), performanceChannelHistoryV2: vi.fn(), performanceChannelWorkflowHistoryV2: vi.fn(), performanceSourceActivationPreview: vi.fn(), performanceSourceActivations: vi.fn(), activatePerformanceSourceTemplate: vi.fn(), activatePerformanceSourceReview: vi.fn()}));
vi.mock('../../lib/hr-api', () => ({hrApi: api}));
vi.mock('../../lib/authz', () => ({getAccessToken: () => 'synthetic-token'}));

function source() {
  const definition = emptyHrPerformanceChannelDefinition(), workflow = emptyHrPerformanceWorkflowPolicy();
  definition.weights.sPercent = '25';
  definition.adjustmentPolicy.master.sourceSwitch = false;
  definition.items = [{id: 'item:source', name: '同项目独立明细', fullValue: '99.99', order: 0, sourceAssessmentRef: '1', guides: Array.from({length: 23}, (_, index) => ({id: `guide:${index}`, grade: `G${index}`, description: '完整指南', minValue: '0.00', maxValue: '99.99', order: index}))}];
  definition.gradeCandidates = Array.from({length: 41}, (_, index) => ({id: `grade:${index}`, code: `G${index}`, description: '完整等级', sourceOrderText: null, sourceAssessmentRef: '1', minValue: '0.00', maxValue: '99.99'}));
  workflow.detailDefinitions = Array.from({length: 101}, (_, index) => ({id: `detail:${index}`, itemId: 'item:source'}));
  workflow.detailAppraisalPolicy = {stage: null, allowedActors: [], required: null, allowExplicitNull: null};
  workflow.appealReviewAllowed.detailAppraisal = null;
  return {definition, workflow};
}
function reference(): HrPerformanceTemplateDetailV2 {
  const channelDefinition = emptyHrPerformanceChannelDefinition(), channelWorkflow = emptyHrPerformanceWorkflowPolicy();
  channelDefinition.channels.s = {businessName: '本人评分', stage: 'self_review', allowedActors: ['self'], required: true, allowExplicitNull: false};
  channelDefinition.adjustmentPolicy.master = {businessName: '综合', sourceSwitch: true, stage: 'manager_review', allowedActors: ['manager'], required: false, allowExplicitNull: true, inputMode: 'manual_with_evidence'};
  channelWorkflow.masterPolicies.appraisal = {stage: 'manager_review', allowedActors: ['manager'], required: false, allowExplicitNull: true};
  return {templateId: 'template', templateCode: 'POLICY', templateName: '合成政策', versionId: 'version', versionNo: 1, versionName: '政策一', status: 'published', calculationMode: 'five_channel_v1', channelDefinition, channelWorkflow, dimensions: [], levels: []};
}
const id = (last: number) => `00000000-0000-4000-8000-${String(last).padStart(12, '0')}`;
const hash = 'a'.repeat(64);
function saved(kind: 'template' | 'review' = 'review'): HrPerformanceSourceDraftDetail {
  const {definition, workflow} = source();
  return {draftId: id(1), kind, revisionId: id(2), revisionNo: 1, createdAt: '2026-10-17', qualification: 'NOT_EVALUATED', revision: {revisionId: id(2), revisionNo: 1, previousRevisionId: null, sourceId: id(3), origin: 'source', reason: '合成资料', createdBy: id(4), createdAt: '2026-10-17', bindingLabels: {employeeName: '合成员工', employeeCode: 'S001', orgName: '合成部门'}, manifest: {schemaVersion: 1, manifestSha256: hash, familyCounts: {template_profile: 1, level_rule: 41, dimension_profile: 1, dimension_level_guide: 23, master_result: 1, dimension_result: 101}}, snapshot: {schemaVersion: 1, records: [], definition, workflow, binding: {employeeId: id(5), orgId: id(6), startDate: '2026-07-01', endDate: '2026-07-31', businessPeriodRef: '2026-07'}}}};
}
function activationPreview(kind: 'template' | 'review' = 'review'): HrPerformanceSourceActivationPreview {
  const detail = saved(kind);
  return {draftId: detail.draftId, kind, currentRevisionId: detail.revisionId, manifestSha256: hash, qualificationHash: hash, sourceQualified: true, qualificationGateCodes: [], qualificationCounts: {}, profileIdentitySha256: hash, resolvedEmployeeId: id(5), readinessIssues: [], mapping: {profileIdentitySha256: hash, items: [{sourceIdentitySha256: hash, itemId: 'item:source'}], guides: [], grades: [], details: Array.from({length: 101}, (_, index) => ({sourceIdentitySha256: hash, detailId: `detail:${index}`, itemId: 'item:source'}))}, definitionProposal: detail.revision.snapshot.definition, workflowProposal: detail.revision.snapshot.workflow, configuredDefinition: detail.revision.snapshot.definition, configuredWorkflow: detail.revision.snapshot.workflow, binding: detail.revision.snapshot.binding, definitionDifference: {sha256: hash, count: 0, fields: []}, pendingInputDifference: {sha256: hash, count: 0, changes: []}, differenceSha256: hash, existingActivation: null, availableModes: kind === 'template' ? ['template_draft'] : ['qualified_source', 'manual_current'], salaryReferenceAvailable: false};
}
function receipt(kind: 'template' | 'review' = 'review'): HrPerformanceSourceActivationReceipt {
  return {receiptId: id(10), draftId: id(1), draftRevisionId: id(2), templateId: id(11), templateVersionId: id(12), cycleId: kind === 'review' ? id(13) : null, reviewId: kind === 'review' ? id(14) : null, inputRevisionId: kind === 'review' ? id(15) : null, outcome: 'created'};
}
async function openActivation() {
  fireEvent.click(screen.getByRole('button', {name: '查看正式办理与历史'}));
  await screen.findByLabelText('新模板编号');
}
function fillActivation() {
  for (const [label, value] of [['新模板编号', 'SYNTHETIC'], ['新模板名称', '合成正式模板'], ['新版本名称', '合成版本'], ['新考核周期编号', 'SYNTHETIC-JULY'], ['新考核周期名称', '合成七月考核'], ['正式办理理由', '完整业务核对']]) {
    fireEvent.change(screen.getByLabelText(label!), {target: {value}});
  }
  fireEvent.click(screen.getByRole('checkbox', {name: '我已核对配置与待办差异，确认按所选方式建立正式记录'}));
}
beforeEach(() => {
  vi.resetAllMocks();
  api.performanceTemplatesV2.mockResolvedValue([{id: 'template', templateName: '合成政策', templateCode: 'POLICY', calculationMode: 'dimension_weighted_v1'}]);
  api.performanceTemplateDetailV2.mockResolvedValue({...reference(),calculationMode:'dimension_weighted_v1',versionId:'current-dimension',channelDefinition:null,channelWorkflow:null,versions:[{id:'current-dimension',versionNo:2,versionName:'维度版本',calculationMode:'dimension_weighted_v1'},{id:'version',versionNo:1,versionName:'政策一',calculationMode:'five_channel_v1'}]});
  api.performanceChannelHistoryV2.mockResolvedValue({versionId: 'version', currentRevisionId: 'definition-head', items: [{id: 'definition-head', config: reference().channelDefinition}]});
  api.performanceChannelWorkflowHistoryV2.mockResolvedValue({versionId: 'version', currentRevisionId: 'workflow-head', items: [{id: 'workflow-head', definitionRevisionId: 'definition-head', policy: reference().channelWorkflow}]});
  api.performanceSourceActivationPreview.mockResolvedValue(activationPreview());
  api.performanceSourceActivations.mockResolvedValue({items: [], total: 0, page: 1, pageSize: 10});
  api.activatePerformanceSourceReview.mockResolvedValue(receipt());
  api.activatePerformanceSourceTemplate.mockResolvedValue(receipt('template'));
});

it('copies selected policies while preserving all source identities, thresholds, switches and optional detail notes', () => {
  const original = source(), template = reference();
  const result = copyPerformanceSourcePolicies(original.definition, original.workflow, template);
  expect(result.definition.items).toEqual(original.definition.items);
  expect(result.definition.gradeCandidates).toHaveLength(41);
  expect(result.workflow.detailDefinitions).toEqual(original.workflow.detailDefinitions);
  expect(new Set(result.workflow.detailDefinitions.map(row => row.id)).size).toBe(101);
  expect(result.definition.weights).toEqual(original.definition.weights);
  expect(result.definition.adjustmentPolicy.master.sourceSwitch).toBe(false);
  expect(result.definition.adjustmentPolicy.master.inputMode).toBe('manual_with_evidence');
  expect(result.definition.channels.s.businessName).toBe('本人评分');
  expect(result.workflow.masterPolicies.appraisal.stage).toBe('manager_review');
  expect(result.workflow.detailAppraisalPolicy).toEqual(original.workflow.detailAppraisalPolicy);
  expect(result.workflow.appealReviewAllowed).toHaveProperty('detailAppraisal', null);
  result.definition.channels.s.allowedActors.push('manager');
  expect(template.channelDefinition!.channels.s.allowedActors).toEqual(['self']);
  expect(original.definition.channels.s.allowedActors).toEqual([]);
});

it('loads copy options lazily, waits for the exact version and rejects mismatched target detail', async () => {
  let resolve!: (value: HrPerformanceTemplateDetailV2) => void;
  api.performanceTemplateDetailV2.mockImplementationOnce(() => new Promise(done => {resolve = done;}));
  const change = vi.fn();
  render(<PerformanceSourcePolicyCopy {...source()} disabled={false} change={change}/>);
  expect(api.performanceTemplatesV2).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name: '从已有模板复制办理政策'}));
  await screen.findByRole('option', {name: '合成政策 · POLICY'});
  fireEvent.change(screen.getByLabelText('政策参考模板'), {target: {value: 'template'}});
  await waitFor(()=>expect(api.performanceTemplateDetailV2).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText('政策参考版本')).toBeDisabled();
  expect(screen.getByRole('button', {name: '将所选政策复制到当前配置'})).toBeDisabled();
  await act(async () => resolve({...reference(), templateId: 'another-template'}));
  await screen.findByText('读取所选政策版本失败，请重新读取。');
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name: '重试读取办理政策'}));
  await screen.findByRole('option', {name: '政策一'});
  expect(screen.queryByRole('option', {name: '维度版本'})).toBeNull();
  fireEvent.change(screen.getByLabelText('政策参考版本'), {target: {value: 'version'}});
  await waitFor(() => expect(screen.getByRole('button', {name: '将所选政策复制到当前配置'})).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button', {name: '将所选政策复制到当前配置'}));
  expect(change).toHaveBeenCalledTimes(1);
  expect(change.mock.calls[0]![0].workflow.detailDefinitions).toHaveLength(101);
});

it('aborts pending policy reads on blocking and prevents late detail from changing the current draft', async () => {
  let resolve!: (value: HrPerformanceTemplateDetailV2) => void;
  api.performanceTemplateDetailV2.mockImplementation(() => new Promise(done => {resolve = done;}));
  const change = vi.fn(), props = {...source(), change};
  const view = render(<PerformanceSourcePolicyCopy {...props} disabled={false}/>);
  fireEvent.click(screen.getByRole('button', {name: '从已有模板复制办理政策'}));
  await screen.findByRole('option', {name: '合成政策 · POLICY'});
  fireEvent.change(screen.getByLabelText('政策参考模板'), {target: {value: 'template'}});
  await waitFor(() => expect(api.performanceTemplateDetailV2).toHaveBeenCalledTimes(1));
  const signal = api.performanceTemplateDetailV2.mock.calls[0]![2] as AbortSignal;
  view.rerender(<PerformanceSourcePolicyCopy {...props} disabled/>);
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(reference()));
  expect(screen.getByRole('button', {name: '将所选政策复制到当前配置'})).toBeDisabled();
  expect(change).not.toHaveBeenCalled();
});

it('freezes an uncertain activation and retries the same body/key while retaining a committed receipt after history read failure', async () => {
  api.activatePerformanceSourceReview.mockRejectedValueOnce(new Error('connection lost')).mockImplementationOnce(async () => {
    api.performanceSourceActivations.mockRejectedValueOnce(new Error('history unavailable'));
    return receipt();
  });
  const lock = {current: false}, onOpenFormal = vi.fn();
  render(<PerformanceSourceActivation detail={saved()} canManage dirty={false} writeLock={lock} configure={vi.fn()} onOpenFormal={onOpenFormal}/>);
  await openActivation(); fillActivation();
  fireEvent.click(screen.getByRole('button', {name: '启用正式考核'}));
  await screen.findByText('尚未确认启用结果，请按原请求重试。');
  expect(lock.current).toBe(true);
  expect(screen.getByLabelText('新模板编号')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', {name: '按原请求重试正式启用'}));
  await screen.findByText('正式记录已建立');
  await screen.findByText('正式记录已建立，读取办理历史失败；请重试读取，勿重复启用。');
  expect(lock.current).toBe(false);
  expect(api.activatePerformanceSourceReview).toHaveBeenCalledTimes(2);
  const calls = api.activatePerformanceSourceReview.mock.calls;
  expect(calls[1]!.slice(0, 4)).toEqual(calls[0]!.slice(0, 4));
  expect(calls[0]![1]).toMatchObject({mode: 'qualified_source', expectedRevisionId: id(2), expectedQualificationSha256: hash, acknowledgedDifferenceSha256: hash});
  api.performanceSourceActivations.mockResolvedValue({items: [], total: 0, page: 1, pageSize: 10});
  fireEvent.click(screen.getByRole('button', {name: '重试读取办理历史'}));
  await screen.findByText('暂无正式办理记录。');
  expect(api.activatePerformanceSourceReview).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', {name: '继续办理正式考核'}));
  expect(onOpenFormal).toHaveBeenCalledWith(receipt());
});

it('never silently falls back to a new current-business review and requires explicit mode selection', async () => {
  api.performanceSourceActivationPreview.mockResolvedValue({...activationPreview(), sourceQualified: false, availableModes: ['manual_current']});
  render(<PerformanceSourceActivation detail={saved()} canManage dirty={false} configure={vi.fn()}/>);
  await openActivation(); fillActivation();
  expect(screen.getByLabelText('考核建立方式')).toHaveValue('qualified_source');
  expect(screen.getByRole('button', {name: '启用正式考核'})).toBeDisabled();
  expect(api.activatePerformanceSourceReview).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('考核建立方式'), {target: {value: 'manual_current'}});
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', {name: '启用正式考核'}));
  await screen.findByText('正式记录已建立');
  expect(api.activatePerformanceSourceReview.mock.calls[0]![1]).toHaveProperty('mode', 'manual_current');
});

it('retains unsaved draft configuration, omits hidden salary differences and does not offer management actions to a reader', async () => {
  api.performanceSourceActivationPreview.mockResolvedValue({...activationPreview(), pendingInputDifference: {sha256: hash, count: 2, changes: [{family: 'master_result', sourceFactId: id(3), field: 'source_pay'}, {family: 'master_result', sourceFactId: id(3), field: 'source_appraisal', originalValue: '原始评语', currentValue: '人工评语'}]}});
  const configure = vi.fn();
  const view = render(<PerformanceSourceActivation detail={saved()} canManage dirty configure={configure}/>);
  await openActivation();
  expect(screen.getByRole('button', {name: '用来源目录建立配置草稿'})).toBeDisabled();
  fillActivation();
  expect(screen.getByRole('button', {name: '启用正式考核'})).toBeDisabled();
  expect(screen.queryByText(/source_pay/)).toBeNull();
  expect(screen.getByText('本次资料：人工评语')).toBeInTheDocument();
  expect(screen.getByText('待办 1 · 评价说明')).toBeInTheDocument();
  view.rerender(<PerformanceSourceActivation detail={saved()} canManage={false} dirty configure={configure}/>);
  expect(screen.queryByRole('button', {name: '启用正式考核'})).toBeNull();
  expect(api.activatePerformanceSourceReview).not.toHaveBeenCalled();
  expect(configure).not.toHaveBeenCalled();
});

it('rejects mismatched definition/workflow heads before copying a historical version and uses parent IDs for template detail reads', async () => {
  api.performanceChannelWorkflowHistoryV2.mockResolvedValue({versionId: 'version', currentRevisionId: 'workflow-head', items: [{id: 'workflow-head', definitionRevisionId: 'another-definition', policy: reference().channelWorkflow}]});
  const change = vi.fn();
  render(<PerformanceSourcePolicyCopy {...source()} disabled={false} change={change}/>);
  fireEvent.click(screen.getByRole('button', {name: '从已有模板复制办理政策'}));
  await screen.findByRole('option', {name: '合成政策 · POLICY'});
  fireEvent.change(screen.getByLabelText('政策参考模板'), {target: {value: 'template'}});
  await screen.findByRole('option', {name: '政策一'});
  fireEvent.change(screen.getByLabelText('政策参考版本'), {target: {value: 'version'}});
  await screen.findByText('读取所选政策版本失败，请重新读取。');
  expect(api.performanceTemplateDetailV2).toHaveBeenCalledWith('template', 'synthetic-token', expect.any(AbortSignal));
  expect(api.performanceChannelHistoryV2).toHaveBeenCalledWith('version', 1, 'synthetic-token', expect.any(AbortSignal));
  expect(api.performanceChannelWorkflowHistoryV2).toHaveBeenCalledWith('version', 1, 'synthetic-token', expect.any(AbortSignal));
  expect(change).not.toHaveBeenCalled();
  expect(screen.getByRole('button', {name: '将所选政策复制到当前配置'})).toBeDisabled();
});

it('one synchronous writer rejects an unrecognized receipt and recovers only by its original request', async () => {
  let finish!: (value: unknown) => void;
  api.activatePerformanceSourceReview.mockImplementationOnce(() => new Promise(done => {finish = done;}));
  render(<PerformanceSourceActivation detail={saved()} canManage dirty={false} configure={vi.fn()}/>);
  await openActivation(); fillActivation();
  const submit = screen.getByRole('button', {name: '启用正式考核'});
  fireEvent.click(submit); fireEvent.click(submit);
  expect(api.activatePerformanceSourceReview).toHaveBeenCalledTimes(1);
  await act(async () => finish({...receipt(), draftRevisionId: id(90)}));
  await screen.findByText('尚未确认启用结果，请按原请求重试。');
  expect(screen.queryByText('正式记录已建立')).toBeNull();
  fireEvent.click(screen.getByRole('button', {name: '按原请求重试正式启用'}));
  await screen.findByText('正式记录已建立');
  expect(api.activatePerformanceSourceReview.mock.calls[1]!.slice(0, 4)).toEqual(api.activatePerformanceSourceReview.mock.calls[0]!.slice(0, 4));
});

it('surfaces field-specific readiness and reads all history pages independently of the current source revision', async () => {
  api.performanceSourceActivationPreview.mockResolvedValue({...activationPreview(), readinessIssues: [{code: 'DETAIL_APPRAISAL_POLICY_REQUIRED', field: 'workflow.detailAppraisalPolicy'}, {code: 'EMPLOYEE_ORG_MISMATCH', field: 'binding.orgId'}]});
  api.performanceSourceActivations.mockResolvedValue({items: [], total: 21, page: 1, pageSize: 10});
  render(<PerformanceSourceActivation detail={saved()} canManage dirty={false} configure={vi.fn()}/>);
  await openActivation();
  expect(screen.getByText('资料有逐条明细评语，请明确启用明细评语并配置其办理政策。')).toBeInTheDocument();
  expect(screen.getByText('绑定组织与员工当前所属组织不一致，请核对。')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: '办理历史下一页'}));
  await waitFor(() => expect(api.performanceSourceActivations).toHaveBeenLastCalledWith(id(1), 2, 'synthetic-token', expect.any(AbortSignal)));
  expect(api.performanceSourceActivationPreview).toHaveBeenCalledTimes(1);
});

it('freezes all current target heads and refuses a receipt for another parent before original-request recovery',async()=>{
  const parent=id(80),version=id(81),definition=id(82),workflow=id(83);
  api.performanceTemplatesV2.mockResolvedValue([{id:parent,templateCode:'CURRENT',templateName:'当前正式模板',calculationMode:'five_channel_v1',versionId:version,versionName:'当前版本'}]);
  let finish!:(value:HrPerformanceTemplateDetailV2)=>void;
  api.performanceTemplateDetailV2.mockImplementationOnce(()=>new Promise(done=>{finish=done;}));
  api.activatePerformanceSourceReview.mockResolvedValueOnce(receipt()).mockResolvedValueOnce({...receipt(),templateId:parent});
  render(<PerformanceSourceActivation detail={saved()} canManage dirty={false} configure={vi.fn()}/>);
  await openActivation();fillActivation();
  fireEvent.change(screen.getByLabelText('正式模板目标'),{target:{value:'new_version'}});
  await screen.findByRole('option',{name:'当前正式模板 · CURRENT'});
  fireEvent.change(screen.getByLabelText('目标正式模板'),{target:{value:parent}});
  fireEvent.click(screen.getByRole('checkbox'));
  await waitFor(()=>expect(api.performanceTemplateDetailV2).toHaveBeenCalledWith(parent,'synthetic-token',expect.any(AbortSignal)));
  expect(screen.getByRole('button',{name:'启用正式考核'})).toBeDisabled();
  await act(async()=>finish({...reference(),templateId:parent,versionId:version,versionName:'当前版本',currentRevisionId:definition,workflowRevisionId:workflow}));
  await screen.findByText('基于当前版本：当前版本。启用时将再次核对该版本是否已变化。');
  fireEvent.click(screen.getByRole('button',{name:'启用正式考核'}));
  await screen.findByText('尚未确认启用结果，请按原请求重试。');
  expect(screen.queryByText('正式记录已建立')).toBeNull();
  expect(screen.getByLabelText('目标正式模板')).toBeDisabled();
  const body=api.activatePerformanceSourceReview.mock.calls[0]![1];
  expect(body.target).toEqual({mode:'new_version',templateId:parent,expectedVersionId:version,expectedDefinitionRevisionId:definition,expectedWorkflowRevisionId:workflow,versionName:'合成版本'});
  fireEvent.click(screen.getByRole('button',{name:'按原请求重试正式启用'}));
  await screen.findByText('正式记录已建立');
  expect(api.activatePerformanceSourceReview.mock.calls[1]!.slice(0,4)).toEqual(api.activatePerformanceSourceReview.mock.calls[0]!.slice(0,4));
});


it('shows business labels and accepts complete Unicode activation names while rejecting excess code points', async () => {
  const preview = activationPreview();
  preview.definitionDifference = {sha256: hash, count: 2, fields: ['definition.channels', 'definition.gradeCandidates']};
  api.performanceSourceActivationPreview.mockResolvedValue(preview);
  api.activatePerformanceSourceReview.mockResolvedValue(receipt());
  render(<PerformanceSourceActivation detail={saved()} canManage dirty={false} configure={vi.fn()}/>);
  await openActivation();
  expect(screen.getByText('渠道办理政策')).toBeInTheDocument();
  expect(screen.getByText('考核等级')).toBeInTheDocument();
  expect(screen.queryByText('definition.channels')).not.toBeInTheDocument();
  fillActivation();
  for (const [label, limit] of [['新模板编号', 64], ['新模板名称', 120], ['新版本名称', 120], ['新考核周期编号', 64], ['新考核周期名称', 120], ['正式办理理由', 2000]] as const) {
    expect(screen.getByLabelText(label)).toHaveAttribute('maxlength', String(limit * 2));
    fireEvent.change(screen.getByLabelText(label), {target: {value: '𠮷'.repeat(limit)}});
  }
  fireEvent.change(screen.getByLabelText('新模板名称'), {target: {value: '𠮷'.repeat(121)}});
  fireEvent.click(screen.getByRole('button', {name: '启用正式考核'}));
  expect(api.activatePerformanceSourceReview).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('新模板名称'), {target: {value: '𠮷'.repeat(120)}});
  fireEvent.click(screen.getByRole('button', {name: '启用正式考核'}));
  await waitFor(() => expect(api.activatePerformanceSourceReview).toHaveBeenCalledTimes(1));
  const body = api.activatePerformanceSourceReview.mock.calls[0]![1];
  expect(body.target.templateName).toBe('𠮷'.repeat(120));
  expect(body.reason).toBe('𠮷'.repeat(2000));
});
