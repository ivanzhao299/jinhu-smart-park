# 权限管理机制与三模块符合性审计

> 审计日期：2026-08-27
> 事实基线：`origin/main@2526b577a1fa9db84aa3b1f706fbc5635f05be5a`
> 范围：`housing_rental`、`homestay`、`property/asset`（含 property approvals、tasks、operation config）
> 方法：源码、SQL、测试、现有 UAT/历史 PR 只读核查；未连接生产、未执行真实浏览器或数据库写入
> 结论标记：**静态确认**表示可由当前代码直接推出；**建议 UAT**表示仍依赖运行时角色实例、租户数据或交互验证。

## 一、结论摘要

当前权限体系已经形成 module → page → action → data → field → file 的分层框架，并具备权限包/角色模板 hash 演进、逐租户 reconcile、maker-checker、effect receipt/audit、跨 tenant/park scope 和共享底座委托等较完整的 fail-closed 机制。

三模块总体结论：

- `housing_rental`：**基本符合**。九个 canonical surface 的菜单、路由、page/action API、scope、字段/文件、审批与共享底座链路均已接线。#410 与 #413 在当前基线已修复。跨租户/跨园区和多角色叠加仍需 UAT。
- `homestay`：**部分符合**。权限码、surface、action、scope、字段/文件与审批框架完整；`ModuleGuard` 消费的有效模块集合已经闭合 `asset` 硬依赖。当前差距集中在 Web 空树 fallback、首跳树不一致和授权刷新语义，而不是 API 模块旁路。
- `property/asset`：**基本符合**。approval/task/operation/file 委托均保留 tenant/park/data scope，maker-checker-executor 与不可变审计较完整；独立 property runtime surface 尚未纳入与住房/民宿同形的 access-manifest，字段策略也主要覆盖 asset CRUD 和两上层模块的 GET 投影。

最终问题统计：**P0 0 项、P1 2 项、P2 1 项**。首轮候选 PAM-001/002/003 已在 `@codex review` 后核销；另有运行时证据缺口，不作为已确认产品缺陷计数。

## 二、机制设计要求（MEC）

