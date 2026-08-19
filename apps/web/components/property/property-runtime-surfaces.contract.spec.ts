import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const componentRoot = __dirname;
const webRoot = resolve(componentRoot, "../..");

test("control-plane and embedded runtime use DS surfaces with accessibility fallbacks", () => {
  const control = readFileSync(resolve(componentRoot, "PropertyControlPlaneClient.tsx"), "utf8");
  const controlCss = readFileSync(resolve(componentRoot, "PropertyControlPlane.module.css"), "utf8");
  const runtime = readFileSync(resolve(componentRoot, "PropertyRuntimeSlots.tsx"), "utf8");
  const runtimeCss = readFileSync(resolve(componentRoot, "PropertyRuntimeSlots.module.css"), "utf8");

  assert.match(control, /<PropertyPageSurface/);
  assert.match(control, /<PropertyPanelSurface/);
  assert.match(control, /className="ds-hero"/);
  assert.match(control, /className="ds-hero-copy"/);
  assert.match(runtime, /className="ds-command-grid"/);
  assert.match(runtime, /ds-command-card/);
  assert.doesNotMatch(runtime, /<div className="ds-page">/);
  for (const css of [controlCss, runtimeCss]) {
    assert.match(css, /:focus-visible/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /@media \(forced-colors: active\)/);
    assert.match(css, /outline: 2px solid Highlight/);
    assert.match(css, /background-image: none/);
    assert.match(css, /box-shadow: none/);
  }
});

