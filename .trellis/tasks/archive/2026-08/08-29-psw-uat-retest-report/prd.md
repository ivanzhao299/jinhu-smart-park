# PSW 队列 UAT 复测与报告

## Goal

在 PSW-001/002/003 与 D5 已合入 `main` 后，用独占本地环境和专用 Windows Chrome profile 重新验证园区切换授权闭环，消除历史 S1b/S2 动态证据缺口与 S3/G6 双 Park ID 歧义，并以可审查报告关闭整个 PSW 队列。

## Confirmed baseline

- PSW-001：PR #466 已合入，Issue #463 已关闭。
- PSW-002：PR #470 已合入，Issue #468 已关闭。
- PSW-003 与 D5：PR #473 已合入，Issue #472 已关闭；GitHub #470 实际是 PSW-002 PR，不能伪记为 PSW-003 Issue。
- 本轮基线为 `origin/main@eee58bb38575e599b87ed1debe039bd3b32f8c77`。
- 历史 §15 报告的 G6 同时出现目标 Park B `25892265` 与 `28379088`，其结论须由本轮同生命周期、单一目标 Park B ID 的新证据取代。

## Requirements

- 固定顺序执行 S1 → S2 → S3 → G1–G7 防回退抽查；不得用静态推断冒充动态 PASS。
- S1a 验证受保护 `SUPER_ADMIN` 切到自己创建的园区仍保持 `SUPER_ADMIN`、`is_super=true`、`*`，并产生 `tenant_super_context_activated` 审计。
- S1b 验证同一 super 切到另一授权主体创建的园区仍保持上述身份与审计；fixture 只走产品 API，不直写业务表。
- S2 验证普通用户 A 有角色、B 仅 access 时：切 B 成功；真实页面进入专用可恢复空态，显示精确文案，保留园区选择器、退出和返回 A；管理员用显式 target-park 配角接口为 B 配角后，用户切 B 正常进入业务页面。
- S2 在桌面和窄窗口执行；请求 390px 级 viewport 并记录 Chrome 实际 viewport，断言无横向溢出，不把 Windows Chrome 的最小窗口冒充 390px 真机。
- S3 使用 A/B 两园区与不同普通角色；所有 fixture、API、浏览器、DB 辅助证据和报告必须引用同一个目标 Park B ID，验证 `/users/me`、角色摘要、Sidebar、route、统计/楼栋数据按 B 收敛且排除 A 数据。
- D5 审计脚本只在本轮独占数据库执行，验证 access-only 用户能被只读报告发现且配角后消失；不在生产执行，不自动授权。
- G1–G7 使用当前仓库权威定义抽查；G6 必须采用本轮新证据，其他组可由当前自动化门禁与必要动态证据共同支持，但必须明确哪些是本轮执行、哪些是历史背景。
- 证据仅存 local-only `/tmp` 或 ignored artifact；报告不得包含密码、token、Cookie、Authorization、连接串、个人敏感信息或签名 URL。
- 使用唯一 compose project、named volumes、loopback ports、Web/API PID 和 Windows Chrome `user-data-dir`；不得操作生产、共享服务、他人容器或主 Chrome。
- 同一失败场景最多两次；环境/fixture FAIL 与产品 FAIL 分开记录，不伪造证据。
- 报告 PR 最多三轮 review，随后 CI、squash merge、main CI/Deploy 双绿；部署清理失败或跳过必须如实报告。

## Acceptance Criteria

- [ ] 设计-实现闭环审计表完成，S1/S2/S3 与 G1–G7 的证据 authority 明确。
- [ ] 独占环境通过 migrate、production-safe seed、bootstrap、strict baseline、health/readiness 和链路归属门禁。
- [ ] S1a、S1b、S2、S3 全部获得本轮动态 PASS；S2 包含专用空态、恢复、显式配角与窄窗口检查。
- [ ] D5 在隔离 fixture 上证明“配角前命中、配角后消失”，且保持只读/租户显式范围。
- [ ] G1–G7 防回退抽查全部 PASS；S3/G6 新证据仅使用一个权威 Park B ID。
- [ ] 更新调查报告、§15 G6 权威状态和新增本轮 UAT 报告，旧双 ID 只保留为历史漂移说明。
- [ ] local-only 证据完成敏感信息扫描、SHA256 manifest、residual/teardown 审计；本轮容器、卷、网络、文件根、业务端口与专用 Chrome profile 均清零。
- [ ] 报告 PR review 不超过三轮，PR CI 绿并 squash merge；main CI 与 Deploy 双绿且生产 Docker cleanup 有成功证据。
- [ ] 全 PASS 后 PSW-001/002/003、UAT 子任务及队列父任务归档，终报准确列出 Issue/PR、D5、UAT 矩阵、归档和遗留风险。

## Out of scope

- 不在本轮修复任何新发现的产品缺陷；若复测发现 FAIL，记录证据并按约束建 Issue/保持任务未归档。
- 不修改 HR、生产数据、生产账号或生产权限。
- 不回写或伪造历史 local-only artifact，不把旧双 ID 证据重新解释为同一生命周期。

## Open questions

无。用户已明确执行顺序、验收矩阵、安全边界与闭环要求。
