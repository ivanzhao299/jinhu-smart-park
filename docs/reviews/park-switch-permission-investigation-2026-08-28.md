# 园区切换权限调整机制核查

> 日期：2026-08-28
> 事实基线：`main@3f6ed83020ed6d96fce33073e68c46b034a77091`
> 任务：`.trellis/tasks/08-28-park-switch-permission-investigation`
> 边界：零产品代码改动；零生产直操作；未创建修复 Issue
> 动态证据根：`/tmp/jinhu-parkperm-investigation-20260828-01/`（local-only）

## 一、结论摘要

用户反馈包含两个相关但不同的问题：

1. **普通用户目标园区只有 access、没有角色**：机制按现有设计运行。园区选择器与 `switch-context` 只要求 `rel_user_park` access 和有效园区；切换成功后，角色、权限和菜单重新按目标 `(tenant_id, park_id)` 解析。由于用户管理“配置园区”只同步 `sys_user.park_id` 与 `rel_user_park`，不创建 `rel_user_role`，所以目标园区会得到仅含 `system:user:me` 的最低上下文，菜单为空、业务 API 403。根因是 **access 与 authorization 两步配置在产品上被呈现成一个“配置园区”动作，但没有角色缺失检查、引导或空态解释**。
2. **超级管理员切到非初始园区**：`SUPER_ADMIN`/`is_super`/`*` 并非天然租户级用户能力。角色实体可以是 tenant scope，但 `rel_user_role` 和 `rel_role_perm` 仍必须存在于当前 park；没有目标园区角色链接时，super/wildcard 不会被解析。bootstrap 脚本也只绑定指定初始 park。额外园区的创建事务只给创建者绑定该园区的 `TENANT_ADMIN`，不会复制 `SUPER_ADMIN`。因此“超级管理员应跨租户内所有园区保持 super”是当前产品预期与实现模型不一致，定性为 **产品缺陷/产品语义缺口，需要产品决策**，不是单纯菜单刷新问题。

本轮动态结果：

| 场景 | 本轮结果 | 证据结论 |
| --- | --- | --- |
| S1a bootstrap admin → 自己创建的 Park B | **PASS，但身份降级** | `switch-context=200`、新 `/users/me=200`；A `SUPER_ADMIN/is_super=true`，B `TENANT_ADMIN/is_super=false`；菜单未消失 |
| S1b bootstrap admin → 他人创建、仅 access 的 Park C | **本轮未证** | 第二管理员 fixture 在受保护系统角色绑定处被产品 API 404 阻断；遵守同题最多两次和不直改 DB，未继续造数 |
| S2 A 有角色、B 仅 access | **静态确认；本轮动态未证** | 模型与用户实测完全吻合；本轮产品 API fixture 在角色可分配边界提前阻断，未伪造运行时 PASS |
| S3 A/B 都有角色 | **既有 G6 快速复核 PASS** | 2026-08-28 §15 G6 已以不同 park role/module links 验证菜单、route、API、数据 scope 全部按 B 收敛 |

因此，不能把本轮结论写成“S1/S2/S3 全部重新动态 PASS”。可确认的是：静态链路已经闭合根因；S1a 新证据证明创建者切园区不会失去全部菜单，但会从 super 降为 tenant admin；S1b/S2 的精确 UI 症状由用户实测支持、由代码必然推出，本轮隔离复现因 fixture 门禁未完成。

## 二、权限是如何调整的

### 2.1 `POST /auth/switch-context`：重签 park-scoped 会话，不复制权限

入口要求当前 principal 持有 `system:user:me`，接收目标 `parkId`，解析 refresh cookie/body token，并区分 rotation 前拒绝；成功后把 audit scope 改为目标 park，见 `apps/api/src/modules/auth/auth.controller.ts:218-254`。

Service 链为：

