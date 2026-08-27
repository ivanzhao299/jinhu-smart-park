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
- `homestay`：**部分符合**。权限码、surface、action、scope、字段/文件与审批框架完整，但多数 controller method 只继承 class-level `@RequireModule("homestay")`，没有落实 shared manifest 声明的 `asset` 硬依赖；这是静态确认的模块授权旁路。
- `property/asset`：**基本符合**。approval/task/operation/file 委托均保留 tenant/park/data scope，maker-checker-executor 与不可变审计较完整；独立 property runtime surface 尚未纳入与住房/民宿同形的 access-manifest，字段策略也主要覆盖 asset CRUD 和两上层模块的 GET 投影。

问题统计：**P0 1 项、P1 0 项、P2 2 项**。另有 3 项 UAT 证据缺口，不作为已确认产品缺陷计数。

## 二、机制设计要求（MEC）

| 编号 | 设计要求 | 设计声明出处 | 可检验的符合性判据 |
| --- | --- | --- | --- |
| MEC-1 | 分层 fail-closed：module 启用后仍须分别通过 page、action/API、data、field、file。任一受保护 API 未声明权限应拒绝。 | 六层结构见 `packages/shared/src/property-business/access-manifest.ts:83-97`；全局 guard 顺序见 `apps/api/src/app.module.ts:221-240`；无权限元数据拒绝见 `apps/api/src/shared/guards/permission.guard.ts:15-58`；文件二次业务授权见 `apps/api/src/modules/files/file-business-access.service.ts:111-200`。 | 每个 canonical feature 声明 required module/dependencies、page、actions、data、fields、files；controller 的 module/permission metadata 不弱于 manifest；data/field/file 不能只靠前端隐藏。 |
| MEC-2 | 权限包和角色模板为可演进契约：成员集合、顺序、version/hash、模板签名和实例 reconcile 必须一致且 fail-closed。 | bundle 校验见 `packages/shared/src/property-business/permission-bundles.ts:312-345`；模板解析与 revision 校验见 `packages/shared/src/property-business/role-templates.ts:230-302`；production seed 基数断言见 `database/seeds/production/000006_property_track_b_permission_reconcile.sql:314-399`；模板 reconcile 见 `database/seeds/production/000015_property_role_template_reconcile.sql:53-84,230-289`。 | shared 测试独立重算 hash；seed 双向比对定义和固定基数；迁移只接受精确前驱；已有租户按 tenant 逐户校验和 reconcile，缺失/重复/禁用均失败。 |
| MEC-3 | 菜单、路由、按钮与 API 是同一能力的不同投影，必须三方一致；深链和 legacy alias 也要 fail-closed。 | canonical surface 菜单构建见 `apps/web/lib/menu.ts:161-186,301-313`；动态菜单 metadata 校验见 `apps/api/src/modules/users/users.service.ts:1712-1814`；住房路由边界见 `apps/web/app/housing/_components/HousingRouteBoundary.tsx:14-39`；民宿边界见 `apps/web/app/homestay/_components/HomestayRouteGuard.tsx:8-35`。 | page permission 决定菜单和 route；action capability 与 controller decorator 一致；未知 canonical route 与受保护 approval source 被拒，legacy alias 仅进入受控 landing；页面所需初始请求不因岗位模板缺权而 403；API 能力若无菜单须有明确的委托/深链/无 UI 理由。 |
| MEC-4 | tenant、park 与业务数据范围独立收敛；园区切换后权限、role link、scope predicate 必须全部基于新 scope。 | JWT scope 来源见 `apps/api/src/shared/decorators/current-scope.decorator.ts:6-11`；用户/park 有效性见 `apps/api/src/modules/users/users.service.ts:599-625`；role link scope 见 `apps/api/src/modules/users/users.service.ts:1663-1687`；空范围 `1=0` 见 `apps/api/src/modules/data-scopes/data-scope.service.ts:270-278`。 | 查询/写入/审批/文件引用均含 tenant+park；building/floor/unit/assignee 等声明维度实际进入谓词；空 scope 拒绝而非放宽；迁移 cardinality 不做跨租户全局唯一假设。 |
| MEC-5 | 字段与文件为服务端授权层：敏感字段投影、受保护文件通用权限与领域权限都必须实际接线。 | 字段优先级及投影见 `apps/api/src/modules/field-policies/field-policy.service.ts:184-227,451-472`；住房/民宿 GET interceptor 见 `apps/api/src/modules/field-policies/property-field-policy.interceptor.ts:8-54`；文件 controller 权限见 `apps/api/src/modules/files/files.controller.ts:39-116`；文件 tenant/park 和引用校验见 `apps/api/src/modules/files/files.service.ts:266-295,379-395`。 | 每个声明为 hidden/masked 的响应路径经过字段策略；写字段若纳入策略则在持久化前拒绝；文件同时满足 `file:*`、biz type/domain permission、tenant/park/data scope、引用状态与删除保护。 |
| MEC-6 | 高风险写遵守 maker-checker、幂等、不可变 effect audit；发起、审批、执行主体与权限边界明确。 | manifest mutation 默认幂等及 high-risk approval policy 见 `packages/shared/src/property-business/access-manifest.ts:125-157,1014-1080`；checker 排除规则见 `apps/api/src/modules/property-approvals/property-approval.service.ts:918-934`；effect worker fence 见同文件 `:1205-1233`；不可变 trigger 见 `database/migrations/000191_property_b_homestay_effect_schema.sql:246-286`。 | 高风险 endpoint 有 idempotency 与 approval policy，controller/全局审计接线另行点验；requester/submitter/source creator 不能 checker；effect 由 claim/fence 执行并可重试不重复；decision/effect audit 不可修改。 |
| MEC-7 | 跨模块共享底座不得成为越权通道；上层调用 property/asset 时保留原 tenant/park/data/field/file scope 与原业务授权语义。 | module dependency 契约见 `packages/shared/src/property-business/track-b-contracts.ts:18-21`；unit access 见 `apps/api/src/modules/property-operations/property-unit-access.service.ts:17-61`；property task access 见 `apps/api/src/modules/property-tasks/property-task.access.ts:49-167,238-290`；住房 occupancy 委托见 `apps/api/src/modules/housing/housing-lease-command.service.ts:287-303`。 | 上层 controller 同时 gate 自身模块和依赖模块；委托参数携带 scope/actor/source；底座重新验证 tenant/park/data scope，不信任 source id；effect 写回仍以 request scope 和版本为条件。 |
| MEC-8 | 契约必须能自动发现漂移：endpoint manifest、hash、owner matrix、controller metadata、seed cardinality 和三视角引用要有门禁。 | endpoint manifest 与固定 SHA256 见 `packages/shared/src/property-business/track-b-endpoint-permissions.ts:103-280`；access-manifest 验证见 `packages/shared/src/property-business/access-manifest.ts:929-1080`；owner/metadata 测试见 `apps/api/src/modules/property-operations/property-business-access-manifest.spec.ts:677-815`。 | 新增/修改 surface 或 endpoint 时，测试应比较 manifest module dependencies 与实际 controller metadata，并验证菜单/route/API、bundle owner、seed/hash 同步；不能仅验证 manifest 自身格式。 |

