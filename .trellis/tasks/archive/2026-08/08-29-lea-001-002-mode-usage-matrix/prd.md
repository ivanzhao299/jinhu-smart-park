# LEA-001+002 mode用途联合准入矩阵

## Goal

建立 mode×用途的共享准入合同，使 property control-plane、occupancy、housing 长租、homestay 民宿在候选、写入、审批和 executor 重放阶段使用同一规则，并提供可解释的 picker 投影与只读存量审计。

## Requirements

- shared 定义住房 70、办公 10 命名常量及 `long_rent=[70,10]`、`short_stay=[70]` 准入合同。
- 用途不符合的资格 reason 改为业务中性 machine-readable code，不再使用 `NOT_HOUSING` 语义。
- picker 返回 `usage_type`、由用途派生且不持久化的 `rental_segment`、`eligible`、`ineligible_reasons`，并支持用途 facet。
- property control-plane/occupancy 从单值 70 改为按目标/current mode 查 allowlist。
- housing picker 与创建/提交/审批/签署等最终写入共用同一 long-rent 准入策略。
- homestay 候选、dashboard availability、rates、transaction support 与最终 occupancy 写入补齐 short-stay 用途过滤。
- mode transition 申请和 executor 重放都在 unit lock 下校验目标 mode 用途 allowlist。
- 用途变更在 unit lock 下验证当前 mode、待审批 transition 及住房/民宿/商业合同等活动；跨类别保持独立审批边界。
- 统计/展示可区分“住宅长租”与“办公长租”。
- 交付 D9 只读 SQL：审计非准入用途的 short_stay/long_rent、mode 与 rental_status 矛盾、住房/商业合同交叉；不自动修改存量数据。
- 个人/标准化长期居住走住宅长租；企业办公及商业条款走商业租赁；housing allowlist 仍含办公 10 支持个人/小团队办公。

## Acceptance Criteria

- [x] 矩阵正例：住房/办公 long_rent、住房 short_stay；反例：办公 short_stay、厂房 long_rent。
- [x] 候选、预检、最终写入、mode executor 不存在策略差异，拒绝返回稳定中性 reason。
- [x] picker 返回用途 facet、派生 segment 及 eligible/ineligible reasons，不增加持久化列。
- [x] 并发/version CAS、occupancy/商业合同冲突、用途变更保护有回归测试。
- [x] D9 SQL 全程只读、租户/园区范围明确、输出可人工处置的冲突明细。
- [x] shared/API/Web 相关 lint、typecheck、build 与定向测试通过，review/CI/main 双绿闭环。

## Out of Scope

- 不改 `housing_*` 权限码和 housing API 路径。
- 不把 `rental_segment` 持久化，不新增用途值。
- 不自动清洗或修正存量冲突数据。
- 不在本 PR 执行“长租经营”全量改名或 rental_status 自动同步。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