1. 以旧 token hash、当前 `tenantId + parkId + userId` 找未撤销 refresh token；
2. 调用 `resolveJwtPrincipal({ tenantId: 当前租户, parkId: 目标园区 }, 当前 userId)` 重新解析目标 principal；
3. 目标 principal 成功后条件撤销旧 refresh token；
4. 以目标 principal 签发新 access/refresh token。

证据见 `apps/api/src/modules/auth/auth.service.ts:697-737`。新 access JWT 只携带 `sub`、`username`、`tenantId`、新 `parkId` 和 `authVersion`；权限并不作为可信快照写入 JWT，见 `apps/api/src/modules/auth/auth.service.ts:872-900`。后续 JWT 校验仍会按 claims 中的新 tenant/park/user 重查 principal。

结论：切换不是“把旧权限搬到新园区”，而是 **保留 user/tenant，替换 park，然后在目标 park 重新求值授权**。

### 2.2 目标 park 的 access 校验与角色/权限解析是两层条件

`resolveJwtPrincipal` 允许目标上下文成立的前提是：用户仍启用、目标园区 active，并且目标是没有显式关系的 home park，或存在 enabled、未删除的 `rel_user_park`，见 `apps/api/src/modules/users/users.service.ts:743-767`。

但同一查询对授权关系另行限定：

- `rel_user_role.park_id = 目标 park`；
- role 必须同租户，且 tenant-scope role 或当前 park role；
- `rel_role_perm.park_id = 目标 park`；
- permission 必须同租户、有效。

见 `apps/api/src/modules/users/users.service.ts:701-742`。随后只从这些目标 park 行汇总 active roles/permissions；`isSuper` 仅在 active role 的 `is_super=true` 或本园区权限含 `*` 时成立，见 `apps/api/src/modules/users/users.service.ts:774-803`。

因此：

```text
rel_user_park(target)=enabled
        │
        ├─ 否 → 目标 principal 不成立，switch-context 失败
        │
        └─ 是 → switch-context 可成功
                 │
                 ├─ target rel_user_role/rel_role_perm 存在 → 得到目标园区角色、权限、菜单
                 └─ 不存在 → 仅最低 USER_ME，上下文成立但业务菜单/权限为空
```

### 2.3 `/users/me` 与菜单在切换后重建

Web 切换后实际请求 `GET /users/me`；该 controller 以 JWT 注入的 current scope 与 user id 调 `getCurrentUserContext`，见 `apps/api/src/modules/users/users.controller.ts:38-42`、`apps/web/lib/auth.ts:149-156,219`。系统还保留同语义的 `GET /auth/me`，见 `apps/api/src/modules/auth/auth.controller.ts:191-195`。服务内存路径同样强制 `rel_user_role` 与 `rel_role_perm` 匹配当前 park，见 `apps/api/src/modules/users/users.service.ts:1682-1706`。菜单再从当前权限和当前 park 的 enabled modules 构建，见 `apps/api/src/modules/users/users.service.ts:1709-1735`。

Web 切换链：

1. 选择器只展示 enabled `accessible_parks`；
2. `switchParkContext` 本地只校验目标存在于 access 列表；
3. 调 `POST /auth/switch-context`；
4. 用返回的新 access token 再取 `/users/me`；
5. 校验 `nextUser.park_id`，发布新 token/user；
6. `UserMenu` 按 `nextUser` 预测当前 route，必要时跳到新园区首个可达路径。

见 `apps/web/lib/auth.ts:184-226`、`apps/web/components/layout/UserMenu.tsx:24-46`。显式空 `menu_tree` 是权威结果，Web 不再用静态菜单重建，见 `apps/web/lib/menu.ts:496-504`。所以目标园区无角色时，菜单全部消失是后端空授权的忠实投影，不是 PAM-004 式前端 fallback。

### 2.4 路由与 API 守卫使用新 park principal

