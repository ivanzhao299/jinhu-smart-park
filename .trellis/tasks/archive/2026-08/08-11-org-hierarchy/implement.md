# 组织上下级与组织层级实施计划

GitHub Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/248
Implementation branch: `codex/issue-248-org-hierarchy`

## 阶段 1：契约、迁移与组织树

- [x] 读取 API、Web、Shared、数据库相关 Trellis 规范与现有任务上下文。
- [x] 在 `packages/shared` 定义组织树节点和用户组织关系契约，保持现有字段兼容。
- [x] 新增下一可用编号的前向迁移：存量检查、父级索引、自引用外键、用户组织唯一性约束。
- [x] 为 `OrgsService` 增加树查询和统一父级合法性/防环校验。
- [x] 删除组织前检查有效子组织和用户组织关系；补充明确业务错误。
- [x] 新增组织服务单元测试：三级排序、自引用、循环和删除阻断。

## 阶段 2：用户组织、岗位与主组织

- [x] 明确并新增岗位读取能力，不改变既有岗位实体语义。
- [x] 新增用户组织关系读取、候选与替换式更新契约。
- [x] 在事务中校验并同步 `rel_user_org`，保证最多一个有效主组织且关系不重复。
- [x] 服务端覆盖无效/停用组织、无效岗位和跨租户园区校验。

## 阶段 3：递归数据范围

- [x] 在 `DataScopeService` 中仅对 `org_and_children` 展开有效组织后代。
- [x] 保留其他 scope 类型和空集合语义，递归结果使用集合去重。
- [x] 增加单元测试验证递归 SQL、隔离参数和空根拒绝语义。

## 阶段 4：Web 与移动端

- [x] 组织页接入树接口，增加上级组织、负责人、层级展示和删除入口。
- [x] 用户页接入主组织、兼任组织与岗位维护。
- [x] 使用 Design System 表面类，提供桌面树与移动卡片视图。
- [x] 增加前端逻辑/契约测试。
- [ ] 实际浏览器桌面和 390px 检查（`computer-use` 无法接受 WSL sandbox URI）。

## 阶段 5：回归与文档

- [x] 新增 `scripts/e2e/first-release-org-hierarchy.mjs`，覆盖三级树、循环父级、删除阻断和用户主组织关系。
- [x] 将脚本接入首发回归入口，并同步相关测试/系统基础文档。
- [x] 确认只修改任务相关文件，无历史迁移改写。

## 验证命令

- `pnpm --filter @jinhu/shared build`
- `pnpm --filter @jinhu/api test:unit`
- `pnpm --filter @jinhu/api build`
- `pnpm --filter @jinhu/web test:unit:system`
- `pnpm --filter @jinhu/web typecheck`
- `pnpm --filter @jinhu/web build`
- `pnpm db:migrate`
- `pnpm db:check:init`
- `node scripts/e2e/first-release-org-hierarchy.mjs`
- `node scripts/e2e/first-release-regression.mjs`（环境可用时）
- `pnpm lint`
- `pnpm typecheck`

## 风险与回滚点

- 添加外键/唯一索引前必须先扫描存量异常；异常时停止迁移并输出记录 ID。
- 用户组织关系同步必须在事务内完成，避免多个主组织或关系丢失。
- 递归权限是高风险授权变化，必须以“不能扩大未配置权限”为测试底线。
- Web 改造保留原列表接口，必要时可独立回退树形展示而不回退数据库完整性修复。