test("identity detail deep-link targets a focusable Party identity section", () => {
  const control = readFileSync(resolve(componentRoot, "PropertyControlPlaneClient.tsx"), "utf8");
  const fileUploader = readFileSync(resolve(webRoot, "components/files/FileUploader.tsx"), "utf8");
  const party = readFileSync(resolve(webRoot, "app/assets/parties/PartyDetailClient.tsx"), "utf8");

  assert.match(control, /title: "身份核验工作台"/);
  assert.doesNotMatch(control, /身份核验目录/);
  assert.match(control, /\?tab=identity#identity/);
  assert.match(control, /IdentityDraftCreatePanel/);
  assert.match(control, /创建身份核验草稿/);
  assert.match(control, /"\/property\/identity-submissions"/);
  assert.match(control, /IdentityTerminalCasProjection/);
  assert.match(control, /terminal-cas/);
  assert.match(control, /terminalCasRefreshKey/);
  assert.match(control, /setTerminalCasRefreshKey\(\(current\) => current \+ 1\)/);
  assert.match(control, /terminalCas\?\.terminalSubmission/);
  assert.match(control, /terminalCasPending/);
  assert.match(control, /terminalCasUnavailable/);
  assert.match(control, /terminalCasActiveSubmission/);
  assert.match(control, /terminalCasBlocked/);
  assert.match(control, /正在核对 Party 当前身份版本/);
  assert.match(control, /Party 当前身份版本核对失败/);
  assert.match(control, /Party 当前存在草稿或待核验提交/);
  assert.match(control, /method: "POST"/);
  assert.match(control, /supersedesSubmissionId/);
  assert.match(control, /expectedSupersededStatus/);
  assert.match(control, /expectedSupersededVersion/);
  assert.match(control, /PARTY_IDENTITY_UPDATE/);
  assert.match(control, /IdentityDraftEditPanel/);
  assert.match(control, /IdentityDraftEditState/);
  assert.match(control, /identityDraftEditState/);
  assert.match(control, /onDraftStateChange=\{setIdentityDraftEditState\}/);
  assert.match(control, /identityAction === "party\.identity\.submit"/);
  assert.match(control, /身份核验草稿有未保存修改/);
  assert.match(control, /身份核验草稿正在保存或上传/);
  assert.match(control, /draftDirty/);
  assert.match(control, /draftBusy/);
  assert.match(control, /onDraftStateChange\(\{ dirty: draftDirty, busy: draftBusy \}\)/);
  assert.match(control, /removedInitialFileIds/);
  assert.match(control, /deleteKeys/);
  assert.match(control, /deletedEvidenceFileIds/);
  assert.match(control, /identityEvidenceDeleteKey/);
  assert.match(control, /abandonedPendingFileIds/);
  assert.match(control, /activeDraftId/);
  assert.match(control, /cleanupAbandonedPendingIdentityEvidence/);
  assert.match(control, /deleteIdentityEvidenceFile/);
  assert.match(control, /abandonedPendingFileIds\.current\.add\(file\.id\)/);
  assert.match(control, /activeDraftId\.current !== detail\.id/);
  assert.match(control, /deleteIdentityEvidenceFile\(file\.id\)/);
  assert.match(control, /SYSTEM_PERMISSIONS\.FILE_UPLOAD/);
  assert.match(control, /SYSTEM_PERMISSIONS\.FILE_DELETE/);
  assert.match(control, /缺少文件上传或清理权限/);
  assert.match(control, /canDeleteIdentityEvidence/);
  assert.match(control, /removedInitialFileIds\.size > 0 && !canDeleteIdentityEvidence/);
  assert.match(control, /缺少文件清理权限，不能移除已保存的身份核验证据/);
  assert.match(control, /onRemove=\{canDeleteIdentityEvidence \?/);
  assert.match(control, /activeDraftId\.current = null/);
  assert.match(control, /abandonedPendingFileIds\.current\.clear\(\)/);
  assert.match(control, /initialFileIds\.current\.has\(fileId\)/);
  assert.ok(
    !control.includes("for (const fileId of removedInitialFileIds)"),
    "saved identity evidence deletion is handled atomically by the draft update API"
  );
  assert.match(control, /deletedEvidenceFileIds\.current\.has\(fileId\)/);
  assert.match(control, /编辑身份核验草稿/);
  assert.match(control, /method: "PUT"/);
  assert.match(control, /pendingFileIds/);
  assert.match(control, /<FileUploader/);
  assert.match(control, /<PendingAttachmentList/);
  assert.match(control, /bizType="party_identity_evidence"/);
  assert.match(fileUploader, /formatAcceptedMimeLabel/);
  assert.match(fileUploader, /"application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet": "XLSX"/);
  assert.match(fileUploader, /"application\/vnd\.ms-excel": "XLS"/);
  assert.match(control, /name="party_id"/);
  assert.match(control, /name="expected_identity_version"/);
  assert.match(control, /name="document_type"/);
  assert.match(control, /name="identity_number"/);
  assert.match(control, /name="identity_action_reason"/);
  assert.match(control, /证件类型和证件号码需要同时填写或同时留空/);
  assert.match(control, /hasNewEvidenceFiles/);
  assert.match(control, /preservesExistingIdentity/);
  assert.match(control, /identityNumberRequired/);
  assert.match(control, /required=\{identityNumberRequired\}/);
  assert.match(control, /removePendingIdentityEvidence/);
  assert.match(control, /method: "DELETE"/);
  assert.match(control, /party-identity-evidence-delete-\$\{fileId\}/);
  assert.match(control, /上传证据文件前请先填写证件类型和证件号码/);
  assert.match(control, /\^\[A-Za-z0-9\]\{5,20\}/);
  assert.match(control, /IdentityAuditPanel/);
  assert.match(control, /canReadIdentityAudit/);
  assert.match(control, /\/audit\?page=\$\{nextPage\}&pageSize=20&sort=occurredAt&order=desc/);
  assert.match(control, /身份核验审计分页/);
  assert.match(control, /PARTY_SENSITIVE_READ/);
  assert.match(control, /SYSTEM_PERMISSIONS\.AUDIT_READ/);
  assert.match(control, /身份核验审计时间线/);
  assert.match(party, /searchParams\.get\("tab"\) === "identity"/);
  assert.match(party, /getElementById\("identity"\)/);
  assert.match(party, /id="identity" tabIndex=\{-1\}/);
});

test("property control-plane routes inherit the authenticated dashboard context", () => {
  const layout = readFileSync(resolve(webRoot, "app/property/layout.tsx"), "utf8");

  assert.match(layout, /import \{ DashboardLayout \}/);
  assert.match(layout, /<DashboardLayout>\{children\}<\/DashboardLayout>/);
});

test("shared property foundation exposes three guarded control planes and unit shortcuts", () => {
  const foundation = readFileSync(resolve(componentRoot, "PropertyFoundationControlClient.tsx"), "utf8");
  const operations = readFileSync(resolve(webRoot, "app/assets/property-operations/page.tsx"), "utf8");
  const occupancies = readFileSync(resolve(webRoot, "app/assets/property-occupancies/page.tsx"), "utf8");
  const transitions = readFileSync(resolve(webRoot, "app/assets/property-mode-transitions/page.tsx"), "utf8");
  const unitDrawer = readFileSync(resolve(webRoot, "app/assets/units/components/UnitDetailDrawer.tsx"), "utf8");

  assert.match(foundation, /<PropertyPageSurface/);
  assert.match(foundation, /<PropertyPanelSurface/);
  assert.match(foundation, /<PropertyResponsiveRecords/);
  assert.match(operations, /PROPERTY_OPERATIONS_PAGE/);
  assert.match(operations, /PROPERTY_OPERATION_READ/);
  assert.match(occupancies, /PROPERTY_OCCUPANCIES_PAGE/);
  assert.match(occupancies, /PROPERTY_OCCUPANCY_READ/);
  assert.match(transitions, /PROPERTY_MODE_TRANSITIONS_PAGE/);
  assert.match(transitions, /PROPERTY_APPROVAL_READ/);
  assert.match(unitDrawer, /assets\/property-operations/);
  assert.match(unitDrawer, /assets\/property-occupancies\?unitId=/);
  assert.match(unitDrawer, /assets\/property-mode-transitions\?unitId=/);
  assert.match(unitDrawer, /PROPERTY_OPERATIONS_PAGE[\s\S]*PROPERTY_OPERATION_READ[\s\S]*经营配置/);
  assert.match(unitDrawer, /PROPERTY_OCCUPANCIES_PAGE[\s\S]*PROPERTY_OCCUPANCY_READ[\s\S]*占用记录/);
  assert.match(unitDrawer, /PROPERTY_MODE_TRANSITIONS_PAGE[\s\S]*PROPERTY_APPROVAL_READ[\s\S]*模式审计/);
  assert.match(foundation, /version: item\.version/);
  assert.match(foundation, /unitCode: string/);
  assert.match(foundation, /unitName: string/);
  assert.match(foundation, /label: "房源"/);
  assert.match(foundation, /params\.set\("keyword", keyword\.trim\(\)\)/);
  assert.match(foundation, /name="keyword"/);
  assert.match(foundation, /name="building_id"/);
  assert.match(foundation, /name="configured_mode"/);
  assert.match(foundation, /name="source_domain"/);
  assert.match(foundation, /name="start_from"/);
  assert.match(foundation, /name="manual_unit_id"/);
  assert.match(foundation, /name="manual_start_at"/);
  assert.match(foundation, /name="asset_unit_id"/);
  assert.match(foundation, /name="target_mode"/);
  assert.match(foundation, /params\.set\("sourceDomain", sourceDomain\)/);
  assert.match(foundation, /value="apartment">公寓/);
  assert.match(foundation, /params\.set\("sourceType", sourceType\.trim\(\)\)/);
  assert.match(foundation, /params\.set\("status", occupancyStatus\)/);
  assert.match(foundation, /label: "保留到期"/);
  assert.match(foundation, /label: "释放信息"/);
  assert.match(foundation, /releaseKeys = useRef/);
  assert.match(foundation, /PROPERTY_OCCUPANCY_ACTIVATE/);
  assert.match(foundation, /\/property\/occupancies\/\$\{encodeURIComponent\(id\)\}\/activate/);
  assert.match(foundation, /createIdempotencyKey\("property-occupancy-activate"\)/);
  assert.match(foundation, /status === "held"/);
  assert.match(foundation, /canActivateOccupancy/);
  assert.match(foundation, /\["maintenance", "operations"\]\.includes\(row\.sourceDomain\)/);
  assert.match(foundation, /激活保留占用/);
  assert.match(foundation, /requestId\?: string \| null/);
  assert.match(foundation, /ModeTransitionDetailPanel/);
  assert.match(foundation, /setSelectedModeTransition\(\(current\) =>/);
  assert.match(foundation, /modeTransitionRecordKey\(item as ModeTransitionRow\) === modeTransitionRecordKey\(current\)/);
  assert.match(foundation, /经营模式审计详情/);
  assert.match(foundation, /查看审计详情/);
  assert.match(foundation, /row\.requestId \?\? "历史执行日志"/);
  assert.match(foundation, /PROPERTY_OPERATIONS_PAGE[\s\S]*PROPERTY_OPERATION_READ[\s\S]*查看房源经营详情/);
  assert.match(foundation, /Date\.parse\(row\.holdExpiresAt\) > Date\.now\(\)/);
  assert.match(foundation, /OPERATING_MODE_LABELS/);
  assert.match(foundation, /OPERATING_STATUS_LABELS/);
  assert.match(foundation, /function formatOperatingMode/);
  assert.match(foundation, /function formatOperatingStatus/);
  assert.match(foundation, /function formatBuildingLabel/);
  assert.match(foundation, /function formatAssetUnitLabel/);
  assert.match(foundation, /formatOperatingMode\(\(item as OperationRow\)\.configuredMode\)/);
  assert.match(foundation, /formatOperatingStatus\(\(item as OperationRow\)\.operationStatus\)/);
  assert.match(foundation, /`\$\{formatBuildingLabel\(row\)\} \/ \$\{formatAssetUnitLabel\(row\)\}`/);
  assert.doesNotMatch(foundation, /label: "经营模式", render: \(item\) => \(item as OperationRow\)\.configuredMode/);
  assert.doesNotMatch(foundation, /label: "经营状态", render: \(item\) => \(item as OperationRow\)\.operationStatus/);
  assert.doesNotMatch(foundation, /return `\$\{row\.buildingId \|\| "—"\} \/ \$\{row\.assetUnitId \|\| "—"\}`/);
  for (const parameter of ["buildingId", "configuredMode", "operationStatus", "blockerCode"]) {
    assert.match(foundation, new RegExp(`params\\.set\\("${parameter}"`));
  }
  for (const label of ["楼栋 / 物理房源", "生效时间", "暂停/停用原因", "当前占用", "切换原因", "操作人", "审批时间", "执行时间"]) {
    assert.match(foundation, new RegExp(`label: "${label}"`));
  }
  assert.match(foundation, /row\.deepLink\?\.startsWith\("\/"\)/);
  assert.match(foundation, /asset_unit_id: assetUnitId\.trim\(\) \|\| null/);
  assert.match(foundation, /transitionPayload\.current !== payloadFingerprint/);
  assert.match(foundation, /label: "检查快照"/);
  assert.match(foundation, /modeTransitionSnapshotSummary/);
  assert.match(foundation, /blocking_reasons/);
  assert.match(foundation, /OCCUPANCY_STATUS_LABELS/);
  assert.match(foundation, /DECISION_STATUS_LABELS/);
  assert.match(foundation, /EXECUTION_STATUS_LABELS/);
  assert.match(foundation, /SOURCE_TYPE_LABELS/);
  assert.match(foundation, /sourceTypeLabel\(\(item as OccupancyRow\)\.sourceType\)/);
  assert.match(foundation, /occupancyStatusLabel\(\(item as OccupancyRow\)\.status\)/);
  assert.match(foundation, /value="not_required">\{EXECUTION_STATUS_LABELS\.not_required\}/);
  assert.match(foundation, /setRemark\(item\.remark \?\? ""\)/);
  assert.match(foundation, /remark: remark\.trim\(\) \|\| null/);
  assert.match(foundation, /label: "备注"/);
  assert.match(foundation, /!isTerminalOccupancy\(detail as OccupancyRow\) && !isManualOccupancy\(detail as OccupancyRow\)/);
  const manualCreate = foundation.slice(
    foundation.indexOf("function ManualOccupancyCreatePanel"),
    foundation.indexOf("function FoundationRecords")
  );
  assert.ok(
    manualCreate.indexOf('"/property/occupancies/availability"')
      < manualCreate.indexOf('"/property/occupancies",'),
    "manual locks must run the availability check before the create request"
  );
  assert.match(foundation, /availability\.data\.conflicts/);
  assert.match(foundation, /aria-label="可用性冲突"/);
  assert.match(manualCreate, /conflict\.sourceId/);
  assert.match(manualCreate, /exactRetry = retryKey\.current !== null && retryPayload\.current === payloadFingerprint/);
  assert.match(manualCreate, /createIdempotencyKey\("property-occupancy-availability"\)/);
  assert.match(manualCreate, /idempotencyKey: availabilityKey\.current/);
  assert.match(foundation, /releasePayloads\.current\[mode\] !== payloadFingerprint/);
  assert.match(foundation, /releasePayloads\.current\[releaseMode\] = null/);
});

test("the authenticated shell suppresses motion globally when the user requests it", () => {
  const globals = readFileSync(resolve(webRoot, "app/globals.css"), "utf8");

  assert.match(globals, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(globals, /animation-duration: 0\.01ms !important/);
  assert.match(globals, /animation-iteration-count: 1 !important/);
  assert.match(globals, /transition-duration: 0\.01ms !important/);
  assert.match(globals, /scroll-behavior: auto !important/);
});