- Web `hasPermission` 只对当前 user 的 `is_super/*` 或当前 permissions 放行；模块仍须存在于当前 `enabled_modules`，见 `apps/web/lib/permissions.ts:15-53`。
- API `PermissionGuard` 对新 principal 执行 required/any permission 检查；只有新 principal 的 `isSuper` 或 `*` 可绕过，见 `apps/api/src/shared/guards/permission.guard.ts:42-58`。
- `ModuleGuard` 用新 principal 的 `tenantId/parkId` 实时查 enabled modules，见 `apps/api/src/shared/guards/module.guard.ts:39-52`。

因此菜单、route 与已核查的认证、权限/模块守卫都会按新 park 收敛；结合 G6 已验证的业务 API 路径，未发现“token 已切 B、守卫仍沿用 A 权限”的旁路。本结论不等价于逐 endpoint 审计所有业务 service 的本地状态实现。

## 三、super / wildcard 到底是什么 scope

### 3.1 当前实现语义

当前实现是“**role 定义可为 tenant scope，但 user-role link 与 role-permission link 是 park scope**”。tenant-scope role 只意味着同一 role 实体可在多个 park 被链接，不意味着链接自动跨 park 生效。

这直接导致：

- bootstrap `SUPER_ADMIN` 只在 bootstrap 指定 park 有 `rel_user_role`；
- 目标 park 没有该 link 时，`is_super` 不成立；
- 目标 park 即使存在 tenant-scope role 定义，也不能仅靠 role 定义获得权限；
- `*` 同样必须从目标 park 的 active role/permission links 解析出来。

`scripts/bootstrap-admin.sh:11-14,185-193,274-292` 只围绕指定 `TENANT_ID/PARK_ID/ROLE_CODE` 检查/绑定，没有为租户所有园区补齐链接。

### 3.2 创建园区的特殊授权

新增园区事务会克隆模块、权限并创建目标园区 `TENANT_ADMIN` role，然后只对创建者执行 `bindAdditionalTenantAdmin`，见 `apps/api/src/modules/tenants/tenants.service.ts:375-460`。该 helper 新建三条关系：

- 目标 park 的 `rel_user_role`（tenant admin）；
- 目标 park 的 `rel_user_park`；
- 目标 park 的 `rel_user_org`。

见 `apps/api/src/modules/tenants/tenants.service.ts:1558-1578`。它不复制 `SUPER_ADMIN`，也不授权其他管理员。

这解释 R5 与本轮 S1a：创建者能切换且有菜单，但 bootstrap super 会在 B 被解析为 tenant admin。其他管理员若后来只获 B access，则仍无 B role。

## 四、“给用户配置园区”实际写了什么

用户管理编辑调用 `PATCH /users/:id`，payload 中 `parkId` 是默认/主园区，`accessibleParkIds` 是可访问园区；角色保存是另一个 `POST /users/:id/roles` 请求。

后端 `UsersService.update` 在事务中：

1. 更新 `sys_user.tenant_id/park_id` 与资料；
2. 只要 payload 含 accessible parks/default park/tenant，就调用 `syncUserParks`；
3. 如带组织 assignments，再更新 `rel_user_org`。

见 `apps/api/src/modules/users/users.service.ts:807-887`。`syncUserParks` 校验园区后软删旧 access links，再重建 `rel_user_park`，见 `apps/api/src/modules/users/users.service.ts:1264-1293`。

角色绑定是独立事务。`assignRoles` 只接受当前目标 scope 中非 system/builtin/template 的可管理角色，并只替换当前 park 的可管理 `rel_user_role`，见 `apps/api/src/modules/users/users.service.ts:1077-1135`。本轮 fixture 尝试把受保护的 `SUPER_ADMIN`/`TENANT_ADMIN` 当普通角色分配，均得到 `404 Role not found in current scope`，与这条保护完全一致。

结论：用户说“已经配置园区”只证明 access 已配置，不证明目标园区 authorization 已配置。当前 UI 没有把这一区别解释清楚。

## 五、隔离复现

### 5.1 环境与安全

