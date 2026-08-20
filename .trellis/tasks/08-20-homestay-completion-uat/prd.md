# 民宿管理完整核查与 UAT 修复闭环

## Goal

以执行时 GitHub `main` 最新提交为唯一事实基线，修复民宿管理静态审计和真实 UAT 中确认的功能、权限、财务、任务、凭证、周转、测试与证据缺口，并按 Issue → Trellis 子任务 → 独立分支/worktree → PR → Codex Review → CI → 合并 → 部署/清理 → 真人 UAT 的流程闭环。

## Confirmed Facts

- 基线仓库为 `ivanzhao299/jinhu-smart-park`，默认分支 `main`；规划时 SHA 为 `6d0afe938e7dd349cfdcf4d4b5ce0f169178464e`。
- 民宿 MVP 主链、canonical 页面、高风险取消/退款/减免审批、owner-scope migration 和 property API release gate 已存在。
- 当前产品矩阵仍为 `uat_pending`、未生产启用；真人岗位 UAT 和具名签署缺失。
- 已确认缺口包括 task assignee scope、task/request deep link、普通财务终态门禁、住客数量/候选范围、凭证遗失、周转转维修闭环、Web 测试门禁、真实 API/浏览器覆盖与证据同步。
- Issue #289 继续承接尚未满足五项 readiness 的高风险动作，不重复创建第二套高风险状态机。

## Requirements

- 所有代码工作从最新 GitHub `main` 的隔离 `codex/` 分支和 worktree 开始，不污染现有脏工作区。
- 每个独立缺口必须绑定 GitHub Issue 与 Trellis 子任务，避免一个巨型 PR 混合无关风险。
- 优先关闭数据隔离、财务终态和 deep-link P1；再处理凭证、维修、Web 结构和 UAT 门禁。
- 财务、实名、入住和审批离线 mutation 本轮保持 fail-closed；不承诺离线写队列。
- 普通财务 action 必须有明确 booking status/action matrix；退款、减免继续走现有审批、权限、幂等、审计和终态保护。
- 现场页面必须用真实 API/角色/数据做桌面与 390px UAT，mock 证据只能作布局辅助。
- 每次推送后触发 `@codex review`；以最新 head 的有效 review 和 CI 状态为准处理旧线程。
- 合并后继续监控 main CI、Deploy Production、health/ready、公开校验、Release Smoke 和 Docker cleanup。

## Acceptance Criteria

- [ ] task list 对 tenant/park/unit/assignee scope 全部 fail-closed，count 与列表一致。
- [ ] `taskId`/`requestId` deep link 可刷新、可返回且不泄露跨 scope 对象。
- [ ] booking/guest/finance 状态、人数、候选和敏感字段规则具备单测与真实 API E2E。
- [ ] 凭证遗失、补发/赔偿与周转异常转维修具有幂等、审计和占用保护。
- [ ] 民宿 Web 测试进入默认 CI；无 dual fetch/mutation owner。
- [ ] API E2E 覆盖并发下单、成功改期、成功 no-show、refund/waiver、跨园区、多角色、文件权限并 residual=0。
- [ ] 桌面、768px、390px、360px 与关键无障碍场景通过真实浏览器 UAT。
- [ ] 所有 P0/P1 清零，P2 修复或书面接受；文档绑定同一 candidate SHA、环境和证据。
- [ ] 每个 PR 当前 head CI 全绿、Codex Review 无重大问题且 mergeable 后合并。
- [ ] 合并后 main CI、部署、健康检查、公开生产保护校验和 Docker cleanup 成功。
- [ ] 真人岗位和具名签署未完成前保持 `uat_pending/awaiting_human_gate`。

## Out of Scope

- OTA、在线支付、智能门锁、公安住宿登记和公开住客自助端。
- 财务、实名、入住、审批的离线 mutation queue。
- 重做 shared property access manifest、审批运行时或部署状态机。
- 用 SUPER_ADMIN、mock 页面或静态截图代替真人岗位 UAT。

## Open Questions

- 无阻塞性产品问题。财务状态矩阵采用本任务 design 中的保守建议；若现有业务规则更严格，以现有规则为下限。