## 三、三模块符合性矩阵

| MEC | housing_rental | homestay | property / asset 底座 |
| --- | --- | --- | --- |
| MEC-1 分层权限 | **符合（静态）**：controller class 同时要求 housing+asset，并挂字段拦截器，见 `apps/api/src/modules/housing/housing.controller.ts:40-43`；九 surface manifest 见 `packages/shared/src/property-business/access-manifest.ts:472-865`。 | **不符合（静态）**：manifest 每个 feature 依赖 asset，但多数 method 只继承 homestay class gate，见 `packages/shared/src/property-business/access-manifest.ts:224-470`、`apps/api/src/modules/homestay/homestay.controller.ts:50-53,59-71,118-197,254-483`。 | **部分符合（静态）**：approval/task/operation/file 服务端分层完整，但没有与 17 个上层 surface 同形的 property runtime access-manifest；见 `apps/api/src/modules/property-approvals/property-approval.controller.ts:25-37`、`apps/api/src/modules/property-tasks/property-task.controller.ts:28-50`。 |
| MEC-2 bundle/template | **符合（静态）**：000263 逐租户补 approver task read 并升级 hash/template signature，见 `database/migrations/000263_housing_approver_task_read_permission.sql:91-117,150-227`。 | **符合（静态）**：000262 逐租户校验 `homestay:task:read` 并升级 v2，见 `database/migrations/000262_homestay_task_operator_read_permission.sql:22-78,114-174`。 | **符合（静态）**：16 bundles、7 templates、seed/reconcile/hash/cardinality 均有冻结契约；见 MEC-2 证据。 |
| MEC-3 菜单/路由/API | **符合（静态）**：canonical 菜单同源、route boundary 和 action capability 接线；#410/#413 已修。真实深链见建议 UAT。 | **符合（静态）**：8 surfaces、route guard、action capability 和 controller permissions 一致；legacy landing 仅作兼容。 | **部分符合（静态）**：runtime slots、approval/task 深链有严格 source allowlist，但共享底座主要通过上层 surface 暴露，不是独立 canonical 菜单面；需保持 endpoint manifest 覆盖。 |
| MEC-4 tenant/park/data | **符合（静态）/建议 UAT**：lease/unit/file/query 均带 tenant+park，见 `apps/api/src/modules/housing/housing-transaction-support.service.ts:34-74`、`apps/api/src/modules/housing/housing-workbench-query.service.ts:195-214,261-283`。 | **符合（静态）/建议 UAT**：unit/assignee/workorder scope 接线，见 `apps/api/src/modules/homestay/homestay-workbench-query.service.ts:101-145,239-295,362-370`。 | **符合（静态）/建议 UAT**：authorization SQL、projection、operation writes 均含 tenant+park，见 `apps/api/src/modules/property-approvals/property-approval.authorization.ts:214-277`、`apps/api/src/modules/property-tasks/property-task.projection.repository.ts:85-150`。 |
| MEC-5 field/file | **符合读侧与文件（静态）/写侧部分符合**：GET 字段策略、lease/handover/repair/purchase 文件契约接线；写字段策略能力未提供。 | **符合读侧与文件（静态）/写侧部分符合**：booking/stay 敏感字段 GET 投影及 turnover file 双重授权存在；写字段策略能力未提供。 | **部分符合（静态）**：asset CRUD 与 file reference 接线；approval/task/operation 自身无独立字段投影策略，当前也未声明需保护字段。 |
| MEC-6 审批/高风险 | **符合（静态）/建议 UAT**：7 类 housing approval adapter、eligibility exclusions、effect proof 完整，见 `apps/api/src/modules/housing/housing-approval.adapter.ts:16-36,116-232,298-310`。 | **符合（静态）/建议 UAT**：cancel/finance high-risk、maker/checker exclusions 和 effect proof 接线，见 `apps/api/src/modules/homestay/homestay.controller.ts:282-299`、`apps/api/src/modules/homestay/homestay-approval.adapter.ts:135-183`。 | **符合（静态）/建议 UAT**：requester/checker/executor 分离及 immutable triggers 完整，见 MEC-6。 |
| MEC-7 共享委托 | **符合（静态）/建议 UAT**：occupancy port 和 unit access 均传原 scope。 | **部分符合（静态）**：service 委托及 unit scope 保留，但 controller 的 asset module dependency 未完整 gate，违反入口闭包。 | **符合（静态）/建议 UAT**：task/operation/approval/file 均重新校验 scope，不直接信任上层 source id。 |
| MEC-8 自动门禁 | **符合**：manifest/controller/owner/route 相关测试覆盖；#410/#413 均有回归。 | **部分符合**：现有测试验证 manifest 含 asset，却未逐 endpoint 比较实际 module metadata，导致本次缺口未被阻断。 | **符合主要契约**：hash、endpoint、seed/reconcile、runtime controller metadata 有测试；建议扩展 module dependency closure。 |

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

