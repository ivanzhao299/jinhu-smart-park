# Implementation Plan

GitHub Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/260
Implementation branch: `codex/issue-260-user-role-management`

## 1. Contract And Service

- [x] 加载 API/Web/shared 规范及跨层指南。
- [x] 定义用户角色读取视图和 endpoint 权限边界。
- [x] 修正目标用户作用域解析，保证角色读取/写入与用户管理跨租户语义一致。
- [x] 将角色替换纳入事务并显式处理重复 ID。
- [x] 补充 service/controller 单元测试。

## 2. Web User Management

- [x] 增加角色候选、当前绑定和权限判断状态。
- [x] 新增/编辑抽屉加入触控友好的角色多选与加载/错误状态。
- [x] 新增与编辑保存后调用独立分配接口，使用独立幂等键。
- [x] 用户列表显示角色摘要；保持组织岗位流程兼容。
- [x] 补充必要的前端测试或静态契约检查。

## 3. Regression And Documentation

- [x] 扩展 users-assets 定向 E2E，覆盖读取、替换、清空和登录授权。
- [x] 同步系统基础与测试文档。
- [x] 运行 API 定向测试、Web typecheck、workspace lint/typecheck/build。
- [x] 在隔离 PostgreSQL/API 环境运行定向 E2E；完整 first-release regression 因范围和运行成本未执行。
- [x] 使用 Windows Chrome headless + CDP 实页检查 1440×960 与 390×844：角色候选、编辑回读、实际保存、列表/移动卡片回显和横向溢出矩阵通过。

## Risk And Rollback Points

- 修改角色作用域查询前，逐项验证 tenant、park、platform 和 super-admin 边界。
- 跨请求创建+角色分配不能伪装成数据库原子操作；前端错误提示必须可恢复。
- 不修改 Issue #257 工作区中的任何文件。