| 编号 | 设计要求 | 设计声明出处 | 可检验的符合性判据 |
| --- | --- | --- | --- |
| MEC-1 | 分层 fail-closed：module 启用后仍须分别通过 page、action/API、data、field、file。任一受保护 API 未声明权限应拒绝。 | 六层结构见 `packages/shared/src/property-business/access-manifest.ts:83-97`；全局 guard 顺序见 `apps/api/src/app.module.ts:221-240`；无权限元数据拒绝见 `apps/api/src/shared/guards/permission.guard.ts:15-58`；文件二次业务授权见 `apps/api/src/modules/files/file-business-access.service.ts:111-200`。 | 每个 canonical feature 声明 required module/dependencies、page、actions、data、fields、files；controller 的 module/permission metadata 不弱于 manifest；data/field/file 不能只靠前端隐藏。 |
| MEC-2 | 权限包和角色模板为可演进契约：成员集合、顺序、version/hash、模板签名和实例 reconcile 必须一致且 fail-closed。 | bundle 校验见 `packages/shared/src/property-business/permission-bundles.ts:312-345`；模板解析与 revision 校验见 `packages/shared/src/property-business/role-templates.ts:230-302`；production seed 基数断言见 `database/seeds/production/000006_property_track_b_permission_reconcile.sql:314-399`；模板 reconcile 见 `database/seeds/production/000015_property_role_template_reconcile.sql:53-84,230-289`。 | shared 测试独立重算 hash；seed 双向比对定义和固定基数；迁移只接受精确前驱；已有租户按 tenant 逐户校验和 reconcile，缺失/重复/禁用均失败。 |
| MEC-3 | 菜单、路由、按钮与 API 是同一能力的不同投影，必须三方一致；深链和 legacy alias 也要 fail-closed。 | canonical surface 菜单构建见 `apps/web/lib/menu.ts:161-186,301-313`；动态菜单 metadata 校验见 `apps/api/src/modules/users/users.service.ts:1712-1814`；住房路由边界见 `apps/web/app/housing/_components/HousingRouteBoundary.tsx:14-39`；民宿边界见 `apps/web/app/homestay/_components/HomestayRouteGuard.tsx:8-32`。 | page permission 决定菜单和 route；action capability 与 controller decorator 一致；未知 canonical route 与受保护 approval source 被拒，legacy alias 仅进入受控 landing；页面所需初始请求不因岗位模板缺权而 403；API 能力若无菜单须有明确的委托/深链/无 UI 理由。 |
| MEC-4 | tenant、park 与业务数据范围独立收敛；园区切换后权限、role link、scope predicate 必须全部基于新 scope。 | JWT scope 来源见 `apps/api/src/shared/decorators/current-scope.decorator.ts:6-11`；用户/park 有效性见 `apps/api/src/modules/users/users.service.ts:599-625`；role link scope 见 `apps/api/src/modules/users/users.service.ts:1663-1687`；空范围 `1=0` 见 `apps/api/src/modules/data-scopes/data-scope.service.ts:270-278`。 | 查询/写入/审批/文件引用均含 tenant+park；building/floor/unit/assignee 等声明维度实际进入谓词；空 scope 拒绝而非放宽；迁移 cardinality 不做跨租户全局唯一假设。 |
| MEC-5 | 字段与文件为服务端授权层：敏感字段投影、受保护文件通用权限与领域权限都必须实际接线。 | 字段优先级及投影见 `apps/api/src/modules/field-policies/field-policy.service.ts:184-227,451-472`；住房/民宿 GET interceptor 见 `apps/api/src/modules/field-policies/property-field-policy.interceptor.ts:8-54`；文件 controller 权限见 `apps/api/src/modules/files/files.controller.ts:39-116`；文件 tenant/park 和引用校验见 `apps/api/src/modules/files/files.service.ts:266-295,379-395`。 | 每个声明为 hidden/masked 的响应路径经过字段策略；写字段若纳入策略则在持久化前拒绝；文件同时满足 `file:*`、biz type/domain permission、tenant/park/data scope、引用状态与删除保护。 |
| MEC-6 | 高风险写遵守 maker-checker、幂等、不可变 effect audit；发起、审批、执行主体与权限边界明确。 | manifest mutation 默认幂等及 high-risk approval policy 见 `packages/shared/src/property-business/access-manifest.ts:125-157,1014-1080`；checker 排除规则见 `apps/api/src/modules/property-approvals/property-approval.service.ts:918-934`；effect worker fence 见同文件 `:1205-1233`；不可变 trigger 见 `database/migrations/000191_property_b_homestay_effect_schema.sql:246-286`。 | 高风险 endpoint 有 idempotency 与 approval policy，controller/全局审计接线另行点验；requester/submitter/source creator 不能 checker；effect 由 claim/fence 执行并可重试不重复；decision/effect audit 不可修改。 |
| MEC-7 | 跨模块共享底座不得成为越权通道；上层调用 property/asset 时保留原 tenant/park/data/field/file scope 与原业务授权语义。 | module dependency 契约见 `packages/shared/src/property-business/track-b-contracts.ts:18-21`；unit access 见 `apps/api/src/modules/property-operations/property-unit-access.service.ts:17-61`；property task access 见 `apps/api/src/modules/property-tasks/property-task.access.ts:49-167,238-290`；住房 occupancy 委托见 `apps/api/src/modules/housing/housing-lease-command.service.ts:287-303`。 | 上层 controller 同时 gate 自身模块和依赖模块；委托参数携带 scope/actor/source；底座重新验证 tenant/park/data scope，不信任 source id；effect 写回仍以 request scope 和版本为条件。 |
| MEC-8 | 契约必须能自动发现漂移：endpoint manifest、hash、owner matrix、controller metadata、seed cardinality 和三视角引用要有门禁。 | endpoint manifest 与固定 SHA256 见 `packages/shared/src/property-business/track-b-endpoint-permissions.ts:103-280`；access-manifest 验证见 `packages/shared/src/property-business/access-manifest.ts:929-1080`；owner/metadata 测试见 `apps/api/src/modules/property-operations/property-business-access-manifest.spec.ts:677-815`。 | 新增/修改 surface 或 endpoint 时，测试应比较 manifest module dependencies 与实际 controller metadata，并验证菜单/route/API、bundle owner、seed/hash 同步；不能仅验证 manifest 自身格式。 |

## 三、三模块符合性矩阵