### PAM-001（P0）Homestay API 未闭合 asset 硬依赖

- 违反：MEC-1、MEC-7、MEC-8。
- 状态：**静态确认**。
- 证据：全部 homestay feature 的 shared manifest 均声明 `dependencies: ["asset"]`，见 `packages/shared/src/property-business/access-manifest.ts:226-227,240-242,255-257,266-268,296-298,340-342,388-390,422-424`；controller class 只声明 `@RequireModule("homestay")`，见 `apps/api/src/modules/homestay/homestay.controller.ts:50-53`。只有 tasks、guest/workorder candidates、stays、finance、turnover detail 等少数 method 覆盖为双模块，见同文件 `:79-115,199-251,460-469`；dashboard、availability、unit-candidates、rates、bookings、stay mutations、ledger、turnovers list/execute 等仍只继承单模块 gate。
- 复现推理：`ModuleGuard` 使用 `getAllAndOverride`，handler 无 metadata 时回退 class，不会与 manifest 合并，见 `apps/api/src/shared/guards/module.guard.ts:26-50`。租户仅启用 `homestay`、未启用 `asset`，且用户仍持目标 action permission 时，这些 endpoint 的 module guard 会通过。在 `apps/api/src/modules/homestay` 的 service/query/command 文件中未查到额外的模块启用校验。
- 影响：asset 是 homestay 的声明性硬依赖，API 入口却可在依赖停用时继续访问/写入，破坏 module fail-closed 和共享底座授权闭包。实际生产是否存在“权限仍在但 asset 被停用”的实例组合需 UAT/数据核验，但代码路径本身已确认。

