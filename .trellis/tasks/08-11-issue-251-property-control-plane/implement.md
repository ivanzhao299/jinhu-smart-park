# Issue #251 实施计划

## Phase 0：基线与契约确认

- [x] 读取 API、Web、Shared 与跨层 Trellis 规范。
- [x] 核对分支、base SHA、worktree clean 和 Issue #251 链接。
- [x] 记录现有 route/API/permission/service 测试基线。

## Phase 1：Shared 契约、RBAC 与菜单

- [x] 补齐 asset property surface 菜单和首发路径。
- [x] 增加聚合模式切换 API/query 契约。
- [x] 对齐占用 create/activate/release/force-release 权限清单与权限包。
- [x] 补 Shared/API/Web 契约测试。

## Phase 2：API 控制面查询与写入

- [x] 实现经营模式切换聚合列表及数据范围过滤。
- [x] 校准经营配置列表/详情投影和动作能力。
- [x] 限制人工占用创建来源为 maintenance/operations。
- [x] 验证普通释放和审批式强制释放的权限、版本、幂等及审计。
- [x] 补服务、控制器和集成测试。

## Phase 3：住房长租资格

- [x] 实现复用的住房租约房源资格策略与稳定原因码。
- [x] 收紧 `/housing/unit-candidates` SQL。
- [x] 在 create/submit、审批执行、sign、activate 阶段重验。
- [x] 为历史草稿增加资格投影且不回写历史。
- [x] 补候选、命令流程、统一房源 advisory lock TOCTOU 和无副作用测试。

## Phase 4：Web 三控制面与快捷入口

- [x] 新增 operations 列表与详情。
- [x] 新增 occupancies 列表、详情和人工锁房/释放动作。
- [x] 新增 mode transitions 聚合审计列表。
- [x] 在房源详情增加经营配置/占用快捷入口。
- [x] 在经营配置详情增加配置写入和全量审批式模式切换入口。
- [x] 在住房草稿详情显示资格阻断原因和修复入口。
- [x] 补菜单、guard、client 的基础契约测试及 Windows Chrome 页面可访问性证据。

## Phase 5：质量门与本地 UAT

- [x] 运行首批 Shared、住房资格、菜单及控制面专项单测与回归。
- [x] 运行 Shared build、API/Web typecheck、lint、build。
- [x] 用本地隔离数据启动 API/Web，并完成健康检查及控制面读取 API 补充核验。
- [x] 使用 Windows Chrome 151 `headless=new` + CDP 临时隔离 Profile 完成 desktop 与 390px 验收，18 PASS / 0 FAIL；最终提交 SHA 形成后需重新绑定取证。
- [x] 确认无生产 URL、账号、秘密或数据访问。

## Phase 6：交接

- [x] 更新 task notes、命令、结果、已知风险和剩余人工验收。
- [x] 核对只包含 Issue #251 范围文件。
- [x] 完成 Trellis check：Shared 24/24、API 相关契约 34/34、Web 9/9、专项住房资格 4/4，Shared/API/Web lint、typecheck、build 与 CSS 架构检查通过；API 全量单测 1090 项中 1075 PASS、13 SKIP、2 项仅因容器无法解析宿主 worktree `.git` 指针失败，非业务断言失败。

## 完成条件

- Issue #251 的验收项均有代码或证据闭环。
- P0/P1 产品缺陷为 0；环境或真人签署阻塞单独记录，不伪造完成状态。
- 不自动合并、不自动部署、不声明 `production_ready`。