- 独占 compose project：`jinhu-parkperm-investigation-20260828-01`；
- loopback ports：Web `33100`、API `33101`、PostgreSQL `55442`、raw CDP `9625`；
- 专用 Windows Chrome profile：`parkperm-investigation-20260828-01`；
- migration：265/265 succeeded，8/8 prerequisites succeeded；
- production-safe seed、bootstrap、strict init baseline：PASS；
- fixture 只走产品 API；未直接写业务表；
- 16 表 before/after 与截图/Network/DB 证据写入 local-only 根目录；
- teardown：containers/volumes/networks/ports 均 0，profile 已删除。

主 manifest：`/tmp/jinhu-parkperm-investigation-20260828-01/evidence-SHA256SUMS`（8 entries）。

### 5.2 S1：bootstrap/super admin

#### S1a 自己创建的 Park B

产品 API 创建 Park B 后，浏览器从 A 选择 B：

- `POST /api/v1/auth/switch-context = 200`；
- 后续 `GET /api/v1/users/me = 200`；
- `park_id: A → B`；
- A：`SUPER_ADMIN`、`is_super=true`、顶层 menu count 71；
- B：`TENANT_ADMIN`、`is_super=false`、顶层 menu count 49；
- B Sidebar 非空（记录到 117 个 href，含嵌套/重复选择结果）。

DB：

```text
A|user_park=1|user_role=1|role_codes=SUPER_ADMIN|role_perm=853
B|user_park=1|user_role=1|role_codes=TENANT_ADMIN|role_perm=760
```

证据：`browser-s1-results.json`、`network/browser-s1-network.json`、`screenshots/s1-bootstrap-own-created-park.png`、`db/s1-bootstrap-scope-counts.txt`。

裁定：**切换本身正常，但 super 身份跨园区丢失是产品语义缺口**。如果产品承诺 bootstrap/super 是租户级控制面，这就是应工作而未工作的产品缺陷；如果产品承诺“每园区独立管理员”，当前机制成立，但 UI 必须展示切换后身份和能力变化。

#### S1b 他人创建的 Park C

计划用第二管理员交叉创建 C，再只给 bootstrap admin 配 C access。产品 API fixture 在给第二管理员绑定受保护系统角色时按设计 404；两次同题尝试后停止，未直改 DB、未清表重造。因此本轮没有 S1b 浏览器证据。

静态预期仍明确：若 bootstrap admin 仅有 C `rel_user_park`、没有 C `rel_user_role`，switch-context 会成功，但新 principal 不再是 super，菜单为空。这一预期与用户实测一致，但本报告不把它标为本轮动态 PASS。

### 5.3 S2：普通用户 A 有角色，B 只有 access

本轮 fixture 在创建 S2 前即被上述系统角色门禁阻断；遵守最多两次后未继续。因此状态为 **静态确认 + 用户实测复现，本轮隔离动态未证**。

机制必然结果：B access 使目标 principal 成立；缺 B `rel_user_role` 使 active roles 为空；permissions 仅保留服务端追加的 `system:user:me`；menu tree 为空；业务 route/API fail-closed。这个行为与上一轮审计的设计语义一致。

裁定：**设计语义，但存在严重可用性与配置完整性缺口**。若产品把“配置园区”表达成可在该园区工作，则也是产品缺陷；若 access 只表示可进入上下文，则必须在 UI 明示“未配置任何园区角色”。不是缓存/刷新或用户误操作可以单独解释的问题。

### 5.4 S3：普通用户两园区均有角色

本轮不重复造数，复用同日刚归档 §15 G6 的快速对照结论：A/B 具有不同 park-scoped role links/module assignments；切换后 `/users/me`、Sidebar、route/page state、statistics API 与数据均按 B 收敛，排除 A 数据。权威记录：`docs/uat/pam-audit-s15-regression-uat-20260828-122122.md:54-63,98-110`。

裁定：**正常对照 PASS**。它证明切换机制本身能工作，问题集中在目标 park 授权关系缺失或 super 产品语义。

## 六、根因树与定性