### PAM-002（P2）字段策略只覆盖读投影，写策略能力显式不可用

- 违反：MEC-5。
- 状态：**静态确认的能力缺口；未静态证明已发生字段越权**。
- 证据：角色契约明确 `fieldPolicyReadProjectionEnforced: ["hidden", "masked"]`、`fieldPolicyWriteEnforcementAvailable: false`，见 `packages/shared/src/property-business/role-templates.ts:93-102`；住房/民宿 interceptor 只处理 GET，见 `apps/api/src/modules/field-policies/property-field-policy.interceptor.ts:13-20`；字段服务响应投影只实际改变 hidden/masked，见 `apps/api/src/modules/field-policies/field-policy.service.ts:206-227`。
- 影响：当前字段策略可以隐藏/脱敏返回值，却不能表达“某角色可读但不得写”或在持久化前统一拒绝字段写入。booking guest identity、credential reference、住房财务字段等仍主要依赖 action DTO/业务校验，而非字段策略。由于 manifest 当前主要声明 read permission，不能据此断言现有写接口越权。

### PAM-003（P2）自动契约门禁未比较 manifest dependency 与每个 endpoint 的 module metadata

- 违反：MEC-8。
- 状态：**静态确认**。
- 证据：access-manifest 测试确认 17 feature 都含 asset dependency，见 `apps/api/src/modules/property-operations/property-business-access-manifest.spec.ts:754-764`；同一测试只冻结 Homestay controller class metadata 为 `["homestay"]`，见同文件 `:813-815`。现有 homestay controller metadata tests 只覆盖部分显式双模块 GET，没有覆盖 PAM-001 的 dashboard/rates/bookings/mutations/turnover list+execute。
- 影响：manifest 自身可通过校验，而实现 metadata 仍可更弱；此次 P0 因此未被 CI 阻断。

## 六、已核销历史问题与非问题

### #410：住房审批岗 page/action bundle 漂移——已修复

