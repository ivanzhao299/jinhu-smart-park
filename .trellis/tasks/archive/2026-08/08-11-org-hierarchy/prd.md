# 完善组织上下级与组织层级能力

GitHub Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/248

## Goal

把现有仅保留 `parent_id` 的平铺组织 CRUD，完善为可维护、可校验、可展示的组织层级能力，避免无效父级、循环关系、越权跨园区关联以及删除父组织导致的数据不一致。

## Confirmed Facts

- `sys_org.parent_id` 与 API `parentId` 已存在，迁移 `000175` 已写入“集团 → 部门 → 子公司”层级数据。
- 当前数据库没有组织父级自引用外键、父级索引、`level/path` 或闭包表。
- 当前组织列表 API 是分页平铺查询，没有组织树接口或递归组装。
- 当前新增、修改、删除未校验父组织存在性、同租户同园区、自引用、循环关系或存量子组织。
- 当前 Web 组织页面没有父组织/负责人字段，也没有树形展示。
- `org_and_children` 数据范围目前没有沿组织树递归展开。
- `rel_user_org` 已存在，但当前用户管理页面没有组织、岗位和主组织维护入口。

## Requirements

- 提供同租户、同园区范围内的组织树查询能力，并保持现有分页列表接口兼容。
- 新增和编辑组织时可以选择父组织；服务端校验父组织存在、作用域一致、不能自引用且不能形成循环。
- 删除或停用组织时明确处理存量子组织，禁止产生孤儿层级。
- Web 端以树形或具备明确层级缩进的方式展示组织，并展示上级组织与负责人。
- 数据库为 `parent_id` 增加必要的完整性和查询性能保障，采用新的前向迁移，不修改历史迁移。
- API、Web、共享契约、迁移、自动化测试和相关文档同步更新。
- 兼容既有根组织和迁移 `000175` 已创建的层级数据。

## Scope Decision

- 同一个 Issue 同时交付用户组织/岗位/主组织维护，以及让 `org_and_children` 真正递归包含所有下级组织。
- 采用分阶段验收，任何阶段都不得以破坏既有 `/orgs`、`/users` 或数据范围行为为代价。

## Acceptance Criteria

- [ ] 组织树能正确返回至少三级结构，并按 `sortOrder` 稳定排序。
- [ ] 创建和编辑页面可以选择合法父组织，编辑时不能选择自身或自己的后代。
- [ ] API 拒绝不存在、跨租户、跨园区、自引用和循环父级关系。
- [ ] 对存在未删除子组织的组织执行删除时返回明确业务错误。
- [ ] 用户可以维护一个主组织及零到多个兼任组织，并为组织关系选择合法岗位；同一用户最多一个有效主组织。
- [ ] 停用或删除的组织、岗位不能被新增为用户组织关系，既有关系的展示与审计信息仍可追溯。
- [ ] `org_and_children` 从规则配置的组织开始递归包含所有有效下级组织，并保持其他数据范围类型原有语义。
- [ ] 既有平铺列表接口及现有调用方保持兼容。
- [ ] 桌面与 390px 手机宽度下均可查看和维护组织层级，无横向溢出。
- [ ] 相关 API 单元/集成测试、Web 类型检查、迁移校验和构建通过。
- [ ] Issue、Trellis 任务、分支命名和后续 PR 互相关联。

## Out of Scope

- 不引入物化路径、闭包表或 PostgreSQL `ltree`，除非后续性能证据证明邻接表不足。
- 不修改已执行的历史迁移。
- 不在本任务中重构角色树或权限树。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