| 编号 | 现象 | 直接根因 | 深层根因 | 定性 |
| --- | --- | --- | --- | --- |
| PSW-001 | bootstrap/super 切非初始园区失去 super，可能无菜单 | super/`*` 仍依赖目标 park 的 role/perm links | 产品把 super 命名/预期成全局能力，数据模型却是 park-link capability；bootstrap 不覆盖后续 park | **产品缺陷或需明确改变产品语义**；推荐按租户控制面缺陷处理 |
| PSW-002 | 普通用户已配置 B，切 B 后菜单全空/API 403 | B 只有 `rel_user_park`，没有 `rel_user_role` | “园区 access”与“园区岗位/角色”分离，但 UI 无完整性检查和引导 | **设计语义但有严重可用性缺口**；若 UI 承诺“可用园区”，则是产品缺陷 |
| PSW-003 | 切换后用户只看到“无权限/空菜单” | 空树为权威；route/API 正确 fail-closed | 缺少目标园区角色诊断、管理入口链接和可恢复动作 | **体验兜底缺陷** |

不是根因：

- 在已核查的认证、权限/模块守卫与 G6 业务 API 路径中，不是旧 token 继续使用 A 权限；新 JWT park 与 `/users/me` 都重建。
- 不是 PAM-004 空树 fallback；显式空树当前会保持空。
- 不是单纯刷新问题；园区切换已强制用新 token 重取 `/users/me`。
- 不是模块守卫单点错误；无角色时 page permission 在更早层已经为空。

## 七、解决方案

### 7.1 PSW-001：super/wildcard 跨园区语义

#### 方案 A（推荐）：super 作为 tenant control-plane capability，不依赖逐 park user-role link

- 改动面：principal 解析、super 判定、bootstrap/onboarding、审计与相关测试；菜单仍按目标 park module 状态投影。
- 规则建议：只有受保护 `SUPER_ADMIN` 身份可跨同租户园区继承 super；普通 tenant role 和任意自定义 `*` 不自动跨 park，避免扩大授权。
- 风险：越权面最大，必须区分平台 super、租户 super、园区 admin；不能把所有 wildcard 都提升成租户级。
- 迁移：可不回填逐 park links，改为独立 tenant-level super binding/identity；若复用现表，需为历史 super 建立可审计的 tenant-level 关系，不能盲目复制到所有 park。
- 验证：自建/他建/未来新增 park；active/disabled park；多租户；super 与普通 wildcard 对照；菜单、route、API、audit scope。

#### 方案 B：维持 park-link 模型，但创建/授权园区时为既有 tenant super 自动补 link

- 改动面：park create transaction、bootstrap/reconcile、历史数据迁移。
- 优点：沿用现有 principal SQL。
- 风险：每次新增/删除 super 或 park 都要双向 reconcile；复制 `rel_role_perm` 易漂移，历史 cardinality 大。
- 验证：并发建园区、重试幂等、撤销 super、历史园区回填、失败事务全回滚。

#### 方案 C：明确 super 只在所属园区成立

- 改动面：产品文案、角色命名、切换器身份提示。
- 风险：与“超级管理员”的常规认知冲突，用户反馈仍会持续；不推荐。

### 7.2 PSW-002：access 无角色

#### 方案 A（推荐 MVP）：园区授权完整性提示 + 角色必配引导

- 用户管理保存后，对每个 enabled accessible park 显示角色状态；access-only 标红“可切换但无业务角色”。
- 切换器在选择前显示目标园区角色摘要；无角色时可阻止切换或二次确认。
- 空态直接说明“已获得园区访问权，但尚未配置园区角色”，并提供有权限管理员可用的角色配置入口。
- 改动面：用户管理投影/API、园区切换 UI、403/空菜单体验；无数据迁移。
- 风险：需要定义谁能看到角色诊断；不能泄露角色/权限详情给普通用户。
- 验证：access-only、角色禁用/删除、模块为空、管理员/普通用户文案与恢复路径。