| MEC | housing_rental | homestay | property / asset 底座 |
| --- | --- | --- | --- |
| MEC-1 分层权限 | **符合（静态）**：controller class 同时要求 housing+asset，并挂字段拦截器，见 `apps/api/src/modules/housing/housing.controller.ts:40-43`；九 surface manifest 见 `packages/shared/src/property-business/access-manifest.ts:472-865`。 | **符合 API 层（静态）**：manifest 每个 feature 依赖 asset；虽然 class metadata 只写 homestay，`ModuleGuard` 使用的有效模块查询会在 hard dependency 缺失时排除 homestay，见 `apps/api/src/modules/saas-modules/saas-modules.service.ts:423-476`、`apps/api/src/shared/guards/module.guard.ts:26-50`。 | **部分符合（静态）**：approval/task/operation/file 服务端分层完整，但没有与 17 个上层 surface 同形的 property runtime access-manifest；见 `apps/api/src/modules/property-approvals/property-approval.controller.ts:25-37`、`apps/api/src/modules/property-tasks/property-task.controller.ts:28-50`。 |
| MEC-2 bundle/template | **符合（静态）**：000263 逐租户补 approver task read 并升级 hash/template signature，见 `database/migrations/000263_housing_approver_task_read_permission.sql:91-117,150-227`。 | **符合（静态）**：000262 逐租户校验 `homestay:task:read` 并升级 v2，见 `database/migrations/000262_homestay_task_operator_read_permission.sql:22-78,114-174`。 | **符合（静态）**：16 bundles、7 templates、seed/reconcile/hash/cardinality 均有冻结契约；见 MEC-2 证据。 |
| MEC-3 菜单/路由/API | **符合（静态）**：canonical 菜单同源、route boundary 和 action capability 接线；#410/#413 已修。真实深链见建议 UAT。 | **符合（静态）**：8 surfaces、route guard、action capability 和 controller permissions 一致；legacy landing 仅作兼容。 | **部分符合（静态）**：runtime slots、approval/task 深链有严格 source allowlist，但共享底座主要通过上层 surface 暴露，不是独立 canonical 菜单面；需保持 endpoint manifest 覆盖。 |
| MEC-4 tenant/park/data | **符合（静态）/建议 UAT**：lease/unit/file/query 均带 tenant+park，见 `apps/api/src/modules/housing/housing-transaction-support.service.ts:34-74`、`apps/api/src/modules/housing/housing-workbench-query.service.ts:195-214,261-283`。 | **符合（静态）/建议 UAT**：unit/assignee/workorder scope 接线，见 `apps/api/src/modules/homestay/homestay-workbench-query.service.ts:101-145,239-295,362-370`。 | **符合（静态）/建议 UAT**：authorization SQL、projection、operation writes 均含 tenant+park，见 `apps/api/src/modules/property-approvals/property-approval.authorization.ts:214-277`、`apps/api/src/modules/property-tasks/property-task.projection.repository.ts:85-150`。 |
| MEC-5 field/file | **符合读侧与文件（静态）/写侧部分符合**：GET 字段策略、lease/handover/repair/purchase 文件契约接线；写字段策略能力未提供。 | **符合读侧与文件（静态）/写侧部分符合**：booking/stay 敏感字段 GET 投影及 turnover file 双重授权存在；写字段策略能力未提供。 | **部分符合（静态）**：asset CRUD 与 file reference 接线；approval/task/operation 自身无独立字段投影策略，当前也未声明需保护字段。 |
| MEC-6 审批/高风险 | **符合（静态）/建议 UAT**：7 类 housing approval adapter、eligibility exclusions、effect proof 完整，见 `apps/api/src/modules/housing/housing-approval.adapter.ts:16-36,116-232,298-310`。 | **符合（静态）/建议 UAT**：cancel/finance high-risk、maker/checker exclusions 和 effect proof 接线，见 `apps/api/src/modules/homestay/homestay.controller.ts:282-299`、`apps/api/src/modules/homestay/homestay-approval.adapter.ts:135-183`。 | **符合（静态）/建议 UAT**：requester/checker/executor 分离及 immutable triggers 完整，见 MEC-6。 |
| MEC-7 共享委托 | **符合（静态）/建议 UAT**：occupancy port 和 unit access 均传原 scope。 | **符合（静态）/建议 UAT**：service 委托及 unit scope 保留，有效模块投影闭合 hard dependency。 | **符合（静态）/建议 UAT**：task/operation/approval/file 均重新校验 scope，不直接信任上层 source id。 |
| MEC-8 自动门禁 | **符合**：manifest/controller/owner/route 相关测试覆盖；#410/#413 均有回归。 | **符合 API 主要契约**：有效模块 dependency closure 已有专项测试；Web 菜单与首跳仍有 PAM-004/005。 | **符合主要契约**：hash、endpoint、seed/reconcile、runtime controller metadata 有测试。 |

## 四、权限码三视角扫描

扫描范围：

- shared：`permissions.ts`、`permission-bundles.ts`、`role-templates.ts`、`routes.ts`、`access-manifest.ts`、`track-b-endpoint-permissions.ts`；
- API：housing、homestay、property identity/operations/approvals/tasks 的 permission/module decorators；
- Web：housing、homestay、assets/property 页面、`apps/web/lib/menu.ts` 与 capability adapter。

结论（静态确认）：

1. 未发现应报告的 shared-only、API-only 或 Web-only 权限孤儿。
2. 17 个 canonical surface 全部从 shared surface 定义进入菜单和 first-release paths，见 `apps/web/lib/menu.ts:161-186`。
3. `homestay:operations` 与 `housing_rental:operations` 是显式 legacy landing alias，已被 validator 禁止作为 canonical action/page authorization source，见 `packages/shared/src/property-business/permissions.ts:198-204`、`packages/shared/src/property-business/permission-bundles.ts:348-389`，不是冗余 grant。
4. `party:identity_update`、`property_approval:create` 等 `apiPath/frontendRoute=null` 的 action 是共享委托能力，允许无直接 Web route，不属于孤儿，见 `packages/shared/src/property-business/permissions.ts:167-196`。
5. Housing Track-B 岗位 bundle 与 canonical granular bundles 是两层有意并存的授权模型。`HOUSING_OPERATOR`/approver 只进入任务台，目标业务链接继续按 canonical page/action fail-closed；`HOUSING_FINANCE` 虽沿用旧 bundle 名，成员与 finance canonical 能力一致。owner matrix 见 `apps/api/src/modules/property-operations/property-business-access-manifest.spec.ts:677-731`。因此不把“未引用 canonical bundle 名称”单独列为漂移。

## 五、问题清单

### PAM-001（原 P0 候选，评审核销）Homestay API 未闭合 asset 硬依赖

