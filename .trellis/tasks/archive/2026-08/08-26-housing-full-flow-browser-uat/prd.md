# 住房出租全流程真实浏览器 UAT 与缺陷闭环

## Goal

在隔离环境中依照 `docs/testing/windows-chrome-cdp-uat.md` 四阶段门禁，对住房出租模块执行设计驱动的真实 Chrome 全流程 UAT；产品缺陷按独立 Issue/PR 修复并上线后自动复测，形成可审计报告、local-only 证据和 Trellis 终态。

## Confirmed facts

- 权威设计来自住房 MVP、PR192 住房工作台、Issue #244、Issue #336、shared property-business manifest 与 AGENTS.md 财务规则；Issue #336 的技术收口不能替代本轮真人浏览器 UAT。
- 模块依赖为 `housing_rental + asset`；菜单由 `PROPERTY_BUSINESS_SURFACES` 构建，覆盖 dashboard/tasks/tenants/leases/handovers/billing/finance/repairs/purchases。
- 已实现租约、账单、流水/押金、交割、报修、采购、派生任务和 dashboard 链；高风险 mutation 必须通过 property approval maker-checker。
- 既有技术证据仍保留真人岗位签署与跨园区等限制；旧视觉 mock 不作为真实 UAT 证据。

## Requirements

- 阶段 0 先产出设计-实现闭环审计表，覆盖 asset 外键/scope、approval adapter、property-shared 选择器/草稿、状态机、财务边界、菜单/路由/权限、API/Web 接线、校验、TODO、数据链与 multi-tenant 语义；未闭合链条只记 gap，不进浏览器矩阵。
- 阶段 1 从已闭合设计推导角色 × 流程链矩阵，覆盖管理员、住房业务岗、窄权限岗、审批岗，并在 fixture 可行时覆盖跨园区。
- 阶段 2 使用新实测端口、独立 compose/DB/API/Web/profile、`UAT_HOUSING_<RUN_ID>_` fixture 与 `/tmp/jinhu-housing-uat-<RUN_ID>/` 证据根；fixture 通过现有 UI 建链，不以 SQL 直插代替 UI 操作。
- 阶段 3 用专用 CDP 9222 的真实 Windows Chrome 执行 desktop 与 phone-width 交互；每 Case 保存 snapshot/console/network/viewport 和非零截图 manifest。环境同题最多重试两次，产品 FAIL 只记录，首轮验收不修改产品代码。
- 首轮报告进入独立证据分支、PR、Codex review（最多三轮）、CI、squash merge，并核验 main CI 与 Deploy Production 双绿。
- 对产品发现建立分级修复队列；每项独立 GitHub Issue、Trellis 子任务、`codex/fix-housing-*` 分支、最小修复与测试、PR/review/CI/merge/main 双绿，禁止 force push。
- 全部修复上线后自动复测 FAIL/gap 与防回退场景，真实运行 housing PostgreSQL spec，完成 residual 六类逐表 before/after=0，提交复测报告 PR。
- 复测 PASS 才归档本轮 UAT；真人岗位具名签署、跨园区受 fixture 限制等外部门按事实保留。
- 报告和证据不得包含密码、JWT、Cookie、连接串或敏感个人信息；不操作生产、不触碰他人容器、Chrome、PR 或分支。

## Acceptance Criteria

- [ ] 首轮报告包含元数据、设计依据、闭环审计表、流程链矩阵、Case 统计、gap/FAIL、清理审计与发布限制。
- [ ] 真实 Chrome Case 具有 URL/DOM/交互/console/network/截图证据；截图位于报告声明的 `/tmp` 绝对路径且 manifest 可核验非零文件数。
- [ ] 主链覆盖租约创建→审批/签署/生效→账单→支付/核销→交割/退租/押金，以及维修、采购、任务、dashboard；所有设计分支要么执行，要么明确 gap/Blocked 原因。
- [ ] 权限矩阵验证 module/page/action/data/field/file 分层、审批人与申请人隔离、403/404 fail-closed、园区/unit scope。
- [ ] 幂等 replay/conflict、终态写拒绝、void/财务审计保留、部分支付、并发保护与 asset eligibility 具有证据。
- [ ] 每个确认产品缺陷均有 issue/PR/commit/review/CI/Deploy 记录，修复上线后对应 before/after 复测 PASS。
- [ ] `housing-checkout-concurrency.pg.spec.ts` 在真实 PostgreSQL 上 0 skip PASS；若发现更相关 housing PG spec，一并真实运行并报告。
- [ ] housing 业务表、asset 底座、副作用表与 party/identity/approval/outbox/workorder/file 六类 residual 使用冻结谓词逐表记录 before/after，清理后为 0；软删除也计 residual。
- [ ] 本轮独立 API/Web/DB 进程、容器、卷、网络、端口和文件根按 SOP 精确清理，未影响他人资源。
- [ ] 首轮与复测报告分别经 PR/review/CI/merge，main CI+Deploy 双绿；Trellis 仅在复测 PASS 后归档。

## Out of scope

- 生产环境直接操作、启用住房生产开关、替代业务/财务/安全真人具名签署。
- 未被本轮审计或浏览器证据触发的重构、依赖升级和非住房模块修改。
- 用 SQL 直接制造业务终态来冒充 UI fixture 或浏览器交互。

## Open questions

- 无阻断性产品意图问题；跨园区、真人签署和外部基础设施限制按实测标记，不推断为 PASS。
