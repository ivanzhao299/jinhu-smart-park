# 设计：新租户编码规则与多园区楼栋选择闭环

## Failure Model

缺陷由两个独立但连续的状态缺口组成：

1. 平台标准编码规则只存在于固定 seed scope。新 tenant/park 创建事务没有复制规则；前端允许编码留空后，楼栋服务在目标 scope 查不到 `building` 规则并返回英文 404。floor/unit 以及其他依赖 code rule 的启用模块同样受影响。
2. 楼栋选择器依赖 `/users/me.accessible_parks`。历史 home park 用户缺少关系行时后端使用“当前园区”占位；新增园区后页面未刷新用户上下文，导致新关系虽已提交但浏览器仍使用旧列表。

## Code Rule Provisioning Contract

新增共享的 scope provisioning helper，由租户默认园区创建、新增园区创建和后续套餐/模块变更在各自现有数据库事务内调用。

- 标准来源固定为平台标准 scope `10000001/20000001` 中 `status='enabled' AND is_deleted=false` 的规则。
- helper 不信任 DTO 的 raw `moduleCodes`，而是在同一事务内读取已持久化的 `rel_tenant_module + sys_module`：assignment/module 必须启用、未删除且尚未过期；未来生效的 assignment 提前完成规则投影，但模块运行时可见性仍继续校验 start time。`system` 等没有标准规则的模块自然为空。
- 新记录复制规则结构和示例，但 `current_seq/current_sequence=0`、`next_reset_time=NULL`，审计人为当前操作人。
- 若目标 scope 已存在同 `rule_code` 的任何历史记录（包括 disabled/soft-deleted），跳过该规则，避免复活管理员明确停用或删除的配置。
- 依靠目标 scope 的 active rule 唯一索引和事务锁/幂等 `INSERT ... SELECT ... WHERE NOT EXISTS` 防止重复。
- provisioning 前验证固定来源至少包含 asset 的 `BUILDING_CODE/FLOOR_CODE/UNIT_CODE` 核心规则；asset 已启用但标准来源不完整时 fail-fast，避免创建半可用 scope。

该 helper 是防复发的唯一动态入口：标准规则集合由固定平台 scope 的数据驱动，而不是在服务代码再维护一份易漂移的 entity 列表。新模块迁移把规则写入固定标准 scope 后，任何新 scope 或后续模块启用都会自动投影；契约测试扫描标准规则与有效模块分配，防止新增任务只更新 seed 而遗漏 runtime provisioning。

## Existing Scope Migration

新增下一编号的 forward-only migration（当前主干最新为 `000211`）：

- 获取 advisory lock，并在明确锁窗口内运行。
- 对 active `biz_park` 且拥有 enabled、未删除、尚未过期的 `rel_tenant_module + sys_module` 分配（包括未来生效 assignment）的 scope，从固定标准 scope 补齐缺失规则。
- 使用与运行时相同的来源、模块过滤、序列归零和“不覆盖任何历史记录”语义。
- 迁移前检查固定来源 asset 核心规则完整；不自动猜测其他来源。
- 迁移可由 disposable PostgreSQL 重放验证，不修改历史成功迁移。

## User Park Projection Contract

`resolveAccessibleParks` 继续以当前 tenant 内 enabled `rel_user_park` 为主要授权来源，并移除“当前 tenant 无关系时查询同一用户所有 tenant 关系”的跨 tenant fallback。仅当调用者自身 `user.parkId` 属于当前 tenant 的 exact home scope，且该 active/non-deleted park 未出现在关系结果中时，追加这一条 home projection。该兼容不接受任意 parkId，也不扩大其他园区访问；停用/删除 home park 不投影。

`getCurrentUserContext` 必须从 projection 返回真实 `park_name` 和 `current_park`；前端不再依赖“当前园区”作为选项标签。

## Frontend Freshness Contract

园区创建成功后，页面使用当前 access token 重新请求 `/users/me` 并持久化新用户上下文，然后通过受控页面刷新重新建立 `AuthUserContext`。用 session flash 保留“保存成功”提示。编辑园区不需要刷新 accessible park 集合，仍走原列表刷新。

楼栋页保留主干现有行为：新增时从 `accessible_parks` 选择目标园区；目标不同则调用 `switchParkContext`，原子发布新 token/user 后创建楼栋并 reload。编辑楼栋时园区只读，不支持搬迁。

## Compatibility And Safety

- 不在 Building DTO 增加 `parkId`，所有业务读写仍由 JWT scope 和后端 data scope 约束。
- 不共享序列、不复制来源 current sequence，不把租户自定义规则反向写回平台标准 scope。
- 已有规则、禁用/软删除规则和管理员定制均保持不变。
- 新增园区事务中任何规则/权限/关系初始化失败均整体回滚。
- 迁移失败后停止后续 seed/deploy；回滚使用上一稳定镜像，迁移本身不删除业务记录。

## Validation Shape

- 纯逻辑/服务测试：标准来源过滤、目标历史保护、序列归零、重复调用幂等、缺核心规则 fail-fast。
- 租户与园区测试：新租户、附加园区、后续套餐/模块变更三个入口均调用 provisioning；新增园区关系和 `/users/me` projection 立即一致。
- 防复发测试：从平台标准 scope/seed 发现规则集合，验证 runtime helper 以 module 数据驱动，无需为未来 entity type 再维护平行常量；入口契约禁止绕过 helper。
- PostgreSQL：迁移补齐现有 scope、保留定制/disabled/deleted、幂等重放、独立序列生成。
- API E2E：新租户默认 park 与第二 park 分别创建 building→floor→unit，验证 scope 隔离和 switch-context。
- Web/浏览器：新增园区后无需重新登录即出现在楼栋选择器，显示真实名称；桌面和 390px 无根横向溢出。
- 安全负向：其他 tenant link、停用/删除 home park、伪造/未绑定 parkId 均不可见或不可切换。

## Rollout And Rollback

CI 先运行 migration/release-smoke，再进入主干部署。生产部署遵循仓库既有顺序与 Docker cleanup。若 migration preflight 或健康检查失败，停止后续步骤并保留日志；不绕过检查、不手工连接生产修数据。