- 初始线索：manifest 声明 `dependencies: ["asset"]`，而 Homestay controller class 只声明 `@RequireModule("homestay")`。
- 核销证据：`ModuleGuard` 并非直接读取 assignment；它调用 `listEnabledModulesForTenant()`，该查询用 hard-dependency `NOT EXISTS` 闭包排除缺失、禁用或过期依赖的业务模块，见 `apps/api/src/modules/saas-modules/saas-modules.service.ts:423-476`、`apps/api/src/shared/guards/module.guard.ts:41-50`。模块写入口也禁止在依赖未启用时启用 dependent，并禁止先停用仍被 active dependent 使用的 required module，见同 service `:529-633`。
- 结论：缺 asset 时 homestay 不会进入有效模块集合，class-level gate 已返回 403；原复现遗漏了有效模块投影层，**撤销 P0 定性与产品修复建议**。保留“controller metadata 与 manifest 不同形”作为可读性观察，但不能据此推断旁路。

### PAM-002（原 P2 候选，评审核销）字段策略只覆盖读投影

- 状态：**声明的产品边界，不是契约漂移；未静态证明字段越权**。
- 证据：角色契约明确 `fieldPolicyReadProjectionEnforced: ["hidden", "masked"]`、`fieldPolicyWriteEnforcementAvailable: false`，见 `packages/shared/src/property-business/role-templates.ts:93-102`；住房/民宿 interceptor 只处理 GET，见 `apps/api/src/modules/field-policies/property-field-policy.interceptor.ts:13-20`；字段服务响应投影只实际改变 hidden/masked，见 `apps/api/src/modules/field-policies/field-policy.service.ts:206-227`。
- 核销理由：MEC-5 只要求“写字段若纳入策略则在持久化前拒绝”，而 shared contract 明确冻结 `fieldPolicyWriteEnforcementAvailable: false`，并无承诺服务端 write field policy。当前敏感写由 action、DTO 和 domain service 校验；在没有具体未授权写路径前，不能把未来能力建议计为缺陷。

### PAM-003（原 P2 候选，评审核销）未逐 endpoint 比较 manifest dependency 与 module metadata

- 状态：**可选的测试增强，不是已确认缺陷**。
- 核销理由：PAM-001 不成立，且 dependency closure 的权威实现位于有效模块查询，不要求每个 endpoint metadata 重复列出 dependency。现有 `saas-modules.property-dependency.spec.ts` 已冻结 hard dependency 查询与启停冲突；逐 endpoint metadata 同形断言反而会把实现细节误当安全边界。

## 六、已核销历史问题与非问题

### #410：住房审批岗 page/action bundle 漂移——已修复

