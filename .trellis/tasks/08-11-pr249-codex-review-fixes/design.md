# PR #249 Codex review 修复设计

## 边界

本阶段只修复审查指出的组织树授权、递归数据范围、用户创建原子性、Web 请求竞态、组织删除关系、负责人目录、父级并发和跨园区关系替换问题。不改变权限点名称、历史迁移或分页组织接口。

## 后端设计

### 组织树授权

`OrgsController.tree` 传入当前 actor，`OrgsService.tree` 使用与 `list` 相同的 `DataScopeService.buildFindWhere(..., "org", ..., { org: "id" })`。过滤后缺失父节点的允许节点作为当前投影根返回，不补回未授权祖先。

### `org_and_children`

普通显式 scope 继续直接加入配置 ID；`org_and_children` 跳过 raw ID 加入，仅采用递归 SQL 返回的已验证根和后代。这样保留“组织及子级”包含有效根的语义，同时拒绝停用、删除或跨作用域根。

### 父级并发

所有组织层级写入在事务内获取按 `tenantId/parkId` 派生的 PostgreSQL transaction advisory lock，再用事务 repository 完成校验和保存。锁只序列化同一园区的组织层级写入，不阻塞其他园区；事务结束自动释放。

### 用户创建原子性

`CreateUserDto` 新增可选 `assignments`，沿用关系替换 DTO 的嵌套校验。`UsersService.create` 在一个事务中完成：用户名检查、用户保存、可访问园区同步、组织/岗位校验、关系插入。旧客户端省略字段时行为兼容。Web 新建改为一次 `POST /users`；编辑仍用独立关系替换接口。

### 关系与候选

- 替换关系的软删条件增加目标 `tenantId/parkId`。
- 组织删除的关系计数联结活动未删除用户。
- 负责人候选去除 500 条静默上限，返回完整有效目录。

## Web 设计

组织目录加载使用独立递增 generation。每次新建/编辑开始、关闭抽屉、切换租户/园区时使旧 generation 失效；只有当前 generation 可写入组织树、岗位和已有关系。

## 兼容与回滚

- 新建用户 `assignments` 可选；独立 `/users/:id/orgs` 保留。
- 不修改已成功迁移；并发锁属于服务运行时行为。
- 若审查修复回滚，只需回滚本阶段代码提交，不影响 `000202` 已建立的数据库对象。