#### 方案 B：授予园区时要求同时选择目标园区角色

- 把 access 与 role 作为同一事务/向导，但仍分别持久化；未选角色不能完成“可工作园区”授权。
- 风险：某些合法 access-only 用户（仅查看空控制面、待后续分岗）需要显式例外状态。
- 迁移：历史 access-only 行需要审计清单，不应自动猜角色。

#### 方案 C：提供“复制/继承来源园区角色”可选项

- 仅对目标园区存在同模板/同语义 role 的情况显式复制；默认关闭。
- 风险：园区模块、模板版本、数据范围不同，按 role id/code 盲拷贝会越权；需要 template identity、preview、审计和冲突处理。
- 不推荐作为默认动作，可作为管理员高级选项。

### 7.3 PSW-003：切换后无权限兜底

可选策略：

1. **推荐**：允许切换进入“园区未配置角色”专用空态，保留园区选择器、退出登录、账号安全和返回原园区动作；不把它伪装成通用 403。
2. 切换前调用只读 capability summary，若目标无角色则阻止并提示管理员配置。体验更直接，但要处理角色在预检后被撤销的竞态，后端仍须 fail-closed。
3. 自动回退原园区。不推荐默认使用：上下文可能已完成 refresh rotation，静默二次切换会增加会话歧义；可提供显式“返回原园区”按钮。

## 八、需要用户/产品批准的决策点

1. **D1：`SUPER_ADMIN` 是否是同租户所有园区的控制面身份？** 推荐“是”，但仅限受保护 super identity，不把普通 `*` 自动提升为 tenant-global。
2. **D2：access-only 是否是合法持久状态？** 推荐允许暂存，但 UI 必须标识为 incomplete；若“配置园区”代表可工作，则保存前必须同时配置角色。
3. **D3：无目标角色时是否允许切换？** 推荐允许进入可恢复专用空态；管理端可选择预检阻止，不能仅显示通用无权限并清空所有导航。
4. **D4：是否提供角色复制/继承？** 推荐不默认继承；如需要，只提供带 preview 的显式高级动作，并以 role template identity/模块兼容性为前提。
5. **D5：历史 access-only 数据如何处理？** 推荐先出审计清单，由管理员逐园区确认角色；不自动批量猜测或复制权限。

只有 D1–D5 获批后，才应另开修复队列。本调查不创建修复 Issue。

## 九、验证、限制与剩余风险

### 已完成

- auth/token/users/menu/Web/API guard 全链静态点验；
- 隔离 migration 265/265、prerequisite 8/8、production seed、bootstrap、strict baseline；
- S1a 真实 Windows Chrome/raw CDP、Network、截图、DB 关系计数；
- 16 表 before/after、SHA256 manifest、完整 teardown；
- S3 对照复核既有同日 G6 证据。

### 未完成

- S1b 与 S2 本轮隔离浏览器复现；原因是产品 API fixture 在受保护系统角色绑定处连续两次 404，硬约束禁止第三次同题尝试和 DB 直改。
- 手机 390px 检查；本轮调查的是全局权限语义，且唯一成功浏览器场景为桌面切换。
- 未连接生产、未核验任何生产用户实例。

### 剩余风险

- 用户实测实例可能还叠加模块 assignment、角色禁用或 permission metadata 漂移；本报告确认 access-only/super scope 是充分根因，但不声称是其生产实例的唯一数据异常。
- S1a B 的 tenant admin 菜单较多，不等价于 S1b access-only 的空菜单；两者必须分开解释。
- 若未来选择 tenant-global super，必须防止跨租户提升，并明确 super 是否绕过 permission 但仍受目标 park module/status 约束。

## 十、零改动声明

本任务未修改 `apps/`、`packages/`、`database/`、`scripts/`、CI workflow 或任何 HR 文件；仓库改动仅为本报告与 Trellis investigation 工件。未创建修复 Issue，未操作生产，未使用 force push。
