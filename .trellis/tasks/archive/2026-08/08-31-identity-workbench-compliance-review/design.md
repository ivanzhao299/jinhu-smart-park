# Investigation Design

## Boundary

本任务是只读产品审计。仓库产品面、数据库、运行环境和生产环境均不修改；唯一写入是调查任务材料与日期化 Markdown 报告。

## Evidence Model

报告按四类证据组织：

1. 设计合同：归档任务的 PRD/design/implement 原文及行号。
2. 实现事实：Web、API、实体/迁移、权限 manifest、测试、民宿/住房消费链和仓库文档的当前 `file:line`。
3. 运行/验证事实：只读静态检索、相关定向测试或现有 CI 结果；不触碰生产。
4. 法规与行业基线：中国政府、全国人大、公安机关等官方公开页面；对无法从公开材料确定的地方标注“需法务确认”。

设计要求先归一化为 `IDY-*`，再映射实现证据，避免以当前代码反推设计。实现状态仅使用：已实现、部分实现、未实现、实现超出设计。

## Investigation Lanes

- Lane A：精读设计任务，提取状态机、字段、证据、核验、生效、幂等、权限、消费方要求。
- Lane B：Web 页面与操作路径、字段展示、脱敏、上传、错误与状态动作。
- Lane C：API/DTO/策略/实体/迁移/文件与日志，特别是数据生命周期和事务边界。
- Lane D：access-manifest 与数据范围、共享委托 `party:identity_update`。
- Lane E：民宿原子入住与住房消费链，确认是否读取 party 身份或仅接受临时证据。
- Lane F：仓库内使用说明、菜单/操作/字段文档一致性。
- Lane G：大陆官方法律与住宿治安登记公开依据。

跨目录、巨量检索交由干净的一轮式探子压缩，主代理完整精读设计基线和最终要引用/评价的关键代码片段，并对重要 `file:line` 抽查。

## Report Structure

1. 范围、方法、证据等级与限制。
2. `IDY-*` 设计要求清单。
3. 设计—实现闭环矩阵。
4. 使用说明核查。
5. 中国大陆运营场景逐项评估。
6. P0/P1/P2 问题清单与整改建议。
7. 用户/产品/法务决策点。
8. 总结、统计与免责声明。

## Compatibility and Migration

调查本身无兼容性或数据库迁移。报告中的建议必须逐条说明若实施是否需要迁移，但不得实施。

## Operational and Rollback Shape

- 从最新 `origin/main` 创建独立 `review/identity-workbench-compliance-20260831` 分支。
- 提交前确认仅任务材料和报告发生变化。
- 推送仅报告分支；PR 合并通过 GitHub，不直接 push main。
- 若报告错误，在合并前修订；合并后使用正常 PR revert，不做历史重写。
