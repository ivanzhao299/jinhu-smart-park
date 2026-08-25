# Design: 超管登录首页落点

## Chosen Design

采用前端方案 A：在 `resolvePostLoginPath` 的桌面分支中，于首菜单选择之前识别平台超管并返回 `/dashboard`；移动分支顺序保持不变。

超管识别复用现有 permission 语义，不引入角色名或菜单名猜测：`is_super === true`、兼容字段 `isSuper === true`、或 `permissions` 含 `*`。实现可以调用已有 `hasPermission(user, '*')`，因为该 helper 已统一这三种情况。

数据流：

1. 登录完成后取得完整 `UserContext` 与设备信号。
2. 计算 API 菜单首个可访问 href、工程能力、安全现场能力和移动设备判定。
3. 若为移动设备，保持工程终端 → 安全终端 → 首菜单 → `/dashboard` 的现有顺序。
4. 若为桌面且为平台超管，返回 `/dashboard`。
5. 其他桌面账号保持首菜单 → 工程 fallback → `/dashboard`。

## Alternatives

### 后端注入“总览→首页”节点

优点是 API 菜单与登录落点统一；缺点是改变全员 API 菜单与可能的菜单管理/审计语义，且内存注入仍与 DB 数据模型分叉。侧边栏已通过 Web 静态菜单合并显示首页，因此收益有限、影响面更大，本轮不采用。

### 为所有 dashboard 类首菜单账号改回 `/dashboard`

会把工程、民宿、住房等岗位从其业务工作台拉回通用首页，破坏“首个可访问菜单”的岗位价值；不采用。

### 为租户管理员/首管强制首页

当前 `UserContext` 没有稳定、唯一的租户管理员落点标识。按菜单、权限组合或名字推断脆弱且可能误伤业务管理员。本轮只记录需求缺口。

## Compatibility And Risk

- 只改变桌面超管登录首跳；不改变直接 URL 访问、侧边栏、权限守卫或 API 返回。
- 移动判断和终端优先级不动，真手机与窄窗口行为不回退。
- `/dashboard` 无 permission/module 要求，适合作为超管稳定落点。
- 回滚只需撤销 `resolvePostLoginPath` 的一个条件分支和新增测试。

## Operational Notes

- 无 schema、seed、env 或 API 变化。
- 发布依赖既有 GitHub Deploy Production workflow；必须观察健康检查和 Docker cleanup 日志。
- 不进行生产直操作。