PR [#410](https://github.com/ivanzhao299/jinhu-smart-park/pull/410) 已合并，当前 bundle 包含 `housing:task:read`，000263 按受影响 tenant 校验 cardinality、升级 bundle/template hash/signature，见 `database/migrations/000263_housing_approver_task_read_permission.sql:24-65,91-117,150-227`。最终 housing UAT 记录的审批人和 `/housing/tasks?requestId=...` 深链通过，为当前行为已修复提供补充验证，见 `docs/uat/housing-final-retest-uat-20260827-114806.md:30-35`。

### #413：operation-config 深链 source allowlist 脱节——已修复

PR [#413](https://github.com/ivanzhao299/jinhu-smart-park/pull/413) 已合并；`property-operation-config` 已进入住房 runtime approval allowlist，未知 source 仍 fail-closed，见 `apps/web/app/housing/_components/housing-workbench-contract.ts:68-73`、`apps/web/app/housing/_components/housing-workbench-contract.spec.ts:48-67`。当前结论为静态已修；真实通知→任务→审批详情仍列入回归 UAT。

### 住房岗位未引用全部 canonical bundles——不判缺陷

owner matrix、模板测试、seed/reconcile 均冻结了“Track-B 任务/审批岗位”与“canonical 业务能力包”两层模型。`HOUSING_OPERATOR`/approver 无业务 surface page 权限时，route boundary 和任务目标链接先行隐藏，不形成“菜单可见但初始化 API 403”；`HOUSING_FINANCE` 旧 bundle 已含完整 finance page/read/register/waive 成员。若未来产品要求“住房经办”直接经营所有业务 surface，应作为角色产品定义变更，而非本轮静态漂移修复。

## 七、解决方案与推荐

### PAM-001 处置

**推荐不修产品代码**：有效模块查询已经 fail-closed 闭合 hard dependency。只保留模块组合 HTTP UAT，验证 `homestay+asset` 为 2xx、缺 asset 时所有 Homestay endpoint 为 403；若 UAT 与静态结论冲突，再以真实请求链重新立项。

### PAM-002 处置

**推荐不进入缺陷队列**：维持已冻结的 read-only field policy 边界。若产品未来要求 per-role readonly/editable 写控制，应作为新能力经产品定义、威胁建模和迁移设计后另行立项，不能从本审计直接生成修复任务。

### PAM-003 处置

**推荐不增加逐 endpoint 重复断言**：继续以有效模块查询的 dependency closure 专项测试为安全门禁。若未来把依赖解析从查询层迁移到 manifest/controller 层，再同步调整测试权威源。

## 八、建议修复队列

1. **菜单一致性组（P1）**：经用户另行批准后，PAM-004 先确立 API 空树权威，再实施 PAM-005 的统一 normalized tree。
2. **会话语义组（P2）**：先由产品决定“刷新后生效”或“已登录会话即时生效”，再选择 PAM-006 方案；未决定前不开修复。
3. **UAT 组**：模块组合、菜单/首跳、授权刷新、跨 tenant/park、maker-checker-executor、文件、深链回归。不得以生产 SQL 临时补权代替模板/assignment/reconcile 验证。

如未来修复涉及 bundle/template/seed：

- shared 契约改动必须同时评估 API、Web、hash 测试、endpoint/owner manifest；
- migration 必须按受影响 tenant 逐户断言权限恰好一条且 active，沿用 000262/000263 的明细 fail-closed 模式；
- 已成功执行的 migration 不可编辑；只有确认从未成功应用、失败事务已回滚且符合 `db-migrate.sh` checksum 规则时，才可论证 failed-only 编辑；否则使用新编号；
- production seed/reconcile 的固定基数、bundle signature、模板 definition hash 必须同步，部署中 migration 失败即停止 seed/bootstrap/deploy。

## 九、修复后 UAT 回归清单

1. 模块组合：`homestay+asset` 为 2xx 基线；停用 asset 后 dashboard、availability、unit-candidates、rates、bookings、stays mutations、ledger、turnovers list/detail/execute 全部 403；重新启用后恢复。
2. 菜单/深链：无 asset 时 8 个 homestay surface 均不可见/不可深链；未知 source/query fail-closed；housing `property-operation-config` 通知→`/housing/tasks?requestId`→审批详情通过。
3. 角色模板：Homestay operator、Housing operator/finance/approver 的页面、按钮与 API 与 frozen owner matrix 一致；不得靠临时 extra grant 通过。
4. tenant/park/data scope：至少双租户、双园区、restricted unit；跨 tenant/park id 返回 403/404/空集，切园区后菜单、JWT context、role link、scope predicate 同步。
5. maker-checker-executor：requester/submitter/source creator/payment recorder 不能审批；checker 不直接执行 effect；并发决定、worker retry、reconcile 不重复写；immutable audit 更新/删除失败。
6. 字段：普通岗位的 booking identity、credential、住房财务字段按 hidden/masked 投影；未来 write policy 落地后增加 readonly/editable 的 PATCH/POST 负例。
7. 文件：turnover、lease、handover、repair、purchase 的 list/detail/upload/download/delete 同时验证 `file:*`、领域权限、biz id、tenant/park/unit scope、引用与删除保护。

## 十、验证记录与剩余风险

本轮静态验证包含：

- API manifest/controller/runtime metadata 契约测试：38 passed / 0 failed；
- Housing 专项 Web 测试：28 passed；Homestay 专项 Web 测试：18 passed；
- 权限码 shared/API/Web 三视角检索未发现孤儿；
- 历史 PR #410/#413 当前状态与现行代码点验。

未执行：数据库迁移/seed、真实 HTTP、多租户/多园区数据、浏览器/人工 UAT、生产检查。原因是本轮为零产品代码改动的只读审计，且明确禁止生产直操作。最主要剩余风险是：生产角色可能有额外叠加授权，静态模板不能代表每个实例；跨园区 UAT 和文件上传在现有历史报告中仍不完整。

## 十一、补充核查：权限到菜单的全条件链

> 本章响应“用户已获授权但没有菜单”的实测反馈。它补充 MEC-3 的反向检查，不回改前述审计结论；问题总数以本章后的统一清单为准。

### 11.1 API 生成链与全部必要条件

`GET /users/me` 先按当前 tenant/park 筛选有效角色与权限链接，再读取同园区的运行时模块集合，最后调用 `buildPermissionMenuTree`；`menu_tree` 与 `menus` 当前返回同一结果，见 `apps/api/src/modules/users/users.service.ts:600-676,1623-1687`。

对民宿/住房任一 canonical 菜单项，以下条件必须同时成立：

1. 用户在当前 tenant/park 的有效角色链接中持有该 surface 的 **canonical page permission**；action/read 权限与 legacy `homestay:operations`、`housing_rental:operations` 均不能替代 page permission，见 `apps/api/src/modules/users/users.service.ts:1735-1739`、`apps/api/src/modules/users/users.service.property-menu.spec.ts:148-159`。
2. `homestay` 或 `housing_rental` assignment 在当前 park 有效：assignment 和标准模块均启用、未删除、状态有效、已到开始时间且未过期，见 `apps/api/src/modules/saas-modules/saas-modules.service.ts:423-476`。
3. shared manifest 声明的所有 dependency 同样在当前 park 有效；两模块目前都硬依赖 `asset`。API 的 enabled-module 查询与 canonical 投影各做一次 dependency closure，见 `database/migrations/000189_property_b_module_rbac_definitions.sql:251-269`、`apps/api/src/modules/users/users.service.ts:1723-1734`。
4. 页面权限元数据若存在，必须恰好一个实体 ID，且 active、visible、`permissionType=page`、`permType=20`、`action=page`、route 与 module 均和 shared surface 完全一致；重复或任一字段漂移会 fail-closed 丢弃页面，见 `apps/api/src/modules/users/users.service.ts:1781-1815`。
5. seeded permission 树只接收可见、启用、未删除的 menu/page 实体。孤立 `parentId` 不会成为根；seeded 树一旦有可导航根，就不会使用静态 `USER_MENU_TREE` fallback，见 `apps/api/src/modules/users/users.service.ts:1690-1703,1830-1853`。

DB seeded menu 与 canonical property menus 是两套表示，但正常路径不是相同 href 竞争：DB 仍保留不可见兼容入口 `/homestay`、`/housing`，canonical surface 使用 `/homestay/*`、`/housing/*`。API 先移除顶层旧 property 节点，再按 shared surface 重建 8+9 个 children；Web 又删除两个 legacy landing，见 `database/migrations/000183_property_business_granular_rbac.sql:14-47,120-259`、`apps/api/src/modules/users/users.service.ts:1706-1778,1817-1828`、`apps/web/lib/menu.ts:523-588`。最终树没有全局 href 去重；若租户把 property route 嵌入非 property 顶层，仍可能形成重复，需隔离数据验证。

### 11.2 Web 过滤、首跳与会话刷新

- Sidebar 先规范化/合并菜单，再要求 page permission 与模块同时通过；super/`*` 只绕过 permission，不绕过 module，见 `apps/web/components/layout/AppSidebar.tsx:28-46`、`apps/web/lib/permissions.ts:19-28,41-50`。
- `normalizeMenuTree` 会删除 placeholder、`/homestay` 和 `/housing`；已知 canonical href 与静态菜单合并时，以静态 permission/module 为准，见 `apps/web/lib/menu.ts:523-620`。
- `firstMenuHref` 却遍历原始 API tree，而不是 Sidebar 规范化后的树；因此首跳可能选中随后被 Sidebar 删除的 legacy/placeholder 路由，见 `apps/web/lib/post-login-route.ts:34-89`。
- 登录会用新 token 立即重取 `/users/me`；DashboardLayout 启动也会在读本地缓存后重取。园区主切换入口用新 token 重取 `/users/me` 并发布 `nextUser`，菜单、权限和 enabled modules 随新 park 重建，见 `apps/web/lib/auth.ts:72-89,149-226`、`apps/web/components/layout/UserMenu.tsx:28-45`。
- 服务端在 token 不变时调整角色/权限，当前 tab 会在下一次成功重取 `/users/me` 后更新；跨 tab 仅监听 token storage 变化，单独 user cache 更新不会触发 reload，见 `apps/web/components/layout/DashboardLayout.tsx:63-105`。资产页局部园区切换只发布 `nextUser`、不强制 remount，当前页面本地状态与降权深链需动态验证。

### 11.3 条件矩阵

| 断点 | 触发条件 | 用户感知 | 定性 |
| --- | --- | --- | --- |
| 角色/权限 scope | role link、permission link、role 或 permission 不属于当前 tenant/park，或已禁用/删除 | 后台看似授过权，当前园区没有菜单 | 静态确认；实例需查角色链接 |
| page/action 语义 | 只授 action/read/legacy permission，未授 canonical `*:page` | 能力被授予但无业务 surface 菜单 | 静态确认；可能是 Track-B 设计语义 |
| 业务模块 assignment | 当前 park 未启用、禁用、未开始或已过期 | 有 page 权限仍无整个模块菜单，API 403 | 静态确认 |
| `asset` dependency | 业务模块有 assignment，但当前 park 缺有效 `asset` | 有 page 权限仍无整个模块菜单，API 由有效模块投影拒绝 | 静态确认；PAM-001 已核销 |
| permission metadata | 同 code 多实体，或 visible/type/action/route/module 漂移 | 仅对应页面或整组 children 缺失 | 静态确认；真实行状态需隔离/目标环境只读核验 |
| seeded parent tree | parent 缺失/孤立，或 seeded 非空导致静态 fallback 不再使用 | 非 property 菜单局部缺失 | 静态确认机制；实例数据需验证 |
| 双重表示 | legacy DB landing 与 canonical shared surface 同时存在 | 正常会被两层清理；异常嵌套可重复/竞争 | 正常路径静态核销；异常数据需动态验证 |
| Web 空树 fallback | API 因 module/dependency 返回空树，Web 改用静态 `dashboardMenus` | 反而显示本应隐藏的菜单，点击后 forbidden | 静态确认，列 PAM-004 |
| Web 首跳来源 | 原始 tree 含会被 normalize 删除的 legacy/placeholder | 登录跳转到 Sidebar 不显示的路径 | 静态确认机制，列 PAM-005 |
| 权限变更缓存 | token 不变、旧 tab 未重新拉 `/users/me`；跨 tab 只监听 token | 新授权短时无菜单，刷新/重登后出现 | 静态确认刷新边界；时序需 UAT |
| 园区切换 | 主入口会重建；资产页局部入口不 remount | 菜单已变但当前页面/本地状态可能残留 | 静态确认边界；需 UAT |

### 11.4 模块启用的正确入口与生效时机

运行时权威是 `(tenant_id, park_id)` 维度的 `rel_tenant_module` 联接 active `sys_module`，不是角色 grant，也不是单独的 `sys_module` 行。正确运维入口为“系统管理 → 模块管理”，调用 `POST /tenant-modules`、`POST /tenant-modules/:moduleId/enable|disable`，见 `apps/api/src/modules/saas-modules/saas-modules.controller.ts:72-96`、`apps/web/app/system/modules/page.tsx:69,108-121`。启用会校验依赖；启用 `asset` 时还会执行 asset scope provisioning，见 `apps/api/src/modules/saas-modules/saas-modules.service.ts:244-422`。新请求会即时按数据库和时间窗口判断，但 Web 必须重新取得 `/users/me` 才能刷新本地 user context；不得直接改表或以临时补权代替模块 assignment/reconcile。

## 十二、民宿/住房对 MEC 的补充裁定

1. **MEC-1/7/8**：Housing class gate 显式声明 `housing_rental+asset`；Homestay 通过有效模块查询闭合 hard dependency。PAM-001/PAM-003 已核销。
2. **MEC-2**：16 个 Track-B bundle、7 个 managed templates、production seed/reconcile cardinality/hash 未发现新增漂移，见 `packages/shared/src/property-business/permission-bundles.ts:13-159,312-409`、`packages/shared/src/property-business/role-templates.ts:104-287`、`database/seeds/production/000006_property_track_b_permission_reconcile.sql:314-399`、`database/seeds/production/000015_property_role_template_reconcile.sql:53-227`。
3. **MEC-3**：原报告“housing/homestay 符合（静态）”需补充为 **部分符合**。API canonical 投影本身闭合，但 Web 空树 fallback 可绕过 dependency-aware 投影（PAM-004），首跳与 Sidebar 使用不同树（PAM-005）；权限到菜单还受 page/module/metadata/scope 全条件链影响。
4. **MEC-4/5/6**：未发现超出原报告的新静态缺口；PAM-002 是明确声明的能力边界，已从缺陷清单核销。

Track-B 的两层模型是有意设计：`HOMESTAY_OPERATOR`/`HOUSING_OPERATOR` 进入任务台并持共享审批委托能力，不自动获得全部 canonical 业务 surface；finance 模板则带 finance page/action。`PARTY_PROFILE_CLERK` 与 `TASK_ADMIN` 是明确允许无 canonical page 的后台/委托 bundle，见 `packages/shared/src/property-business/permission-bundles.ts:14-18,35-53,154-158`、`packages/shared/src/property-business/role-templates.ts:119-218`。因此“岗位授权后只有任务台、没有全部业务菜单”当前判定为设计语义，不计缺陷；若产品期望岗位直达业务 surface，需要先改变 owner matrix 与模板定义。

## 十三、统一问题清单与修复方案

统一统计：**P0 0 项、P1 2 项、P2 1 项**。PAM-001～003 为首轮候选并已在第五节记录核销原因；确认问题如下。

### PAM-004（P1）Web 空菜单回退重建了被 API 依赖过滤的 property 菜单

- 违反：MEC-1、MEC-3、MEC-7。
- 状态：**静态确认**。
- 证据：API 按 surface dependencies 过滤模块，见 `apps/api/src/modules/users/users.service.ts:1723-1734`；Web 在后端树为空时回退静态 `dashboardMenus`，而静态 property menu 和 Sidebar 只检查自身 module/page permission、不检查 `asset` dependency，见 `apps/web/lib/menu.ts:161-169,495-503`、`apps/web/components/layout/AppSidebar.tsx:28-44`。
- 影响：缺 `asset` 时后端正确不发菜单，前端却可能重新显示民宿/住房入口；点击后 route guard/API forbidden，重现“菜单、路由、API 不一致”的另一方向。

| 方案 | 改动面 | 风险 / 迁移 | 验证 |
| --- | --- | --- | --- |
| A. 已认证用户以 API menu tree 为展示权威；空数组保持空，不回退静态树，静态树只用于授权元数据/开发兜底 | `apps/web/lib/menu.ts`、相关 Sidebar/route tests | 推荐；无 DB migration。需保证 API 旧版本缺字段时有显式 compatibility 分支，而非把“空”当“缺失” | 空树、缺字段、dependency disabled、super/wildcard、17 surfaces 单测与 UAT |
| B. 保留 fallback，但静态树也消费 access manifest dependencies | shared/Web menu 与 route access | 改动更广，仍保留 API/Web 双权威漂移风险；无迁移 | dependency 正反例、manifest 同源测试 |

**推荐 A**：区分“字段不存在”与“权威结果为空”，避免前端重新授权；静态 canonical tree 只补充标签、icon 和路径授权元数据。

### PAM-005（P1）首跳与 Sidebar 消费不同阶段的菜单树

- 违反：MEC-3、MEC-8。
- 状态：**静态确认；真实首项顺序需 UAT**。
- 证据：Sidebar 使用 normalize/prune 后菜单，`firstMenuHref` 使用原始 API tree；前者删除 placeholder 和 legacy landing，见 `apps/web/lib/menu.ts:523-561`、`apps/web/lib/post-login-route.ts:34-89`。
- 影响：登录/切园区后可能跳到侧栏不展示的路径，用户感知为“有权限但找不到菜单”或“刷新后落点异常”。

| 方案 | 改动面 | 风险 / 迁移 | 验证 |
| --- | --- | --- | --- |
| A. 导出单一 normalized authorization tree，Sidebar、breadcrumb、首跳和 park-switch access 全部消费 | Web menu/post-login/layout | 推荐；无迁移。需防循环依赖并冻结排序 | legacy/placeholder、空树、父子权限、park switch 单测 |
| B. 仅在 `firstMenuHref` 复制 prune 规则 | post-login-route | 改动小但规则继续双写，未来易漂移 | 同上，加规则一致性测试 |

**推荐 A**：消除两个消费者对“可见菜单”的不同定义。

### PAM-006（P2）权限/模块刷新语义缺少显式即时性契约

- 违反：MEC-3、MEC-4。
- 状态：**静态确认的缓存边界；是否命中本次实测需 UAT**。
- 证据：登录与主园区切换会重取 `/users/me`；DashboardLayout 启动也会刷新，但跨 tab 只监听 access token，服务端在 token 不变时调整授权不会主动推送，见 `apps/web/lib/auth.ts:149-226`、`apps/web/components/layout/DashboardLayout.tsx:63-105`。
- 影响：管理员完成授权后，已登录用户可能直到刷新、重登或下一次 context fetch 才看到菜单；同一浏览器其他 tab 也可能暂时保留旧 user cache。

| 方案 | 改动面 | 风险 / 迁移 | 验证 |
| --- | --- | --- | --- |
| A. 明确“授权变更后用户需刷新/重登”的产品契约，并在管理端成功提示 | 管理 UI/docs | 最小；无迁移，但体验仍非即时 | 管理端提示与手工 UAT |
| B. user cache 增加 authorization revision/短轮询或窗口聚焦重取，并监听 user storage 变更 | API user context + Web auth/layout | 推荐用于即时预期；需防请求风暴和跨 tab 循环，无 DB migration 或仅 revision 存储设计 | 同 token 变更、跨 tab、离线/失败、park switch UAT |
| C. 强制撤销/轮换受影响用户 token | auth/admin | 风险高、干扰会话，不推荐作为常规授权同步 | 会话失效与重登回归 |

**推荐取决于产品即时性要求**：若允许明确刷新，先 A；若承诺即时生效，采用 B，不建议 C。

## 十四、统一修复队列与决策门

1. **决策门 D1（先行）**：确认 Track-B 岗位是“只进任务台”还是“同时直达 canonical 业务 surface”。维持现设计则不改 bundle/template；改变语义则须同步 owner matrix、template hash/signature、逐租户 reconcile/migration 和 UAT。
2. **决策门 D2（先行）**：确认角色/模块变更是“刷新后生效”还是“已登录会话即时生效”。它决定 PAM-006 采用 A 还是 B。
3. **核销项 N1（不实施）**：PAM-001/002/003 不进入修复队列；仅保留对应模块组合、字段负例和 dependency closure 回归。
4. **菜单组 M1（P1）**：PAM-004 先确立 API 空树权威，再实施 PAM-005 的统一 normalized tree；在同一集成 UAT 验证菜单/route/API。
5. **会话组 C1（P2）**：按 D2 处理 PAM-006；若选即时刷新，依赖统一 normalized menu contract。
6. **集成 UAT（依赖 M1，按需含 C1）**：执行第十五节；不得通过生产直改表或临时 extra grant 绕过模板/assignment/reconcile。

## 十五、统一修复后 UAT 回归清单

在第九节基础上补齐：

1. **permission→menu 四象限**：分别验证 page 有/无 × action 有/无；action-only 不出现业务 surface，page-only 可出现但按钮/API fail-closed；Track-B operator 只出现任务台；finance 模板出现 finance surface。
2. **模块组合**：`business+asset`、business only、asset only、均无、disabled、expired、future-start；普通、super、`*` 三类用户的 `/users/me.enabled_modules`、menu tree、Sidebar、route、API 必须一致。
3. **菜单元数据**：canonical page 正常、重复 code、错误 route/module/type/action、visible=false、孤立 parent；确认 fail-closed 且管理/诊断可定位原因。
4. **双重表示/首跳**：DB legacy landing 与 canonical 8+9 surfaces 同时存在时只显示 canonical；空 API tree 不被 Web 重建；登录和切园区首跳必须属于实际 Sidebar tree。
5. **授权刷新**：管理员给已登录用户增/删 page/action、启停模块；验证当前 tab、第二 tab、刷新、重登以及产品承诺的生效时限。
6. **园区切换**：双园区具有不同 role links 与 module assignments；主切换入口和资产页局部切换后，菜单、当前 route、页面 state、API scope 均按 nextUser 收敛。
7. **原安全回归**：继续执行第九节的 Homestay asset 403/恢复、跨 tenant/park/data、maker-checker-executor、字段 hidden/masked、五类文件全链和 housing approval 深链。

本补充核查仍未连接生产、未执行数据库写入、未操作浏览器或容器。静态证据已经足以定义 PAM-004/PAM-005；PAM-006 与本次用户实测的对应关系、真实 permission/assignment 行状态仍应在经批准的隔离 UAT 或目标环境只读诊断中确认。
