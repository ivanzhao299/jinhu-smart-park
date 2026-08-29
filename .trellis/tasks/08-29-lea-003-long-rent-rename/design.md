# LEA-003 技术设计

## Boundary

本任务是显示名 reconcile，不是授权模型迁移。稳定身份仍为 `housing_rental` 模块、现有 menu/page code、`housing:*` 与 `housing_rental:*` 权限 code，以及现有路由。

## Source and consumers

1. shared 层维护 property-business surface/permission 的 canonical 显示定义。
2. API `UsersService` 按现有 module/page permission 投影 `/users/me` 菜单，只替换住房长租根菜单和相关 fallback 的 label。
3. Web 菜单和 housing 公共 surface 使用同一“长租经营”语义；具体房源通过既有 `rental_segment` 呈现“住宅长租/办公长租”。
4. 数据库存量由新 migration 对每个 tenant 的现有定义行做 name-only reconcile。

## Migration contract

- 新建 `000284_*`，不编辑 000178/000182/000183/000283 等已存在 migration。
- 目标租户来自实际存在的目标 module/permission 定义，而不是 registry 作为授权 authority。
- 更新键包含 `tenant_id` 与稳定 code；按表的真实唯一身份更新 `name`/`module_name`/菜单 label 字段。
- 迁移前后按 tenant + code 核验每条已存在目标定义；租户可合法只持有权限子集，缺失不补写，重复或更新后名称不一致时 `RAISE EXCEPTION`。
- 迁移不写 `rel_role_perm`，不改变 permission/module/menu code，不改变 park scope。
- 允许 migration runner 重入时重复执行并得到相同结果。

## Compatibility

- API/Web 路由、权限判断、菜单过滤和已有书签不受影响。
- 新环境仍先重放历史 migration，再由 000284 收敛名称；运行时源码 canonical 定义同步更新，避免后续投影回写旧名。
- 审计动作名若属于用户可见业务模块名称，改为“长租经营”；具体领域对象如“住房租约”仅在不会误导办公长租时调整为中性“长租租约”。

## Test design

- SQL contract/integration fixture 至少包含两个 tenant，断言每租户目标行名称收敛、code 原样、非目标行不变、重跑无额外变化，并覆盖 fail-closed 漂移。
- API 菜单测试覆盖 canonical、fallback、wildcard/显式 page 权限和 legacy 节点去除。
- Web 菜单测试覆盖 root label、canonical surface 路由与权限 code 不变。
- shared manifest/permission regression 对目标 code → 中文显示名做精确断言。
- 浏览器验证桌面与 390px，记录 URL、viewport、截图 manifest 和 Network 异常。

## Rollback

代码可通过普通 revert 回滚；数据库为 forward-only，不下发 down migration。若需恢复旧展示名，应另建更高编号的 name-only reconcile migration，仍不得修改 code 或绑定。
