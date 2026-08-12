# Evidence Audit — origin/main dad3a11a

## Git And Delivery Baseline

- 主工作区位于 `codex/issue-257-tenant-asset-scope-reconcile`，存在 81 项未提交/已暂存修改；本任务不得写入。
- 最新 `origin/main` 为 `dad3a11a`（“支持在用户账号上配置角色权限 (#261)”）。
- PR #259 已合并，merge commit `7143ea13`；PR #261/Issue #260 已补用户角色配置主体。
- 本任务 worktree：`/home/jinhuit/JinHuCodebase/jinhu-smart-park-property-role-productization`；分支 `codex/issue-262-property-role-productization`。

## Bundle And Reconcile

- `packages/shared/src/property-business/permission-bundles.ts:13-158` 定义 Track-B bundles；asset manager 已含 create/activate/release，民宿/住房 finance bundles 分立。
- `database/migrations/000189_property_b_module_rbac_definitions.sql:274-587` 建立 bundle/version/hash/frozen drift 合同；`000206_property_asset_manager_bundle_v2.sql` 处理 asset manager v2。
- `database/seeds/production/000006_property_track_b_permission_reconcile.sql:1-388` 只收敛固定 bootstrap scope 与 SUPER_ADMIN，不创建普通标准岗位角色。
- 通用 role template 先例见 `000147_role_pack_real_park_operations.sql`，但没有房产业务 bundle→role 产品化。

## Scope And Field Security

- `property-unit-access.service.ts:17-57` 按 tenant/park 与 building/floor/unit 范围过滤；空允许集合为 deny，unrestricted 为 null。
- `data-scope.service.ts:215-257,277-287` 的未知 column/无匹配维度存在退化为 unrestricted 的 fail-open 风险，实施前需精确测试并收敛。
- `parties.service.ts:173-211,420-430,477-505` 以 `party:sensitive_read` 投影敏感手机号/身份字段。
- `field-policy.service.ts:184-207` 实际执行 hidden/masked，readonly/editable 目前不是统一写入阻断。
- housing finance 高风险动作由显式 permission + approval runtime 约束；金额/身份也在 audit interceptor 敏感黑名单中。

## Visible Consumers

- `000006_property_track_b_permission_reconcile.sql:159-216` 与 `000189:824-844` 当前写入 `visible = permission_type = 'api'`，与 canonical page/menu 语义相反。
- `users.service.ts:1571-1581` 动态菜单只保留 visible 且 permType 10/20；API 授权使用 permission code，不依赖 visible。
- 因此修正为 page/menu visible、API/action invisible 不会把 API 变成菜单，但需要同步前向 migration、seed drift 和契约脚本。

## User Role Closure

- PR #261 提供 `GET /users/role-candidates`、`GET /users/:id/roles`、`POST /users/:id/roles`，后者有幂等、审计和事务化替换。
- 候选已限制 tenant/current park、enabled/non-deleted、非 platform；仍未排除 `isTemplate=true`。
- 替换只保护 platform link；tenant/park 的 system/builtin link 仍可能被软删，需要收紧。
- JWT strategy 每请求从 DB 重算 principal，理论上权限下一请求生效，但缺少角色更新/换号/客户端缓存回归。

## Decisions Derived From Evidence

- 财务角色拆为民宿财务与住房财务两个模板；兼岗由显式 bundle 组合完成。
- bundle update 默认 merge 保留额外权限；sync 删除必须 diff + 二次确认。
- 默认审计模板不授予 `party:sensitive_read`，敏感合规能力必须显式附加。
- 模板不可直接分配用户，必须实例化为普通 current_park 角色。

## Memory Limitation

- 用户指定的历史 Codex task `019feed8-9c37-7400-b37e-0cf77f44ba6f` 无法通过 `trellis mem` 抽取：当前宿主没有安装 `trellis` 命令。已读取技能 CLI 参考，并以用户本轮明确列出的流程要求替代，不猜测历史对话。
