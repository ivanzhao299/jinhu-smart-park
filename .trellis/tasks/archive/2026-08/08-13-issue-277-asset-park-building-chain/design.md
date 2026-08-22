# 技术设计

## 边界与决策

园区是认证数据隔离上下文，不把 `parkId` 降级为可由业务 DTO 任意指定的外键。楼栋新建表单从 `/auth/me.accessible_parks` 构建候选；选择目标园区后，非当前园区先调用 `/auth/switch-context`，由后端验证用户—园区关系并轮换 access/refresh token，然后使用新 access token 创建楼栋。

已有楼栋不允许直接迁园。普通编辑只修改楼栋自身属性。未来若需要迁园，必须作为独立高风险事务设计，覆盖楼层、房源、工单、隐患、巡检、IoT、工程、能耗及审计引用。

## 数据流

1. 页面加载认证上下文和 `accessible_parks`。
2. 新建表单默认当前园区（不是数组第一项），用户可选择其他有权园区。
3. 提交时若目标园区不同：调用 switch-context，原子更新本地 token/context；失败则不创建。
4. 使用目标上下文 access token 调用 `POST /buildings`；后端仍只信任 `CurrentScope`。
5. 创建成功后重载当前园区的楼栋列表，列表和详情用当前园区上下文显示园区名称。

## 数据库

新增 `000211_*` 前向迁移：

- 对现存 building→park、floor→building、unit→building/floor 的 tenant/park 不一致执行只读 preflight；发现漂移直接失败，不猜测修复。
- 在所需父表补充适合作为复合引用目标的唯一键，并建立 tenant/park 复合外键；采用锁和 `NOT VALID`/`VALIDATE` 的安全模式关闭扫描与约束安装窗口。
- 将 active building/floor code 唯一性从全局调整为 `(tenant_id, park_id, code)`；实体索引保持同步。
- 不修改 `000008`–`000011` 已应用迁移。

具体 DDL 在实现前以 PostgreSQL 当前约束和软删除语义复核；若 `biz_park` 的业务键不足以形成稳定复合 FK，则保留应用层验证并把 FK 缩减为可证明安全的层级约束，不制造伪完整性。

## 兼容与回滚

- `/buildings` DTO 保持兼容，不新增可绕过 scope 的目标 `parkId`。
- 单园区用户行为不变；多园区用户新增显式选择和安全上下文切换。
- 迁移为 forward-only；发布前 preflight 失败即停止部署。应用回滚不撤销已验证的约束，必要时以前向补丁修正。
- 上下文切换成功但创建失败时保留已切换的合法上下文并明确提示，避免使用已旋转失效的旧 token。

## 安全与权限

- 候选园区来自服务端可访问园区，不信任浏览器选项。
- 最终授权由 switch-context 与 `BuildingsService` 当前 scope 双重执行。
- 禁止跨租户目标和停用/删除园区；数据范围不得被前端候选扩大。
