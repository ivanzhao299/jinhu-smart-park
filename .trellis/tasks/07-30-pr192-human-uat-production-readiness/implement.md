# PR192 人工 UAT 与生产就绪实施计划

## Phase H0 — Codex Facilitation

Owner: `human-preflight-facilitator`

1. 只校验 Track B technical gate evidence、handoff SHA、profile/checksum 和开放缺陷；Track C technical evidence 不属于 H0/H1 前置。
2. 创建隔离 UAT 环境，确认真实秘密/生产身份/生产数据均不存在，高风险开关关闭。
3. 配置精确岗位账号和安全的领取/回收流程；禁止 superuser、wildcard 和宽权限。
4. 与产品/运营/岗位负责人冻结 task-card、样本、success/p90/interaction/error 阈值。
5. 准备 observation、consent、defect、signoff、rollout 模板和隐私/保留规则。
6. 运行 UI 可达性、reset/cleanup、evidence 上传与 readiness evaluator 的机器预检。

Machine gate H0: Track B technical handoff 完整；环境隔离；任务可执行；阈值已由真人 owner 批准；P0/P1=0；不等待 Track C。

## Phase H1 — Publish And Release

1. 发布 immutable handoff manifest、参与者邀请包、任务卡和 incident contact。
2. 将 human status 设置为 `awaiting_participants`，production status 设置为 `awaiting_human_gate`。
3. 明确 Track C technical 与 H1 并行继续，其 evidence 只在 Production Readiness 最终汇合时必需；禁止高风险 production enforce。
4. 结束 `human-preflight-facilitator`，释放 agent/slot。

H1 没有“Codex 等待循环”。不得启动常驻 subagent、定时轮询或 AI 岗位替身。没有真人参与者时，该任务保持 awaiting，而不是技术 blocked。

## Phase H2 — External Human Execution

Owners: 真实岗位代表和现场 UAT coordinator，非 Codex

1. 每岗位招募至少 5 名真实代表，每人执行 4 个标准任务。
2. 在自然 desktop/手机设备完成任务；不提供逐步答案，不预填 UUID，不借用超管。
3. 分别记录首次/重复使用的成功、时长、交互、错误、求助和定性反馈。
4. P0/P1 立即停止受影响 cohort，由 coordinator 通知技术 owner。
5. 环境/build/profile/task/threshold 变化时关闭旧 cohort，新建版本后重跑 H0。

Codex 只可在证据提交后短时介入，校验格式、计算指标和创建缺陷；不能补足真人样本。

## Phase H3 — Defect Re-entry

Owner: `human-evidence-facilitator`，按需短时启动

1. 校验 participant 去重、cohort hash、样本完整性、同意与脱敏。
2. 计算按岗位/设备/first-repeat 分层指标，样本不足标为 insufficient。
3. 将缺陷连到 task/build/evidence，回派对应 Track owner。
4. 修复后要求相关 machine gate、H0 和受影响岗位回归。
5. 报告完成后结束 facilitator；若继续等待真人，恢复 awaiting 且不常驻。

## Phase H4 — Human Signoffs

Owners: 具名真人产品/运营、业务、财务、安全、技术/运维、发布负责人

1. 各签署人审阅匹配其职责的指标、缺陷、账务、安全、回滚和证据。
2. 在 append-only ledger 中提交 approve/reject/conditional。
3. conditional 必须有 owner、截止日期、完成证据和复核人。
4. 未签、过期或条件未关闭均不得计为 approve。

Codex 可以校验 ledger 完整性，不能创建、推断或代签 decision。

## Phase H5 — Production Readiness

Owner: `production-readiness-facilitator`，仅在 H4 证据齐备后短时启动

1. 重验 Track A/B/C technical verdict 和当前 production candidate SHA。
2. 验证真人指标、样本、所有 required signoff 和 P0/P1=0。
3. 验证灰度租户/园区、窗口、feature flags、监控、告警、on-call、备份、RPO/RTO 和回滚演练。
4. 运行纯 AND readiness evaluator，并输出逐项证据与缺口。
5. 只有全部为真且发布负责人明确 go 时标记 `production_ready`；否则保持 awaiting/rejected。

## Machine Validation

实现 facilitator 工具后至少验证：

- handoff/signoff/observation schema；
- cohort hash 与 build/profile 变更隔离；
- participant/task 去重和 `n >= 20/role`；
- first/repeat 分层、p90 算法、insufficient sample；
- required signoff AND 语义；
- P0/P1 stopship、conditional/expiry；
- 测试账号回收、数据/文件 cleanup residual=0；
- 无密码/token/身份明文进入 artifact。

## Required Human Evidence

- 参与者岗位资格与匿名 ID；
- 每任务原始 observation 与同意/脱敏状态；
- 分层指标和失败样本，不得只保留成功汇总；
- 缺陷、修复 SHA、machine rerun、human regression 链；
- 各签署域的具名 decision；
- rollout、监控、on-call、备份与 rollback drill 记录。

## Completion

完成定义是 `production_ready` 的全部机器和真人条件真实满足。若参与者或签署尚未到位，正确结果是发布 handoff、记录 `awaiting_human_gate` 并释放 Codex agent；不得为了关闭任务伪造真人结论。

## 2026-08-14 Technical Closure Handoff

- Candidate handoff artifact:
  `handoff/2026-08-14-technical-closure-to-human-gate.md`.
- Bound production candidate:
  `97669ed2df810c9bc1da0e1abeb271187a7b70a4`.
- Technical remediation lane `#270 -> #271 -> #272 -> #273`, Codex Review
  follow-up `#284`, main CI, production deployment, immediate production
  health, and Docker cleanup are recorded as machine evidence.
- External human UAT, named signoffs, and final `production_ready` remain
  explicitly missing. Current next state remains `awaiting_human_gate`.

## 2026-08-14 Human UAT Kit

- External execution kit:
  `human-uat-kit/README.md`.
- Included templates:
  task cards, observation ledger, threshold freeze, H0 environment handoff,
  signoff ledger, and production readiness evaluator input.
- The kit contains no real participants, credentials, signoff decisions, or
  production go/no-go. It only prepares H1/H2/H4 evidence capture for external
  human coordinators.
- Current next state remains `awaiting_human_gate` until the templates are
  filled by authorized external humans and validated against the PR192 AND gate.
