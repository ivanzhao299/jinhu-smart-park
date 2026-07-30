# PR192 人工 UAT 与生产就绪设计

## 1. Dual-lane Architecture

```text
Track B technical -> H0 environment -> handoff -> human UAT -> signoffs--+
                         \                                           |
                          Codex releases; no resident agent           +-> readiness evaluator
                                                                     |
Track C technical (parallel, not an H0/H1 prerequisite) -------------+
```

H0/H1 只通过 Track B technical 的不可变 handoff manifest 启动，Track C 与真人 lane
并行推进。human lane 可长期 awaiting；readiness evaluator 只在最终汇合时补验 Track C
technical evidence，读取状态但不会唤醒常驻 agent。只有参与者/签署证据到达或用户明确要求继续时，Codex 才重新进入短时 facilitation。

## 2. Handoff Manifest

handoff 至少包含：

```text
handoff_id, created_at, owner
Track B commit and technical gate verdict
A/B profile versions and checksums
environment URL/build SHA/business clock
role accounts and credential-distribution procedure
task-card version/threshold version
known risks and disabled production flags
evidence upload/privacy/retention rules
reset/cleanup and incident contacts
```

manifest 只存账号标识和领取流程，不存密码、token 或身份明文。H0/H1 manifest
不要求 Track C evidence；Track C commit/gate verdict 由最终 Production Readiness
evidence bundle 补入。hash 固化后，UAT 期间任何 build/profile/任务卡/阈值变化都新建 cohort，不混算旧样本。

## 3. Task-card Design

每张卡描述业务目标、起始入口、必要前置、完成条件和允许设备，不给导航答案。任务按岗位覆盖正常路径、最近错误恢复、权限隔离和至少一个移动关键路径。主持人只解释测试规则，不教产品操作；发生求助要记录。

示例任务类型：

- 前台：从到店队列完成合规入住并处理身份不满足；
- 保洁/检查：领取 turnover、登记异常/耗材/证据并交接；
- 租赁/交割：建租约、签署、入住/退租交割；
- 账单/收银/财务审批：生成、收款、退款/减免/押金审批与核对；
- 采购三权：申请、审批、付款由不同真人完成；
- 审计：按最小权限追溯决策、执行、附件和账务。

## 4. Observation And Metrics

observer 使用统一表单记录匿名 participant、role、task、first/repeat、success、duration、interaction、error、help、severity、notes 和 consent。指标计算器只接受完整 cohort：

- success rate；
- p50/p90 completion time；
- p90 interaction count；
- error/help rate；
- 按 role/device/first-repeat 分层。

阈值文件需要版本、owner、产品/运营批准人与批准时间。样本不足显示 `insufficient_sample`，不能按通过处理。

## 5. Signoff Ledger

signoff 是 append-only ledger：signoff domain、human name/role、decision、handoff/cohort hash、timestamp、conditions、expiry、evidence refs。新证据通过 supersede 旧结论，不覆盖历史。Codex 只验证字段完整性和签名/身份来源，不生成 decision。

## 6. Defect Loop

真人发现经 triage 分为 P0/P1/P2/P3，链接 task/role/build/evidence。P0/P1 立即停止相关 cohort 和生产准备；修复回到技术 owner 与 machine gate。新 build 需要 H0 重跑，受影响岗位使用新 cohort 回归。无影响分析不得沿用旧通过结论。

## 7. Production Readiness Evaluator

evaluator 是纯 AND 计算：

```text
technical(A,B,C)
AND human_metrics_passed
AND required_signoffs_approved
AND stopship_count = 0
AND rollout_ops_ready
```

输出每项状态和缺口，不提供 override。H1 未完成只产生 `awaiting_human_gate`，不会把 Track C 设为 blocked。高风险 production flags 在最终发布批准前保持 off。

## 8. Subagent/Participant Lifecycle

Codex facilitation 可使用短批次：

1. `human-preflight-facilitator`：H0、环境、task cards、阈值模板、handoff。
2. `human-evidence-facilitator`：仅在真人证据到达后校验 cohort、计算指标、回派缺陷。
3. `production-readiness-facilitator`：仅在签署齐备后计算 readiness 与发布清单。

这些不是“用户代表”。H1 handoff 发布后第一批次必须结束并释放 slot；不得启动等待参与者的常驻 subagent。真人岗位代表和签署人存在于 Codex agent 树之外。

## 9. Evidence, Privacy And Cleanup

UAT 只用合成身份和业务数据。截图/录屏需同意并脱敏；证据设 retention 和访问范围。账号在 cohort 结束后回收，测试文件和数据按精确 handoff/profile 清理并 residual scan。签署 ledger、匿名统计和审计证据按发布要求保留，但不得保留密码/token/身份明文。

## 10. Stopship Behavior

P0/P1 使 readiness evaluator 输出 rejected/blocked，并列出 owner 与复验路径。不得通过降低阈值、删样本、把失败标成主持人错误或由 Codex补测来关闭。生产灰度也不能绕过安全、财务、身份或 maker-checker stopship。