PR [#410](https://github.com/ivanzhao299/jinhu-smart-park/pull/410) 已合并，当前 bundle 包含 `housing:task:read`，000263 按受影响 tenant 校验 cardinality、升级 bundle/template hash/signature，见 `database/migrations/000263_housing_approver_task_read_permission.sql:24-65,91-117,150-227`。最终 housing UAT 记录的审批人和 `/housing/tasks?requestId=...` 深链通过，为当前行为已修复提供补充验证，见 `docs/uat/housing-final-retest-uat-20260827-114806.md:30-35`。

### #413：operation-config 深链 source allowlist 脱节——已修复

PR [#413](https://github.com/ivanzhao299/jinhu-smart-park/pull/413) 已合并；`property-operation-config` 已进入住房 runtime approval allowlist，未知 source 仍 fail-closed，见 `apps/web/app/housing/_components/housing-workbench-contract.ts:68-73`、`apps/web/app/housing/_components/housing-workbench-contract.spec.ts:48-67`。当前结论为静态已修；真实通知→任务→审批详情仍列入回归 UAT。

### 住房岗位未引用全部 canonical bundles——不判缺陷

owner matrix、模板测试、seed/reconcile 均冻结了“Track-B 任务/审批岗位”与“canonical 业务能力包”两层模型。`HOUSING_OPERATOR`/approver 无业务 surface page 权限时，route boundary 和任务目标链接先行隐藏，不形成“菜单可见但初始化 API 403”；`HOUSING_FINANCE` 旧 bundle 已含完整 finance page/read/register/waive 成员。若未来产品要求“住房经办”直接经营所有业务 surface，应作为角色产品定义变更，而非本轮静态漂移修复。

## 七、解决方案与推荐

### PAM-001 方案

| 方案 | 改动面 | 风险 / 迁移 | 验证 |
| --- | --- | --- | --- |
| A. 将 Homestay controller class gate 改为 `@RequireModule("homestay", "asset")`，删除可省略的重复 method gate | 单 controller + metadata tests | 最小、无 DB migration；所有 endpoint 与 manifest 一次性收敛。需确认不存在“无 asset 仍允许的 homestay endpoint”产品例外。 | controller metadata test；逐 endpoint manifest closure test；模块组合 HTTP 403/2xx UAT。 |
| B. 保留 class gate，逐 method 补 asset | controller 多处 + tests | 易漏新增 endpoint，重复高；无迁移。 | 同上，并冻结完整 method list。 |
| C. ModuleGuard 直接消费 route→manifest dependency | shared guard/registry/启动校验 | 架构性改动大，可能影响其他模块；无数据迁移但回归面最大。 | 全 controller metadata/manifest 集成测试、全模块 smoke。 |

**推荐 A**：它与 Housing controller 的 class-level 双模块模式一致，改动最小且 fail-closed。若存在明确不依赖 asset 的 endpoint，应先修改 shared manifest 把它拆成独立 feature，而不是在 controller 静默放宽。

### PAM-002 方案

| 方案 | 改动面 | 风险 / 迁移 | 验证 |
| --- | --- | --- | --- |
| A. 本期维持 read-only field policy，补齐文档和自动断言，所有敏感写继续由细粒度 action + DTO/service 校验 | shared contract/tests/docs | 风险最低；无迁移；不能提供 per-role readonly/editable。 | 敏感写 action negative tests、read masking tests。 |
| B. 增加显式 write field policy contract，在 DTO→service 持久化前统一校验 changed fields | shared、field-policy service、住房/民宿/property 写服务 | 中高风险；可能需要 policy 数据 migration/reconcile；需定义缺省是拒绝还是沿用 action。 | 每实体/字段 allow/deny、partial update、maker/checker、tenant/park 测试。 |
| C. 只对 identity/financial/credential 三类高敏字段做 domain-specific write guard | shared manifest + 对应 command services | 中等改动、比 B 易落地但规则分散；可能需 policy seed。 | 三类字段的角色矩阵与审计测试。 |

**推荐分两步 A→B**：先把当前能力边界固定为不会被误称为“完整字段写权限”，再单独设计统一 write policy。B 需要产品确定 readonly/editable 的默认语义，不应夹带在 PAM-001 安全修复中。

### PAM-003 方案

| 方案 | 改动面 | 风险 / 迁移 | 验证 |
| --- | --- | --- | --- |
| A. 扩展现有 access-manifest spec，逐 endpoint 解析 controller metadata，断言 required module + dependencies 闭包 | API test | 小、无迁移；能直接防回归。 | 新测试先对当前 main 失败，配合 PAM-001 后通过。 |
| B. 增加独立静态 inventory generator，统一校验 menu/route/API/module/permissions | scripts + CI | 覆盖更广但维护成本高。 | fixture 正反例、CI 集成。 |

**推荐 A**：先封住本次真实缺口；若后续出现第二类三视角漂移，再提炼 B，避免过早复制 manifest registry。

## 八、建议修复队列

1. **串行安全组（P0）**：PAM-001 方案 A + PAM-003 方案 A 同一修复任务/PR。先写能暴露缺口的 dependency closure test，再收紧 controller class gate。
2. **字段策略设计组（P2，可与 P0 后续验证并行）**：PAM-002 先执行方案 A 的契约澄清；write policy B 另建设计任务，待用户确定字段写默认语义后实施。
3. **UAT 组（依赖 P0 合并部署）**：模块组合、跨 tenant/park、maker-checker-executor、文件、深链回归。不得以生产 SQL 临时补权代替模板/reconcile 验证。

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
